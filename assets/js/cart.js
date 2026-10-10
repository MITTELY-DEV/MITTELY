/* ============================================
   MITTELY — cart.js
   localStorage cart, badge sync, live price
   refresh from DB, coupon state, totals.
   ============================================ */
(function () {
  'use strict';

  if (!window.MITTELY) window.MITTELY = {};

  var STORAGE_KEY = 'mittely_cart';
  var COUPON_KEY = 'mittely_coupon';

  /* ---------- Cart data ---------- */

  function readCart() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) { return []; }
  }

  function writeCart(items) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items || []));
    } catch (e) {}
    syncBadge();
    document.dispatchEvent(new CustomEvent('mittely:cart-changed', { detail: { items: items || [] } }));
  }

  function addItem(item) {
    if (!item || !item.product_id) return false;
    var items = readCart();
    var license = item.license || 'standard';
    var existing = items.find(function (i) {
      return i.product_id === item.product_id && i.license === license;
    });
    if (existing) {
      existing.qty = (existing.qty || 1) + (item.qty || 1);
    } else {
      items.push({
        product_id: item.product_id,
        title: item.title || '',
        image_url: item.image_url || '',
        price: Number(item.price) || 0,
        license: license,
        qty: item.qty || 1
      });
    }
    writeCart(items);
    return true;
  }

  function removeItem(product_id, license) {
    var items = readCart().filter(function (i) {
      return !(i.product_id === product_id && i.license === (license || 'standard'));
    });
    writeCart(items);
  }

  function setQty(product_id, license, qty) {
    var items = readCart();
    var item = items.find(function (i) {
      return i.product_id === product_id && i.license === (license || 'standard');
    });
    if (!item) return;
    item.qty = Math.max(1, parseInt(qty, 10) || 1);
    writeCart(items);
  }

  function clearCart() {
    writeCart([]);
    clearCoupon();
  }

  function cartCount() {
    return readCart().reduce(function (sum, i) { return sum + (i.qty || 1); }, 0);
  }

  function syncBadge() {
    var count = cartCount();
    document.querySelectorAll('.cart-badge').forEach(function (el) {
      el.textContent = String(count);
      el.style.display = count > 0 ? 'inline-flex' : 'none';
    });
  }

  /* ---------- Coupon ---------- */

  function readCoupon() {
    try {
      var raw = sessionStorage.getItem(COUPON_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }

  function writeCoupon(c) {
    try {
      if (c) sessionStorage.setItem(COUPON_KEY, JSON.stringify(c));
      else sessionStorage.removeItem(COUPON_KEY);
    } catch (e) {}
  }

  function applyCouponLocal(code, usdSubtotal) {
    if (!code) return null;
    return { code: String(code).toUpperCase().trim(), usdSubtotal: Number(usdSubtotal) || 0 };
  }

  function clearCoupon() {
    writeCoupon(null);
  }

  /* ---------- Totals ---------- */

  function subtotalUSD() {
    return readCart().reduce(function (sum, i) {
      return sum + (Number(i.price) || 0) * (i.qty || 1);
    }, 0);
  }

  function discountUSD(coupon) {
    if (!coupon) return 0;
    var sub = subtotalUSD();
    if (coupon.type === 'percent') {
      return +(sub * (Number(coupon.value) || 0) / 100).toFixed(2);
    }
    if (coupon.type === 'fixed') {
      return Math.min(sub, Number(coupon.value) || 0);
    }
    return 0;
  }

  function totalUSD(coupon) {
    var sub = subtotalUSD();
    var disc = discountUSD(coupon);
    return Math.max(0, +(sub - disc).toFixed(2));
  }

  /* ---------- Refresh from DB ---------- */

  async function refreshFromDb() {
    var items = readCart();
    if (!items.length || !window.MITTELY.supabase) return items;
    try {
      var ids = items.map(function (i) { return i.product_id; });
      var res = await window.MITTELY.supabase
        .from('products')
        .select('id, title, price, sale_price, image_url, slug, is_published')
        .in('id', ids);
      var byId = {};
      ((res && res.data) || []).forEach(function (p) { byId[p.id] = p; });
      items = items.map(function (i) {
        var p = byId[i.product_id];
        if (!p) return i;
        var price = (p.sale_price != null && p.sale_price !== '') ? Number(p.sale_price) : Number(p.price);
        return Object.assign({}, i, {
          title: p.title || i.title,
          image_url: p.image_url || i.image_url,
          price: isFinite(price) ? price : i.price,
          slug: p.slug || i.slug
        });
      });
      writeCart(items);
    } catch (e) { /* keep local */ }
    return items;
  }

  /* ---------- Cart page renderer ---------- */

  async function initCartPage() {
    var itemsWrap = document.getElementById('cartItems');
    var emptyEl = document.getElementById('cartEmpty');
    var couponInput = document.getElementById('couponInput');
    var couponApplyBtn = document.getElementById('applyCouponBtn');
    var couponApplied = document.getElementById('couponApplied');
    var couponAppliedCode = document.getElementById('couponAppliedCode');
    var couponRemoveBtn = document.getElementById('removeCouponBtn');
    var couponError = document.getElementById('couponError');
    var summarySubtotal = document.getElementById('summarySubtotal');
    var summaryTotal = document.getElementById('summaryTotal');
    var summaryDiscountRow = document.getElementById('summaryDiscountRow');
    var summaryDiscount = document.getElementById('summaryDiscount');
    var checkoutBtn = document.getElementById('checkoutBtn');

    if (!itemsWrap) return;

    var items = await refreshFromDb();
    var coupon = readCoupon();

    function render() {
      items = readCart();
      if (!items.length) {
        itemsWrap.innerHTML = '';
        if (emptyEl) emptyEl.style.display = 'flex';
        if (couponApplied) couponApplied.style.display = 'none';
      } else {
        if (emptyEl) emptyEl.style.display = 'none';
        itemsWrap.innerHTML = items.map(function (i) {
          var esc = window.MITTELY.main.escapeHtml;
          var lineTotal = (Number(i.price) || 0) * (i.qty || 1);
          return '' +
            '<div class="cart-item" data-pid="' + esc(i.product_id) + '" data-license="' + esc(i.license) + '">' +
              '<div class="cart-item-img"><img src="' + esc(i.image_url) + '" alt="' + esc(i.title) + '" loading="lazy"></div>' +
              '<div class="cart-item-info">' +
                '<div class="cart-item-title">' + esc(i.title) + '</div>' +
                '<div class="cart-item-meta">License: ' + esc((i.license || 'standard').toUpperCase()) + ' · Qty ' + (i.qty || 1) + '</div>' +
                '<div class="cart-item-price" data-price-usd="' + lineTotal.toFixed(2) + '">' + window.MITTELY.currency.formatMoney(lineTotal) + '</div>' +
              '</div>' +
              '<button class="cart-item-remove" aria-label="Remove item" data-action="remove"><i class="fa-solid fa-trash"></i></button>' +
            '</div>';
        }).join('');
      }
      renderSummary();
      renderCoupon();
    }

    function renderCoupon() {
      if (coupon && coupon.code) {
        if (couponApplied) couponApplied.style.display = 'flex';
        if (couponAppliedCode) couponAppliedCode.textContent = coupon.code;
      } else {
        if (couponApplied) couponApplied.style.display = 'none';
      }
    }

    function renderSummary() {
      var sub = subtotalUSD();
      var disc = discountUSD(coupon);
      var tot = Math.max(0, sub - disc);
      if (summarySubtotal) summarySubtotal.textContent = window.MITTELY.currency.formatMoney(sub);
      if (summaryTotal) summaryTotal.textContent = window.MITTELY.currency.formatMoney(tot);
      if (summaryDiscountRow) summaryDiscountRow.style.display = disc > 0 ? 'flex' : 'none';
      if (summaryDiscount) summaryDiscount.textContent = '-' + window.MITTELY.currency.formatMoney(disc);
    }

    itemsWrap.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-action="remove"]');
      if (!btn) return;
      var row = btn.closest('.cart-item');
      if (!row) return;
      var pid = row.getAttribute('data-pid');
      var lic = row.getAttribute('data-license');
      removeItem(pid, lic);
      if (window.MITTELY.main) window.MITTELY.main.toast('Item removed', 'info');
      render();
    });

    if (couponApplyBtn && couponInput) {
      couponApplyBtn.addEventListener('click', async function () {
        var code = couponInput.value.trim().toUpperCase();
        if (couponError) { couponError.style.display = 'none'; couponError.textContent = ''; }
        if (!code) {
          if (couponError) { couponError.textContent = 'Enter a code'; couponError.style.display = 'block'; }
          return;
        }
        var main = window.MITTELY.main;
        if (main) main.setLoading(couponApplyBtn, true);
        try {
          if (!window.MITTELY.supabase) throw new Error('Service unavailable');
          var res = await window.MITTELY.supabase
            .from('coupons')
            .select('code, type, value, min_subtotal, max_uses, used_count, expires_at, is_active')
            .eq('code', code)
            .maybeSingle();
          var c = res && res.data;
          if (!c || !c.is_active) throw new Error('Invalid or inactive code');
          if (c.expires_at && new Date(c.expires_at).getTime() < Date.now()) throw new Error('Coupon expired');
          if (c.max_uses != null && c.used_count >= c.max_uses) throw new Error('Coupon usage limit reached');
          if (Number(c.min_subtotal) > 0 && subtotalUSD() < Number(c.min_subtotal)) {
            throw new Error('Minimum subtotal not met');
          }
          coupon = { code: c.code, type: c.type, value: c.value };
          writeCoupon(coupon);
          if (couponInput) couponInput.value = '';
          render();
          if (main) main.toast('Coupon applied', 'success');
        } catch (err) {
          if (couponError) { couponError.textContent = (err && err.message) || 'Invalid code'; couponError.style.display = 'block'; }
        } finally {
          if (main) main.setLoading(couponApplyBtn, false);
        }
      });
    }

    if (couponRemoveBtn) {
      couponRemoveBtn.addEventListener('click', function () {
        coupon = null;
        clearCoupon();
        render();
        if (window.MITTELY.main) window.MITTELY.main.toast('Coupon removed', 'info');
      });
    }

    if (checkoutBtn) {
      checkoutBtn.addEventListener('click', function () {
        if (!readCart().length) {
          if (window.MITTELY.main) window.MITTELY.main.toast('Your cart is empty', 'error');
          return;
        }
        location.href = 'checkout.html';
      });
    }

    document.addEventListener('mittely:currency-changed', function () { render(); });
    render();
  }

  /* ---------- Init ---------- */

  function init() {
    syncBadge();
    document.addEventListener('mittely:cart-changed', syncBadge);
  }

  window.MITTELY.cart = {
    readCart: readCart,
    writeCart: writeCart,
    addItem: addItem,
    removeItem: removeItem,
    setQty: setQty,
    clearCart: clearCart,
    cartCount: cartCount,
    syncBadge: syncBadge,
    readCoupon: readCoupon,
    writeCoupon: writeCoupon,
    clearCoupon: clearCoupon,
    subtotalUSD: subtotalUSD,
    discountUSD: discountUSD,
    totalUSD: totalUSD,
    refreshFromDb: refreshFromDb,
    initCartPage: initCartPage
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();