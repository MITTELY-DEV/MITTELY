// ============================================
// MITTELY — paystack-webhook Edge Function
// Verifies x-paystack-signature (HMAC-SHA512),
// updates order status on charge.success /
// charge.failed. Idempotent: will not overwrite
// a success with a failure.
// ============================================

import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const encoder = new TextEncoder();

async function verifySignature(rawBody: string, signature: string, secret: string): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-512" },
      false,
      ["sign"],
    );
    const sigBuf = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
    const computed = Array.from(new Uint8Array(sigBuf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    // constant-time-ish compare
    if (computed.length !== signature.length) return false;
    let diff = 0;
    for (let i = 0; i < computed.length; i++) {
      diff |= computed.charCodeAt(i) ^ signature.charCodeAt(i);
    }
    return diff === 0;
  } catch {
    return false;
  }
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const PAYSTACK_SECRET_KEY = Deno.env.get("PAYSTACK_SECRET_KEY");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!PAYSTACK_SECRET_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response("Server misconfigured", { status: 500 });
  }

  const signature = req.headers.get("x-paystack-signature") || "";
  const rawBody = await req.text();

  const valid = await verifySignature(rawBody, signature, PAYSTACK_SECRET_KEY);
  if (!valid) {
    return new Response("Invalid signature", { status: 401 });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const eventType: string = event?.event || "";
  const data = event?.data || {};
  const reference: string = data?.reference || "";

  if (!reference) {
    return new Response("Missing reference", { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    if (eventType === "charge.success") {
      // Only update if not already success (idempotent)
      await supabase
        .from("orders")
        .update({ status: "success" })
        .eq("paystack_reference", reference)
        .neq("status", "success");
    } else if (eventType === "charge.failed") {
      // Do NOT downgrade an existing success order
      await supabase
        .from("orders")
        .update({ status: "failed" })
        .eq("paystack_reference", reference)
        .eq("status", "pending");
    }
    // Other events are acknowledged but ignored.
  } catch (e) {
    return new Response("Processing error", { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});