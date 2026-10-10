// ============================================
// MITTELY — newsletter-subscribe Edge Function
// POST { email }
// Upserts email into newsletter table.
// Idempotent — duplicate submissions are no-ops.
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

function isValidEmail(email: string): boolean {
  if (!email || email.length > 254) return false;
  // Simple RFC-ish check — server authoritative
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ ok: false, reason: "server_misconfigured" }, 500, origin);
  }

  let payload: { email?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ ok: false, reason: "invalid_json" }, 400, origin);
  }

  const email = (payload.email || "").trim().toLowerCase();
  if (!isValidEmail(email)) {
    return json({ ok: false, reason: "invalid_email" }, 400, origin);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const { error } = await supabase
      .from("newsletter")
      .upsert({ email }, { onConflict: "email", ignoreDuplicates: false });

    if (error) {
      // Unique violation is fine (already subscribed)
      if ((error as any).code === "23505") {
        return json({ ok: true, already: true }, 200, origin);
      }
      return json({ ok: false, reason: "insert_failed", detail: error.message }, 500, origin);
    }

    return json({ ok: true }, 200, origin);
  } catch (e) {
    return json({ ok: false, reason: "unexpected_error" }, 500, origin);
  }
});