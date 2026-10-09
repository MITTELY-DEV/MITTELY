// ============================================================================
// MITTELY — Edge Function: newsletter-subscribe
// POST { email }
// Upserts the email into the newsletter table. Idempotent. CORS-safe.
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
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

function isEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json({ ok: false, reason: "method_not_allowed" }, 405, req);

  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return json({ ok: false, reason: "server_not_configured" }, 500, req);
  }

  let body: { email?: string };
  try { body = await req.json(); } catch { return json({ ok: false, reason: "bad_json" }, 400, req); }

  const email = String(body.email || "").trim().toLowerCase();
  if (!isEmail(email)) return json({ ok: false, reason: "invalid_email" }, 400, req);

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  const { error } = await sb.from("newsletter")
    .upsert({ email }, { onConflict: "email" });

  if (error) return json({ ok: false, reason: "insert_failed", detail: error.message }, 500, req);

  return json({ ok: true }, 200, req);
});