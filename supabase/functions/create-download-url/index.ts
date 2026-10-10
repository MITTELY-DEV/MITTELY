// ============================================
// MITTELY — create-download-url Edge Function
// POST { product_id, order_reference? }
// Auth required. Grants a 60s signed URL if:
//   - product.is_free = true, OR
//   - caller has a successful order containing
//     that product (matching email), OR
//   - caller is admin.
// Logs activity ('download') and increments the
// product download_count.
// ============================================

import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://mittely.com",
  "https://www.mittely.com",
  "http://localhost:3000",
  "http://localhost:5173",
  "http://127.0.0.1:5500",
];

function corsHeaders(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
}

function json(body: unknown, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) });
  }
  if (req.method !== "POST") {
    return json({ ok: false, reason: "method_not_allowed" }, 405, origin);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ ok: false, reason: "server_misconfigured" }, 500, origin);
  }

  // Verify caller session
  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return json({ ok: false, reason: "unauthorized" }, 401, origin);
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user?.email) {
    return json({ ok: false, reason: "unauthorized" }, 401, origin);
  }
  const callerEmail = userData.user.email;

  let payload: { product_id?: string; order_reference?: string | null };
  try {
    payload = await req.json();
  } catch {
    return json({ ok: false, reason: "invalid_json" }, 400, origin);
  }

  const productId = (payload.product_id || "").trim();
  const orderReference = payload.order_reference ? String(payload.order_reference).trim() : null;
  if (!productId) {
    return json({ ok: false, reason: "missing_product_id" }, 400, origin);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Is caller admin?
  const { data: adminRow } = await admin
    .from("admin_users").select("email").eq("email", callerEmail).maybeSingle();
  const isAdmin = !!adminRow;

  // Load product
  const { data: product, error: prodErr } = await admin
    .from("products")
    .select("id, title, is_free, is_published, download_path")
    .eq("id", productId)
    .maybeSingle();

  if (prodErr || !product) {
    return json({ ok: false, reason: "product_not_found" }, 404, origin);
  }
  if (!product.is_published && !isAdmin) {
    return json({ ok: false, reason: "not_available" }, 403, origin);
  }
  if (!product.download_path) {
    return json({ ok: false, reason: "no_download_available" }, 404, origin);
  }

  // Authorization check
  let allowed = false;
  if (isAdmin) {
    allowed = true;
  } else if (product.is_free) {
    allowed = true;
  } else {
    // Look for a successful order by caller containing this product
    let orderQuery = admin
      .from("orders")
      .select("id, paystack_reference, email, status")
      .eq("email", callerEmail)
      .eq("status", "success");
    if (orderReference) orderQuery = orderQuery.eq("paystack_reference", orderReference);

    const { data: orders } = await orderQuery;
    if (orders && orders.length) {
      const orderIds = orders.map((o) => o.id);
      const { data: items } = await admin
        .from("order_items")
        .select("order_id, product_id")
        .in("order_id", orderIds)
        .eq("product_id", productId);
      if (items && items.length) allowed = true;
    }
  }

  if (!allowed) {
    return json({ ok: false, reason: "forbidden" }, 403, origin);
  }

  // Generate signed URL (60 seconds)
  const { data: signed, error: signErr } = await admin
    .storage
    .from("downloads")
    .createSignedUrl(product.download_path, 60);

  if (signErr || !signed?.signedUrl) {
    return json({ ok: false, reason: "sign_failed", detail: signErr?.message }, 500, origin);
  }

  // Log activity + increment counter (best-effort)
  try {
    await admin.from("activity_log").insert({
      email: callerEmail,
      event: "download",
      meta: { product_id: product.id, order_reference: orderReference },
    });
  } catch { /* ignore */ }

  try {
    await admin.rpc("increment_download_count", { p_product_id: product.id });
  } catch { /* ignore */ }

  return json({ ok: true, url: signed.signedUrl, expires_in: 60 }, 200, origin);
});