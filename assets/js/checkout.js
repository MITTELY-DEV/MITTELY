/* ============================================
   MITTELY — checkout.js
   Paystack inline checkout, verify-payment
   edge function call, order success/failed
   initialisation, download links, invoice print.
   ============================================ */
(function () {
  'use strict';

  if (!window.MITTELY) window.MITTELY = {};

  var esc = function (s) { return window.MITTELY.main ? window.MITTELY.main.escapeHtml(s) : String(s || ''); };
  var toast = function (m, t) { if (window.MITTELY.main) window.MITTELY.main.toast(m, t); };
  var money = function (n, cur) {
    if (window.MITTELY.currency && window.MITTELY.currency.formatMoney) {
      return window.MITTELY.currency.formatMoney(n);
    }
    return '$' + Number(n || 0).toFixed(2);
  };

  var orderState = null;

  /* ---------- Currency display helper ---------- */

  function chargeCurrency() {
    return (window.MITTELY.currency && window.MITTELY.currency.getCurrent) ?
      window.MITTELY.currency.getCurrent() : 'USD';
  }

  function chargeAmount(usdTotal) {
    var cur = chargeCurrency();
    if (cur === 'GHS' && window.MITTELY.currency && window.MITTELY.currency.convert) {
      return Math.round(window.MITTELY.currency.convert(usdTotal) * 100);
    }
    return Math.round(Number(usdTotal) * 100);
  }

  /* ---------- Checkout page ---------- */

  async function renderCheckout() {
    var mainEl = document.getElementById('checkoutMain');
    var gateEl = document.getElementById('checkoutAuthGate');
    var items = await window.MITTELY.cart.refreshFromDb();
    var coupon = window.MITTELY.cart.readCoupon();

    var sub = window.MITTELY.cart.subtotalUSD();
    var disc = coupon ? computeCouponDiscount(coupon, sub) : 0;
    var tot = Math.max(0, sub - disc);

    var subtotalEl = document.getElementById('checkoutSubtotal');
    var totalEl = document.getElementById('checkoutTotal');
    var discountRow = document.getElementById('checkoutDiscountRow');
    var discountEl = document.getElementById('checkoutDiscount');
    var couponCode = document.getElementById('checkoutCouponCode');
    var currencyInfo = document.getElementById('checkoutCurrencyInfo');

    if (subtotalEl) subtotalEl.textContent = money(sub);
    if (totalEl) totalEl.textContent = money(tot);
    if (discountRow) discountRow.style.display = disc > 0 ? 'flex' : 'none';
    if (discountEl) discountEl.textContent = '-' + money(disc);
    if (couponCode && coupon) couponCode.textContent = coupon.code;
    if (currencyInfo) {
      var cur = chargeCurrency();
      currencyInfo.textContent = 'Charging in ' + cur + ' via Paystack';
    }

    var session = await window.MITTELY.auth.getSession();
    if (!session || !session.user) {
      if (mainEl) mainEl.style.display = 'none';
      if (gateEl) gateEl.style.display = 'block';
      return;
    }

    if (mainEl) mainEl.style.display = 'block';
    if (gateEl) gateEl.style.display = 'none';

    var userEl = document.getElementById('checkoutUser');
    if (userEl) {
      var meta = session.user.user_metadata || {};
      var name = meta.full_name || meta.name || session.user.email;
      var avatar = meta.avatar_url || meta.picture || '';
      var av = avatar
        ? '<img src="' + esc(avatar) + '" alt="" referrerpolicy="no-referrer">'
        : '<span class="auth-avatar" style="width:48px;height:48px;display:inline-flex;align-items:center;justify-content:center;font-weight:700;color:var(--highlight);">' + esc((name || 'U').charAt(0).toUpperCase()) + '</span>';
      userEl.innerHTML = av + '<div><div style="font-weight:700;">' + esc(name) + '</div><div class="text-muted" style="font-size:0.875rem;">' + esc(session.user.email) + '</div></div>';
    }

    var itemsEl = document.getElementById('checkoutItems');
    if (itemsEl) {
      if (!items.length) {
        itemsEl.innerHTML = '<div class="empty-state"><i class="fa-solid fa-cart-shopping"></i><h3>Your cart is empty</h3><p>Add items before checking out.</p><a href="store.html" class="btn btn-primary">Browse store</a></div>';
      } else {
        itemsEl.innerHTML = items.map(function (i) {
          return '' +
            '<div class="checkout-item">' +
              '<img src="' + esc(i.image_url) + '" alt="" loading="lazy">' +
              '<div class="checkout-item-info">' +
                '<div class="checkout-item-title">' + esc(i.title) + '</div>' +
                '<div class="checkout-item-meta">' + esc((i.license || 'standard').toUpperCase()) + ' · Qty ' + (i.qty || 1) + '</div>' +
              '</div>' +
              '<div class="cart-item-price" data-price-usd="' + ((Number(i.price) || 0) * (i.qty || 1)).toFixed(2) + '">' + money((Number(i.price) || 0) * (i.qty || 1)) + '</div>' +
            '</div>';
        }).join('');
      }
    }
  }

  function computeCouponDiscount(coupon, sub) {
    if (!coupon) return 0;
    if (coupon.type === 'percent') return +(sub * (Number(coupon.value) || 0) / 100).toFixed(2);
    if (coupon.type === 'fixed') return Math.min(sub, Number(coupon.value) || 0);
    return 0;
  }

  async function payWithPaystack() {
    var session = await window.MITTELY.auth.getSession();
    if (!session || !session.user) {
      window.MITTELY.auth.openSignInModal();
      return;
    }
    var items = window.MITTELY.cart.readCart();
    if (!items.length) { toast('Your cart is empty', 'error'); return; }

    var cfg = window.MITTELY.config || {};
    if (!cfg.PAYSTACK_PUBLIC_KEY || cfg.PAYSTACK_PUBLIC_KEY.indexOf('pk_') !== 0) {
      toast('Paystack public key not configured', 'error');
      return;
    }
    if (typeof window.PaystackPop === 'undefined') {
      toast('Payment library failed to load', 'error');
      return;
    }

    var sub = window.MITTELY.cart.subtotalUSD();
    var coupon = window.MITTELY.cart.readCoupon();
    var disc = coupon ? computeCouponDiscount(coupon, sub) : 0;
    var totalUsd = Math.max(0, sub - disc);
    var cur = chargeCurrency();
    var amount = chargeAmount(totalUsd);
    var email = session.user.email;
    var ref = 'MITTELY_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);

    var payBtn = document.getElementById('payNowBtn');
    if (window.MITTELY.main) window.MITTELY.main.setLoading(payBtn, true);

    try {
      var handler = window.PaystackPop.setup({
        key: cfg.PAYSTACK_PUBLIC_KEY,
        email: email,
        amount: amount,
        currency: cur,
        ref: ref,
        metadata: {
          custom_fields: [
            { display_name: 'MITTELY', variable_name: 'source', value: 'mittely-checkout' }
          ]
        },
        callback: function (response) {
          verifyPayment(response.reference, items, coupon);
        },
        onClose: function () {
          if (window.MITTELY.main) window.MITTELY.main.setLoading(payBtn, false);
          toast('Payment cancelled', 'info');
        }
      });
      handler.openIframe();
    } catch (e) {
      if (window.MITTELY.main) window.MITTELY.main.setLoading(payBtn, false);
      toast('Unable to open checkout', 'error');
    }
  }

  async function verifyPayment(reference, items, coupon) {
    var payBtn = document.getElementById('payNowBtn');
    if (window.MITTELY.main) window.MITTELY.main.setLoading(payBtn, true, '<i class="fa-solid fa-spinner fa-spin"></i> Verifying…');
    try {
      var payload = {
        reference: reference,
        items: items.map(function (i) {
          return { product_id: i.product_id, license: i.license, qty: i.qty || 1 };
        }),
        currency: chargeCurrency(),
        coupon_code: coupon ? coupon.code : null
      };
      var res = await window.MITTELY.supabase.functions.invoke('verify-payment', {
        body: payload
      });
      if (res && res.error) throw res.error;
      var data = res && res.data;
      if (!data || data.ok !== true) {
        throw new Error((data && data.reason) || 'Payment verification failed');
      }
      window.MITTELY.cart.clearCart();
      location.href = 'order-success.html?ref=' + encodeURIComponent(reference);
    } catch (err) {
      if (window.MITTELY.main) window.MITTELY.main.setLoading(payBtn, false);
      location.href = 'order-failed.html?ref=' + encodeURIComponent(reference) + '&reason=' + encodeURIComponent((err && err.message) || 'verification_failed');
    }
  }

  async function init() {
    var payBtn = document.getElementById('payNowBtn');
    var signInBtn = document.getElementById('checkoutSignInBtn');
    var gateEl = document.getElementById('checkoutAuthGate');

    if (payBtn) payBtn.addEventListener('click', payWithPaystack);
    if (signInBtn) signInBtn.addEventListener('click', function () { window.MITTELY.auth.openSignInModal(); });

    document.addEventListener('mittely:auth-changed', function () { renderCheckout(); });
    document.addEventListener('mittely:currency-changed', function () { renderCheckout(); });
    document.addEventListener('mittely:cart-changed', function () { renderCheckout(); });

    if (gateEl) gateEl.style.display = 'none';
    await renderCheckout();
  }

  /* ---------- Order success ---------- */

  async function initOrderSuccess() {
    var params = new URL(location.href).searchParams;
    var ref = params.get('ref');
    var refEl = document.getElementById('orderReference');
    if (refEl) refEl.textContent = ref || '—';

    if (!ref || !window.MITTELY.supabase) {
      var missing = document.getElementById('orderMissing');
      var card = document.getElementById('orderDownloadsCard');
      var sumCard = document.getElementById('orderSummaryCard');
      if (missing) missing.style.display = 'block';
      if (card) card.style.display = 'none';
      if (sumCard) sumCard.style.display = 'none';
      return;
    }

    try {
      var session = await window.MITTELY.auth.getSession();
      var q = window.MITTELY.supabase
        .from('orders').select('*').eq('paystack_reference', ref).maybeSingle();
      var res = await q;
      var order = res && res.data;
      if (!order) throw new Error('not_found');

      if (session && session.user && order.email !== session.user.email) {
        var isAdmin = await window.MITTELY.auth.isAdmin();
        if (!isAdmin) throw new Error('forbidden');
      }

      orderState = order;

      var itemsRes = await window.MITTELY.supabase
        .from('order_items').select('*, products(id, title, image_url)')
        .eq('order_id', order.id);
      var items = (itemsRes && itemsRes.data) || [];

      var list = document.getElementById('downloadList');
      var emptyEl = document.getElementById('downloadsEmpty');
      if (list) {
        if (!items.length) {
          list.innerHTML = '';
          if (emptyEl) emptyEl.style.display = 'flex';
        } else {
          list.innerHTML = items.map(function (it) {
            var p = it.products || {};
            return '' +
              '<div class="download-item">' +
                '<img src="' + esc(p.image_url || '') + '" alt="" style="width:48px;height:48px;border-radius:8px;object-fit:cover;">' +
                '<div class="download-item-info">' +
                  '<div class="download-item-title">' + esc(p.title || 'Product') + '</div>' +
                  '<div class="download-item-meta">' + esc((it.license || 'standard').toUpperCase()) + '</div>' +
                '</div>' +
                '<button class="btn btn-primary" data-download="' + esc(it.product_id) + '">' +
                  '<i class="fa-solid fa-download"></i> Download' +
                '</button>' +
              '</div>';
          }).join('');
          list.addEventListener('click', handleDownloadClick);
        }
      }

      var sumRows = document.getElementById('orderSummaryRows');
      if (sumRows) {
        var cur = order.currency || 'USD';
        var rows = '' +
          '<div class="summary-row"><span>Subtotal</span><span>' + money(order.usd_amount) + '</span></div>';
        if (order.discount_usd && Number(order.discount_usd) > 0) {
          rows += '<div class="summary-row"><span>Discount' + (order.coupon_code ? ' (' + esc(order.coupon_code) + ')' : '') + '</span><span>-' + money(order.discount_usd) + '</span></div>';
        }
        rows += '<div class="summary-row"><span>Paid (' + esc(cur) + ')</span><span>' + money(order.amount) + '</span></div>' +
          '<div class="summary-row summary-total"><span>Total</span><span>' + money(order.usd_amount) + '</span></div>';
        sumRows.innerHTML = rows;
      }

      var printBtn = document.getElementById('printInvoiceBtn');
      if (printBtn) printBtn.addEventListener('click', function () { window.print(); });
    } catch (e) {
      var missing2 = document.getElementById('orderMissing');
      var card2 = document.getElementById('orderDownloadsCard');
      var sumCard2 = document.getElementById('orderSummaryCard');
      if (missing2) missing2.style.display = 'block';
      if (card2) card2.style.display = 'none';
      if (sumCard2) sumCard2.style.display = 'none';
    }
  }

  async function handleDownloadClick(e) {
    var btn = e.target.closest('[data-download]');
    if (!btn) return;
    var productId = btn.getAttribute('data-download');
    if (!productId) return;
    if (window.MITTELY.main) window.MITTELY.main.setLoading(btn, true, '<i class="fa-solid fa-spinner fa-spin"></i>');
    try {
      var payload = {
        product_id: productId,
        order_reference: orderState ? orderState.paystack_reference : null
      };
      var res = await window.MITTELY.supabase.functions.invoke('create-download-url', { body: payload });
      if (res && res.error) throw res.error;
      var data = res && res.data;
      if (!data || !data.url) throw new Error('No URL returned');
      window.open(data.url, '_blank', 'noopener');
      toast('Download opened', 'success');
    } catch (err) {
      toast((err && err.message) || 'Download failed', 'error');
    } finally {
      if (window.MITTELY.main) window.MITTELY.main.setLoading(btn, false);
    }
  }

  /* ---------- Order failed ---------- */

  function initOrderFailed() {
    var params = new URL(location.href).searchParams;
    var reason = params.get('reason');
    var wrap = document.getElementById('failedReason');
    var textEl = document.getElementById('failedReasonText');
    if (reason && wrap && textEl) {
      wrap.style.display = 'inline-flex';
      textEl.textContent = reason;
    }
    /* Keep cart intact — nothing else to do */
  }

  window.MITTELY.checkout = {
    init: init,
    initOrderSuccess: initOrderSuccess,
    initOrderFailed: initOrderFailed
  };
})();