/* MITTELY — checkout.js
   Paystack Inline + order verification via Edge Function.
   Handles: cart rendering, coupon state, auth gating, Paystack popup,
   callback -> verify-payment -> redirect to order-success or order-failed. */
(function () {
  'use strict';

  function sb() { return window.mittely && window.mittely.sb && window.mittely.sb(); }
  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function money(usd) { return (window.mittelyCurrency && window.mittelyCurrency.format) ? window.mittelyCurrency.format(usd) : ('$' + Number(usd || 0).toFixed(2)); }
  function esc(s) { return window.escapeHtml ? window.escapeHtml(s) : String(s == null ? '' : s); }
  function toast(m, k) { if (window.toast) window.toast(m, k); }

  /* =================== Cart page =================== */

  function renderCartPage() {
    var list = document.getElementById('cartItems');
    if (!list) return;
    var empty = document.getElementById('cartEmpty');
    var subtotalEl = document.getElementById('cartSubtotal');
    var discountRow = document.getElementById('cartDiscountRow');
    var discountEl = document.getElementById('cartDiscount');
    var discountBadge = document.getElementById('cartDiscountCode');
    var totalEl = document.getElementById('cartTotal');
    var checkoutBtn = document.getElementById('checkoutBtn');
    var couponInput = document.getElementById('couponInput');
    var couponApply = document.getElementById('couponApplyBtn');
    var couponRemove = document.getElementById('couponRemoveBtn');
    var couponErr = document.getElementById('couponError');
    var couponOk = document.getElementById('couponSuccess');

    function paint() {
      var t = window.mittelyCart.totals();
      if (!t.items.length) {
        list.innerHTML = '';
        list.hidden = true;
        if (empty) empty.hidden = false;
        if (checkoutBtn) checkoutBtn.disabled = true;
        if (subtotalEl) subtotalEl.textContent = money(0);
        if (totalEl) totalEl.textContent = money(0);
        if (discountRow) discountRow.hidden = true;
        return;
      }
      list.hidden = false;
      if (empty) empty.hidden = true;
      list.innerHTML = t.items.map(function (it) {
        var lic = window.mittelyCart.LICENSE_MULTIPLIER[it.license] || 1;
        var unit = Number(it.price) * lic;
        return '' +
          '<article class="cart-item" data-slug="' + esc(it.slug) + '" data-license="' + esc(it.license) + '">' +
            '<img src="' + esc(it.image_url || 'https://images.unsplash.com/photo-1559028012-481c04fa702d?w=200&q=60') + '" alt="" loading="lazy" decoding="async">' +
            '<div class="cart-item-info">' +
              '<h3><a href="product.html?slug=' + encodeURIComponent(it.slug) + '">' + esc(it.title) + '</a></h3>' +
              '<p class="cart-item-meta">' + esc(it.license.charAt(0).toUpperCase() + it.license.slice(1)) + ' license · ' + money(unit) + ' each</p>' +
              '<div class="cart-item-actions">' +
                '<div class="qty-stepper">' +
                  '<button type="button" data-qty-dec aria-label="Decrease quantity">-</button>' +
                  '<span>' + it.qty + '</span>' +
                  '<button type="button" data-qty-inc aria-label="Increase quantity">+</button>' +
                '</div>' +
                '<button type="button" class="btn btn-ghost btn-sm" data-remove><i class="fa-solid fa-trash" aria-hidden="true"></i> Remove</button>' +
              '</div>' +
            '</div>' +
            '<div class="cart-item-price">' + money(unit * it.qty) + '</div>' +
          '</article>';
      }).join('');

      // Bind controls
      qsa('.cart-item', list).forEach(function (row) {
        var slug = row.getAttribute('data-slug');
        var lic = row.getAttribute('data-license');
        var dec = row.querySelector('[data-qty-dec]');
        var inc = row.querySelector('[data-qty-inc]');
        var rem = row.querySelector('[data-remove]');
        if (dec) dec.addEventListener('click', function () {
          var cur = window.mittelyCart.read().find(function (x) { return x.slug === slug && x.license === lic; });
          if (!cur) return;
          window.mittelyCart.updateQty(slug, lic, cur.qty - 1);
          paint();
        });
        if (inc) inc.addEventListener('click', function () {
          var cur = window.mittelyCart.read().find(function (x) { return x.slug === slug && x.license === lic; });
          if (!cur) return;
          window.mittelyCart.updateQty(slug, lic, cur.qty + 1);
          paint();
        });
        if (rem) rem.addEventListener('click', function () {
          if (!window.confirm('Remove "' + row.querySelector('h3').textContent + '" from cart?')) return;
          window.mittelyCart.remove(slug, lic);
          paint();
          toast('Removed from cart.', 'success');
        });
      });

      if (subtotalEl) subtotalEl.textContent = money(t.subtotal);
      if (discountRow) {
        if (t.discount > 0) {
          discountRow.hidden = false;
          if (discountEl) discountEl.textContent = '-' + money(t.discount);
          if (discountBadge && t.coupon) discountBadge.textContent = t.coupon.code;
        } else discountRow.hidden = true;
      }
      if (totalEl) totalEl.textContent = money(t.total);
      if (checkoutBtn) checkoutBtn.disabled = false;

      // Coupon UI state
      if (t.coupon) {
        if (couponRemove) couponRemove.hidden = false;
        if (couponOk) { couponOk.hidden = false; couponOk.textContent = 'Code ' + t.coupon.code + ' applied.'; }
      } else {
        if (couponRemove) couponRemove.hidden = true;
        if (couponOk) couponOk.hidden = true;
      }
    }

    if (couponApply) couponApply.addEventListener('click', function () {
      if (couponErr) couponErr.hidden = true;
      if (couponOk) couponOk.hidden = true;
      couponApply.classList.add('is-loading');
      window.mittelyCart.applyCoupon(couponInput.value).then(function (res) {
        couponApply.classList.remove('is-loading');
        if (!res.ok) { if (couponErr) { couponErr.textContent = res.reason; couponErr.hidden = false; } return; }
        paint();
        toast('Coupon applied.', 'success');
      });
    });

    if (couponRemove) couponRemove.addEventListener('click', function () {
      window.mittelyCart.removeCoupon();
      if (couponInput) couponInput.value = '';
      paint();
    });

    if (checkoutBtn) checkoutBtn.addEventListener('click', function () {
      var email = window.mittely && window.mittely.currentEmail && window.mittely.currentEmail();
      if (!email) { window.mittelyAuth.openModal('checkout'); return; }
      window.location.href = 'checkout.html';
    });

    paint();
    document.addEventListener('mittely:cart-updated', paint);
    document.addEventListener('mittely:coupon-updated', paint);
    document.addEventListener('mittely:currency-changed', paint);
    document.addEventListener('mittely:fx-ready', paint);
  }

  /* =================== Checkout page =================== */

  var checkoutState = { user: null };

  function renderCheckoutPage() {
    var wrap = document.querySelector('.checkout-layout');
    if (!wrap) return;
    var itemsEl = document.getElementById('checkoutItems');
    var subtotalEl = document.getElementById('checkoutSubtotal');
    var discountRow = document.getElementById('checkoutDiscountRow');
    var discountEl = document.getElementById('checkoutDiscount');
    var totalEl = document.getElementById('checkoutTotal');
    var payBtn = document.getElementById('payNowBtn');
    var errorEl = document.getElementById('checkoutError');
    var authBlock = document.getElementById('checkoutUserInfo');
    var promptBlock = document.getElementById('checkoutSignInPrompt');
    var avatarEl = document.getElementById('checkoutAvatar');
    var nameEl = document.getElementById('checkoutName');
    var emailEl = document.getElementById('checkoutEmail');
    var switchBtn = document.getElementById('checkoutSwitchBtn');
    var curLabel = document.getElementById('checkoutCurrencyLabel');

    function syncAuth() {
      var user = window.mittelyAuth && window.mittelyAuth.getUser && window.mittelyAuth.getUser();
      checkoutState.user = user;
      if (user) {
        if (promptBlock) promptBlock.hidden = true;
        if (authBlock) authBlock.hidden = false;
        var name = (user.user_metadata && (user.user_metadata.full_name || user.user_metadata.name)) || user.email;
        var avatar = (user.user_metadata && user.user_metadata.avatar_url) || '';
        if (avatarEl) avatarEl.src = avatar || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(name);
        if (nameEl) nameEl.textContent = name;
        if (emailEl) emailEl.textContent = user.email;
        if (payBtn) payBtn.disabled = !window.mittelyCart.read().length;
      } else {
        if (promptBlock) promptBlock.hidden = false;
        if (authBlock) authBlock.hidden = true;
        if (payBtn) payBtn.disabled = true;
      }
    }

    function paint() {
      var t = window.mittelyCart.totals();
      if (!t.items.length) {
        if (itemsEl) itemsEl.innerHTML = '<p class="muted">Your cart is empty. <a href="store.html">Browse the store</a>.</p>';
        if (subtotalEl) subtotalEl.textContent = money(0);
        if (totalEl) totalEl.textContent = money(0);
        if (discountRow) discountRow.hidden = true;
        if (payBtn) payBtn.disabled = true;
        return;
      }
      if (itemsEl) {
        itemsEl.innerHTML = t.items.map(function (it) {
          var lic = window.mittelyCart.LICENSE_MULTIPLIER[it.license] || 1;
          var unit = Number(it.price) * lic;
          return '' +
            '<div class="checkout-item">' +
              '<img src="' + esc(it.image_url || 'https://images.unsplash.com/photo-1559028012-481c04fa702d?w=200&q=60') + '" alt="">' +
              '<div><strong>' + esc(it.title) + '</strong><br><span class="muted" style="font-size:.85em">' + esc(it.license) + ' × ' + it.qty + '</span></div>' +
              '<div>' + money(unit * it.qty) + '</div>' +
            '</div>';
        }).join('');
      }
      if (subtotalEl) subtotalEl.textContent = money(t.subtotal);
      if (discountRow) {
        if (t.discount > 0) { discountRow.hidden = false; if (discountEl) discountEl.textContent = '-' + money(t.discount); }
        else discountRow.hidden = true;
      }
      if (totalEl) totalEl.textContent = money(t.total);
      if (payBtn) payBtn.disabled = !(checkoutState.user && t.items.length);
      if (curLabel) curLabel.textContent = (localStorage.getItem('mittely-currency') || 'USD');
    }

    if (switchBtn) switchBtn.addEventListener('click', function () {
      window.mittelyAuth.signOut();
      setTimeout(syncAuth, 400);
    });

    if (payBtn) payBtn.addEventListener('click', function () {
      if (errorEl) errorEl.hidden = true;
      var t = window.mittelyCart.totals();
      if (!t.items.length) { if (errorEl) { errorEl.textContent = 'Your cart is empty.'; errorEl.hidden = false; } return; }
      var user = checkoutState.user;
      if (!user) { window.mittelyAuth.openModal('checkout'); return; }

      var currency = (localStorage.getItem('mittely-currency') || 'USD');
      var fx = window.mittelyCurrency && window.mittelyCurrency.currentRate ? window.mittelyCurrency.currentRate() : 15.5;
      var amountSmallest = currency === 'GHS' ? Math.round(t.total * fx * 100) : Math.round(t.total * 100);

      var paystackKey = window.MITTELY_CONFIG && window.MITTELY_CONFIG.PAYSTACK_PUBLIC_KEY;
      if (!paystackKey) { if (errorEl) { errorEl.textContent = 'Paystack key not configured.'; errorEl.hidden = false; } return; }

      function handler(response) {
        if (!response || !response.reference) return;
        verifyOrder(response.reference);
      }

      payBtn.classList.add('is-loading');
      try {
        var handlerFn = window.PaystackPop.setup({
          key: paystackKey,
          email: user.email,
          amount: amountSmallest,
          currency: currency,
          ref: 'MITTELY_' + Date.now() + '_' + Math.floor(Math.random() * 1e6),
          metadata: {
            custom_fields: [
              { display_name: 'Cart', variable_name: 'cart', value: t.items.map(function (i) { return i.slug + ':' + i.license + ':' + i.qty; }).join('|') }
            ]
          },
          callback: handler,
          onClose: function () {
            payBtn.classList.remove('is-loading');
            if (errorEl) { errorEl.textContent = 'Payment cancelled.'; errorEl.hidden = false; }
          }
        });
        handlerFn.openIframe();
      } catch (e) {
        payBtn.classList.remove('is-loading');
        if (errorEl) { errorEl.textContent = 'Could not open Paystack. ' + (e.message || ''); errorEl.hidden = false; }
      }
    });

    function verifyOrder(reference) {
      var t = window.mittelyCart.totals();
      var items = t.items.map(function (it) {
        return { slug: it.slug, license: it.license, qty: it.qty };
      });
      var payload = {
        reference: reference,
        items: items,
        currency: (localStorage.getItem('mittely-currency') || 'USD'),
        coupon_code: t.coupon ? t.coupon.code : null
      };

      sb().functions.invoke('verify-payment', { body: payload }).then(function (res) {
        var data = res && res.data;
        if (data && data.ok && data.order_id) {
          window.mittelyCart.clear();
          window.mittelyCart.removeCoupon();
          window.location.href = 'order-success.html?ref=' + encodeURIComponent(reference);
        } else {
          window.location.href = 'order-failed.html?ref=' + encodeURIComponent(reference) + '&reason=' + encodeURIComponent((data && data.reason) || 'verification_failed');
        }
      }).catch(function (err) {
        window.location.href = 'order-failed.html?ref=' + encodeURIComponent(reference) + '&reason=' + encodeURIComponent(err && err.message || 'network_error');
      });
    }

    syncAuth();
    paint();
    document.addEventListener('mittely:cart-updated', paint);
    document.addEventListener('mittely:coupon-updated', paint);
    document.addEventListener('mittely:currency-changed', paint);
    document.addEventListener('mittely:fx-ready', paint);
    window.addEventListener('mittely:auth-changed', syncAuth);
  }

  /* =================== Order success / failed =================== */

  function renderOrderSuccess() {
    var ref = new URL(window.location.href).searchParams.get('ref');
    var refEl = document.getElementById('orderRef');
    var card = document.getElementById('orderCard');
    var printBtn = document.getElementById('printInvoiceBtn');
    if (refEl) refEl.textContent = ref || '—';
    if (printBtn) printBtn.addEventListener('click', function () { window.print(); });
    if (!ref || !card) return;

    var client = sb();
    if (!client) return;

    client.from('orders')
      .select('paystack_reference,email,name,amount,currency,usd_amount,status,created_at,coupon_code,discount_usd,order_items(id,price_paid,license,products(id,title,slug,image_url))')
      .eq('paystack_reference', ref)
      .maybeSingle()
      .then(function (res) {
        var order = res && res.data;
        if (!order) {
          card.innerHTML = '<p class="muted">Order details unavailable. It may still be processing — check your dashboard.</p>';
          return;
        }
        var items = order.order_items || [];
        card.innerHTML = '' +
          '<p class="muted" style="margin-top:0">' + esc(order.email || '') + ' · ' + new Date(order.created_at).toLocaleString() + '</p>' +
          '<ul class="order-items-list" style="list-style:none;padding:0;display:grid;gap:12px;margin:12px 0">' +
          items.map(function (it) {
            var p = it.products || {};
            return '<li style="display:grid;grid-template-columns:44px 1fr auto;gap:10px;align-items:center">' +
              '<img src="' + esc(p.image_url || '') + '" alt="" style="width:44px;height:44px;border-radius:8px;object-fit:cover">' +
              '<div><strong>' + esc(p.title || it.product_id) + '</strong><br><span class="muted" style="font-size:.85em">' + esc(it.license) + '</span></div>' +
              '<button class="btn btn-outline btn-sm" type="button" data-download="' + esc(p.id || '') + '" data-ref="' + esc(ref) + '">' +
                '<i class="fa-solid fa-download" aria-hidden="true"></i> Download</button>' +
              '</li>';
          }).join('') +
          '</ul>' +
          '<p style="margin:0"><strong>Total paid: </strong>' + esc((order.currency === 'GHS' ? 'GH₵ ' : '$') + Number(order.amount).toFixed(2)) +
          (order.discount_usd > 0 ? ' (discount ' + money(order.discount_usd) + ')' : '') + '</p>';

        qsa('[data-download]', card).forEach(function (b) {
          b.addEventListener('click', function () {
            var productId = b.getAttribute('data-download');
            var orderRef = b.getAttribute('data-ref');
            b.classList.add('is-loading');
            sb().functions.invoke('create-download-url', { body: { product_id: productId, order_reference: orderRef } })
              .then(function (r) {
                b.classList.remove('is-loading');
                var url = r && r.data && r.data.url;
                if (!url) { toast('Could not create download.', 'error'); return; }
                window.location.href = url;
              }).catch(function () {
                b.classList.remove('is-loading');
                toast('Could not create download.', 'error');
              });
          });
        });
      });
  }

  function renderOrderFailed() {
    var url = new URL(window.location.href);
    var ref = url.searchParams.get('ref');
    var reason = url.searchParams.get('reason');
    var refEl = document.getElementById('orderFailedRef');
    var msgEl = document.getElementById('orderFailedMessage');
    if (refEl) refEl.textContent = ref || '—';
    if (msgEl) {
      msgEl.textContent = reason
        ? 'Reason: ' + reason.replace(/_/g, ' ') + '. No charge was made. Your cart is preserved.'
        : 'No charge was made. Your cart is preserved — you can retry any time.';
    }
  }

  /* =================== Ready =================== */

  function onReady(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  onReady(function () {
    renderCartPage();
    renderCheckoutPage();
    renderOrderSuccess();
    renderOrderFailed();
  });
})();