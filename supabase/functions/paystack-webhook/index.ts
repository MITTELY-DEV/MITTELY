// ============================================================================
// MITTELY — Edge Function: paystack-webhook
// Verifies x-paystack-signature (HMAC-SHA512) and updates order status on
// charge.success / charge.failed. Deploy and register the URL in Paystack.
// URL: https://<project-ref>.supabase.co/functions/v1/paystack-webhook
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PAYSTACK_SECRET_KEY = Deno.env.get("PAYSTACK_SECRET_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

async function hmacSha512Hex(key: string, msg: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(msg));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, reason: "method_not_allowed" }), {
      status: 405, headers: { "content-type": "application/json" },
    });
  }

  if (!PAYSTACK_SECRET_KEY || !SUPABASE_URL || !SERVICE_ROLE) {
    return new Response(JSON.stringify({ ok: false, reason: "server_not_configured" }), {
      status: 500, headers: { "content-type": "application/json" },
    });
  }

  const raw = await req.text();
  const signature = req.headers.get("x-paystack-signature") ?? "";
  const expected = await hmacSha512Hex(PAYSTACK_SECRET_KEY, raw);

  if (!signature || signature.toLowerCase() !== expected.toLowerCase()) {
    return new Response(JSON.stringify({ ok: false, reason: "invalid_signature" }), {
      status: 401, headers: { "content-type": "application/json" },
    });
  }

  let event: any;
  try { event = JSON.parse(raw); }
  catch { return new Response(JSON.stringify({ ok: false, reason: "bad_json" }), { status: 400 }); }

  const eventName = String(event?.event || "");
  const reference = String(event?.data?.reference || "");
  if (!reference) {
    return new Response(JSON.stringify({ ok: true, ignored: true }), { status: 200 });
  }

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  if (eventName === "charge.success") {
    // Only downgrade pending -> success; never downgrade a success back.
    await sb.from("orders").update({ status: "success" }).eq("paystack_reference", reference).eq("status", "pending");
  } else if (eventName === "charge.failed") {
    await sb.from("orders").update({ status: "failed" }).eq("paystack_reference", reference).eq("status", "pending");
  } else if (eventName === "refund.processed") {
    // Optional: mark refunds — schema does not track refunds, so we log activity.
    const { data: order } = await sb.from("orders").select("email,id").eq("paystack_reference", reference).maybeSingle();
    if (order?.email) {
      await sb.rpc("log_activity", {
        p_email: order.email, p_event: "order",
        p_meta: { refunded: true, reference },
      }).catch(() => {});
    }
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200, headers: { "content-type": "application/json" },
  });
});