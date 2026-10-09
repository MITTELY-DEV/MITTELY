// ============================================================================
// MITTELY — Edge Function: verify-payment
// POST { reference, items[], currency, coupon_code? }
// Verifies a Paystack charge server-side, recomputes the total in USD,
// inserts the order, increments counters, credits designer wallets.
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PAYSTACK_SECRET_KEY = Deno.env.get("PAYSTACK_SECRET_KEY") ?? "";
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

// Fetch live USD -> GHS with fallback to settings.
async function getFxRate(sb: ReturnType<typeof createClient>): Promise<number> {
  try {
    const r = await fetch("https://open.er-api.com/v6/latest/USD", { cache: "no-store" });
    const data = await r.json();
    const rate = Number(data?.rates?.GHS);
    if (isFinite(rate) && rate > 0) return rate;
  } catch (_) { /* fall through */ }
  try {
    const { data } = await sb.from("settings").select("svalue").eq("skey", "fx_fallback_rate").maybeSingle();
    const fb = Number(data?.svalue);
    if (isFinite(fb) && fb > 0) return fb;
  } catch (_) { /* fall through */ }
  return 15.5;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json({ ok: false, reason: "method_not_allowed" }, 405, req);

  if (!PAYSTACK_SECRET_KEY || !SUPABASE_URL || !SERVICE_ROLE) {
    return json({ ok: false, reason: "server_not_configured" }, 500, req);
  }

  let body: { reference?: string; items?: Array<{ slug: string; license?: string; qty?: number }>; currency?: string; coupon_code?: string | null };
  try { body = await req.json(); } catch { return json({ ok: false, reason: "bad_json" }, 400, req); }

  const { reference, items, currency, coupon_code } = body;
  if (!reference || !Array.isArray(items) || !items.length) return json({ ok: false, reason: "missing_fields" }, 400, req);

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  // Reject duplicates early.
  const existing = await sb.from("orders").select("id").eq("paystack_reference", reference).maybeSingle();
  if (existing.data) return json({ ok: true, order_id: existing.data.id, duplicate: true }, 200, req);

  // 1) Verify with Paystack.
  const payRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
  });
  const payJson = await payRes.json();
  if (!payJson?.status || payJson?.data?.status !== "success") {
    return json({ ok: false, reason: "paystack_not_successful" }, 200, req);
  }
  const paystackAmount = Number(payJson.data.amount);       // smallest unit (cents/pesewas)
  const paystackCurrency = String(payJson.data.currency || "").toUpperCase();
  const paystackEmail = String(payJson.data.customer?.email || "").toLowerCase();
  if (!paystackEmail) return json({ ok: false, reason: "no_customer_email" }, 200, req);

  // 2) Recompute expected USD total server-side.
  const slugs = items.map((i) => i.slug);
  const { data: products, error: prodErr } = await sb.from("products")
    .select("id,title,slug,price,sale_price,is_free,is_published,designer_email,download_path")
    .in("slug", slugs);
  if (prodErr || !products) return json({ ok: false, reason: "products_lookup_failed" }, 200, req);

  const { data: licenses } = await sb.from("licenses").select("name,price_multiplier");
  const multMap: Record<string, number> = { standard: 1, extended: 3 };
  (licenses ?? []).forEach((l) => { multMap[String(l.name).toLowerCase()] = Number(l.price_multiplier) || 1; });

  const bySlug: Record<string, any> = {};
  products.forEach((p) => { bySlug[p.slug] = p; });

  let subtotalUsd = 0;
  const orderItems: Array<{ product_id: string; price_paid: number; license: string; title: string; designer_email: string | null }> = [];

  for (const raw of items) {
    const p = bySlug[raw.slug];
    if (!p || p.is_published === false) return json({ ok: false, reason: `unavailable:${raw.slug}` }, 200, req);
    const qty = Math.max(1, Math.min(99, Number(raw.qty) || 1));
    const licKey = raw.license === "extended" ? "extended" : "standard";
    const mult = multMap[licKey] ?? (licKey === "extended" ? 3 : 1);
    const base = (p.sale_price != null && Number(p.sale_price) > 0) ? Number(p.sale_price) : Number(p.price);
    const unit = (p.is_free ? 0 : base) * mult;
    subtotalUsd += unit * qty;
    orderItems.push({
      product_id: p.id,
      price_paid: unit,
      license: licKey,
      title: p.title,
      designer_email: p.designer_email ? String(p.designer_email).toLowerCase() : null,
    });
  }
  subtotalUsd = Math.round(subtotalUsd * 100) / 100;

  // 3) Coupon validation (server-side, fail-closed).
  let discountUsd = 0;
  let appliedCoupon: string | null = null;
  if (coupon_code) {
    const code = String(coupon_code).trim().toUpperCase();
    const { data: c } = await sb.from("coupons").select("*").eq("code", code).maybeSingle();
    if (c && c.is_active) {
      const expired = c.expires_at && new Date(c.expires_at).getTime() < Date.now();
      const usedUp = c.max_uses != null && Number(c.used_count) >= Number(c.max_uses);
      const minOk = Number(c.min_subtotal || 0) <= subtotalUsd;
      if (!expired && !usedUp && minOk) {
        if (c.type === "percent") discountUsd = subtotalUsd * (Number(c.value) / 100);
        else if (c.type === "fixed") discountUsd = Math.min(subtotalUsd, Number(c.value));
        discountUsd = Math.round(discountUsd * 100) / 100;
        appliedCoupon = code;
      }
    }
  }
  const totalUsd = Math.max(0, Math.round((subtotalUsd - discountUsd) * 100) / 100);

  // 4) Convert USD -> selected currency with fx.
  const fx = await getFxRate(sb);
  const expectedSmallest = currency === "GHS"
    ? Math.round(totalUsd * fx * 100)
    : Math.round(totalUsd * 100);

  const tolerance = 1; // smallest unit
  if (Math.abs(expectedSmallest - paystackAmount) > tolerance) {
    return json({
      ok: false,
      reason: "amount_mismatch",
      expected: expectedSmallest,
      received: paystackAmount,
    }, 200, req);
  }
  if (currency && paystackCurrency && currency.toUpperCase() !== paystackCurrency) {
    return json({ ok: false, reason: "currency_mismatch" }, 200, req);
  }

  // 5) Insert order + items.
  const finalCurrency = currency === "GHS" ? "GHS" : "USD";
  const paystackAmountDecimal = Number((paystackAmount / 100).toFixed(2));

  const { data: orderRow, error: orderErr } = await sb.from("orders").insert({
    paystack_reference: reference,
    email: paystackEmail,
    name: payJson.data.customer?.first_name || payJson.data.customer?.last_name || null,
    amount: paystackAmountDecimal,
    currency: finalCurrency,
    usd_amount: totalUsd,
    fx_rate_used: finalCurrency === "GHS" ? fx : 1,
    coupon_code: appliedCoupon,
    discount_usd: discountUsd,
    status: "success",
  }).select("id").single();

  if (orderErr || !orderRow) return json({ ok: false, reason: "order_insert_failed" }, 200, req);

  await sb.from("order_items").insert(orderItems.map((it) => ({
    order_id: orderRow.id,
    product_id: it.product_id,
    price_paid: it.price_paid,
    license: it.license,
  })));

  // Increment coupon usage.
  if (appliedCoupon) {
    await sb.rpc("increment_coupon_uses", { p_code: appliedCoupon }).catch(() => {});
    await sb.from("coupons").select("used_count").eq("code", appliedCoupon).maybeSingle();
    // Fallback safe increment.
    try {
      const { data: c } = await sb.from("coupons").select("used_count").eq("code", appliedCoupon).maybeSingle();
      if (c) await sb.from("coupons").update({ used_count: Number(c.used_count || 0) + 1 }).eq("code", appliedCoupon);
    } catch (_) { /* noop */ }
  }

  // 6) Post-commit side effects: sales counters, wallet credits, activity log.
  for (const it of orderItems) {
    await sb.rpc("increment_sales_count", { p_id: it.product_id }).catch(() => {});
    await sb.rpc("log_activity", {
      p_email: paystackEmail,
      p_event: "order",
      p_meta: { product_id: it.product_id, order_id: orderRow.id, price: it.price_paid, license: it.license },
    }).catch(() => {});

    if (it.designer_email) {
      const payout = Math.round(it.price_paid * 0.70 * 100) / 100;
      await sb.rpc("credit_wallet", {
        p_email: it.designer_email,
        p_amount: payout,
        p_type: "earning",
        p_note: `Sale: ${it.title} - order ${reference}`,
      }).catch(() => {});
    }
  }

  return json({ ok: true, order_id: orderRow.id, total_usd: totalUsd, discount_usd: discountUsd }, 200, req);
});