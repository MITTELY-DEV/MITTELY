// ============================================================================
// MITTELY — Edge Function: create-download-url
// POST { product_id, order_reference? }
// Auth required. Free item OR paid order owned by caller -> 60s signed URL.
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "http://localhost:5173,http://localhost:3000").split(",");

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function json(body: unknown, status = 200, req?: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...(req ? cors(req) : {}) },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json({ ok: false, reason: "method_not_allowed" }, 405, req);

  if (!SUPABASE_URL || !SERVICE_ROLE || !ANON_KEY) {
    return json({ ok: false, reason: "server_not_configured" }, 500, req);
  }

  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return json({ ok: false, reason: "auth_required" }, 401, req);
  }

  let body: { product_id?: string; order_reference?: string };
  try { body = await req.json(); } catch { return json({ ok: false, reason: "bad_json" }, 400, req); }
  const productId = String(body.product_id || "");
  const orderRef = body.order_reference ? String(body.order_reference) : null;
  if (!productId) return json({ ok: false, reason: "missing_product_id" }, 400, req);

  // User-scoped client to identify the caller via their JWT.
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user?.email) return json({ ok: false, reason: "invalid_session" }, 401, req);
  const callerEmail = user.email.toLowerCase();

  // Service-role client for privileged reads + signed URL creation.
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  const { data: product } = await sb.from("products")
    .select("id,title,is_free,is_published,download_path,designer_email")
    .eq("id", productId).maybeSingle();
  if (!product || product.is_published === false) return json({ ok: false, reason: "product_not_found" }, 404, req);

  const isAdminRow = await sb.rpc("is_admin_rpc"); // will be false for user-scoped; do explicit check below
  const { data: adminRow } = await sb.from("admin_users").select("email").eq("email", callerEmail).maybeSingle();
  const callerIsAdmin = !!adminRow;

  let allowed = false;
  let reason = "";

  if (product.is_free) {
    allowed = true;
  } else if (orderRef) {
    const { data: order } = await sb.from("orders")
      .select("id,email,status")
      .eq("paystack_reference", orderRef)
      .maybeSingle();
    if (order && order.status === "success" && (order.email.toLowerCase() === callerEmail || callerIsAdmin)) {
      const { data: line } = await sb.from("order_items")
        .select("id").eq("order_id", order.id).eq("product_id", product.id).maybeSingle();
      if (line) allowed = true;
      else reason = "item_not_in_order";
    } else {
      reason = "order_not_found_or_not_owned";
    }
  } else {
    // Any successful order by the caller containing this product.
    const { data: owned } = await sb.from("orders")
      .select("id,status,order_items!inner(product_id)")
      .eq("email", callerEmail)
      .eq("status", "success")
      .eq("order_items.product_id", product.id)
      .limit(1);
    if (owned && owned.length) allowed = true;
    else reason = "no_purchase_found";
  }

  if (!allowed) return json({ ok: false, reason: reason || "forbidden" }, 403, req);

  if (!product.download_path) {
    return json({ ok: false, reason: "no_file_attached" }, 404, req);
  }

  // Create a 60-second signed URL.
  const { data: signed, error: signErr } = await sb.storage
    .from("downloads")
    .createSignedUrl(product.download_path, 60, { download: true });

  if (signErr || !signed?.signedUrl) {
    return json({ ok: false, reason: "sign_failed", detail: signErr?.message }, 500, req);
  }

  // Log activity + increment download counter (best effort).
  await sb.rpc("log_activity", {
    p_email: callerEmail,
    p_event: "download",
    p_meta: { product_id: product.id, title: product.title },
  }).catch(() => {});
  await sb.rpc("increment_download_count", { p_id: product.id }).catch(() => {});

  return json({ ok: true, url: signed.signedUrl, expires_in: 60 }, 200, req);
});