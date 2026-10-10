// ============================================
// MITTELY — verify-payment Edge Function
// POST { reference, items, currency, coupon_code? }
// Verifies with Paystack, recomputes USD total
// server-side, validates coupon, inserts order +
// order_items, increments counters, logs activity.
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

interface ItemInput {
  product_id: string;
  license?: string;
  qty?: number;
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
  const PAYSTACK_SECRET_KEY = Deno.env.get("PAYSTACK_SECRET_KEY");

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !PAYSTACK_SECRET_KEY) {
    return json({ ok: false, reason: "server_misconfigured" }, 500, origin);
  }

  let payload: { reference?: string; items?: ItemInput[]; currency?: string; coupon_code?: string | null };
  try {
    payload = await req.json();
  } catch {
    return json({ ok: false, reason: "invalid_json" }, 400, origin);
  }

  const reference = (payload.reference || "").trim();
  const items = Array.isArray(payload.items) ? payload.items : [];
  const currency = payload.currency === "GHS" ? "GHS" : "USD";
  const couponCode = payload.coupon_code ? String(payload.coupon_code).toUpperCase().trim() : null;

  if (!reference) return json({ ok: false, reason: "missing_reference" }, 400, origin);
  if (!items.length) return json({ ok: false, reason: "empty_cart" }, 400, origin);

  // -------- 1. Verify with Paystack --------
  let paystackData: any;
  try {
    const psRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
    });
    paystackData = await psRes.json();
  } catch {
    return json({ ok: false, reason: "paystack_unreachable" }, 502, origin);
  }
  if (!paystackData || paystackData.status !== true || !paystackData.data) {
    return json({ ok: false, reason: "paystack_verification_failed" }, 400, origin);
  }
  const tx = paystackData.data;
  if (tx.status !== "success") {
    return json({ ok: false, reason: "transaction_not_successful", status: tx.status }, 400, origin);
  }
  const paystackAmount = Number(tx.amount) || 0; // smallest unit
  const paystackCurrency = (tx.currency || "").toUpperCase();

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // -------- 2. Recompute subtotal in USD --------
  const productIds = items.map((i) => i.product_id).filter(Boolean);
  const { data: products, error: prodErr } = await supabase
    .from("products")
    .select("id, price, sale_price, is_free, download_path")
    .in("id", productIds);
  if (prodErr || !products || !products.length) {
    return json({ ok: false, reason: "products_not_found" }, 400, origin);
  }

  const { data: licenses } = await supabase.from("licenses").select("name, price_multiplier");
  const licenseMultipliers: Record<string, number> = {};
  (licenses || []).forEach((l: any) => {
    licenseMultipliers[String(l.name).toLowerCase()] = Number(l.price_multiplier) || 1;
  });
  if (!licenseMultipliers["standard"]) licenseMultipliers["standard"] = 1;
  if (!licenseMultipliers["extended"]) licenseMultipliers["extended"] = 3;

  const productMap: Record<string, any> = {};
  products.forEach((p: any) => { productMap[p.id] = p; });

  let subtotalUsd = 0;
  const lineItems: Array<{ product_id: string; price_paid: number; license: string }> = [];

  for (const it of items) {
    const p = productMap[it.product_id];
    if (!p) return json({ ok: false, reason: "unknown_product", product_id: it.product_id }, 400, origin);
    const licenseKey = (it.license || "standard").toLowerCase();
    const mult = licenseMultipliers[licenseKey] ?? licenseMultipliers["standard"];
    const basePrice = p.sale_price != null && Number(p.sale_price) > 0
      ? Number(p.sale_price)
      : Number(p.price) || 0;
    const linePrice = basePrice * mult;
    subtotalUsd += linePrice;
    lineItems.push({ product_id: p.id, price_paid: linePrice, license: licenseKey });
  }
  subtotalUsd = Number(subtotalUsd.toFixed(2));

  // -------- 3. Validate coupon --------
  let discountUsd = 0;
  let couponUsed: any = null;
  if (couponCode) {
    const { data: coupon } = await supabase
      .from("coupons")
      .select("*")
      .eq("code", couponCode)
      .maybeSingle();
    if (!coupon) return json({ ok: false, reason: "invalid_coupon" }, 400, origin);
    if (!coupon.is_active) return json({ ok: false, reason: "coupon_inactive" }, 400, origin);
    if (coupon.expires_at && new Date(coupon.expires_at).getTime() < Date.now()) {
      return json({ ok: false, reason: "coupon_expired" }, 400, origin);
    }
    if (coupon.max_uses != null && coupon.used_count >= coupon.max_uses) {
      return json({ ok: false, reason: "coupon_exhausted" }, 400, origin);
    }
    if (Number(coupon.min_subtotal) > 0 && subtotalUsd < Number(coupon.min_subtotal)) {
      return json({ ok: false, reason: "coupon_min_not_met" }, 400, origin);
    }
    if (coupon.type === "percent") {
      discountUsd = Number((subtotalUsd * (Number(coupon.value) / 100)).toFixed(2));
    } else if (coupon.type === "fixed") {
      discountUsd = Math.min(subtotalUsd, Number(coupon.value) || 0);
    }
    couponUsed = coupon;
  }
  const totalUsd = Math.max(0, Number((subtotalUsd - discountUsd).toFixed(2)));

  // -------- 4. Convert to selected currency via get_fx_rate --------
  const { data: fxData } = await supabase.rpc("get_fx_rate");
  const fxRate = Number(fxData) > 0 ? Number(fxData) : 1;

  let expectedAmountSmallest: number;
  if (currency === "GHS") {
    expectedAmountSmallest = Math.round(totalUsd * fxRate * 100);
  } else {
    expectedAmountSmallest = Math.round(totalUsd * 100);
  }

  // -------- 5. Compare to Paystack amount (±1 unit tolerance) --------
  if (paystackCurrency !== currency) {
    return json({ ok: false, reason: "currency_mismatch", expected: currency, actual: paystackCurrency }, 400, origin);
  }
  const delta = Math.abs(paystackAmount - expectedAmountSmallest);
  if (delta > 1) {
    return json({
      ok: false,
      reason: "amount_mismatch",
      expected: expectedAmountSmallest,
      actual: paystackAmount,
    }, 400, origin);
  }

  // -------- 6. Check for duplicate reference --------
  const { data: existingOrder } = await supabase
    .from("orders").select("id").eq("paystack_reference", reference).maybeSingle();
  if (existingOrder && existingOrder.id) {
    return json({ ok: true, order_id: existingOrder.id, duplicate: true }, 200, origin);
  }

  // -------- 7. Insert order --------
  const orderEmail = tx.customer?.email || null;
  const orderName = tx.customer?.first_name
    ? `${tx.customer.first_name} ${tx.customer.last_name || ""}`.trim()
    : (tx.customer?.email || null);

  const usdAmount = totalUsd;
  const paidAmount = currency === "GHS"
    ? Number((totalUsd * fxRate).toFixed(2))
    : totalUsd;

  const { data: orderRow, error: orderErr } = await supabase
    .from("orders")
    .insert({
      paystack_reference: reference,
      email: orderEmail,
      name: orderName,
      amount: paidAmount,
      currency,
      usd_amount: usdAmount,
      fx_rate_used: currency === "GHS" ? fxRate : 1,
      coupon_code: couponUsed ? couponUsed.code : null,
      discount_usd: discountUsd,
      status: "success",
    })
    .select("id")
    .single();

  if (orderErr || !orderRow) {
    return json({ ok: false, reason: "order_insert_failed", detail: orderErr?.message }, 500, origin);
  }

  const orderId = orderRow.id;

  // -------- 8. Insert order items + increment counters --------
  const orderItemsPayload = lineItems.map((li) => ({
    order_id: orderId,
    product_id: li.product_id,
    price_paid: li.price_paid,
    license: li.license,
  }));

  const { error: itemsErr } = await supabase.from("order_items").insert(orderItemsPayload);
  if (itemsErr) {
    return json({ ok: false, reason: "order_items_insert_failed", detail: itemsErr.message }, 500, origin);
  }

  for (const li of lineItems) {
    await supabase.rpc("increment_sales_count", { p_product_id: li.product_id });
  }

  // -------- 9. Increment coupon usage --------
  if (couponUsed) {
    await supabase
      .from("coupons")
      .update({ used_count: (couponUsed.used_count || 0) + 1 })
      .eq("id", couponUsed.id);
  }

  // -------- 10. Log activity (per item) --------
  if (orderEmail) {
    for (const li of lineItems) {
      await supabase.from("activity_log").insert({
        email: orderEmail,
        event: "order",
        meta: {
          order_id: orderId,
          product_id: li.product_id,
          license: li.license,
          usd_amount: li.price_paid,
        },
      });
    }
  }

  return json({ ok: true, order_id: orderId }, 200, origin);
});