/* MITTELY — cart.js
   localStorage cart with DB price refresh, cross-tab badge sync, coupon
   state in sessionStorage, and shared helpers used by cart.html / checkout.html /
   product.html. Prices stored in USD; conversion is display-only. */
(function () {
  'use strict';

  var CART_KEY = 'mittely_cart';
  var COUPON_KEY = 'mittely_coupon';
  var MIN_QTY = 1, MAX_QTY = 99;

  function sb() { return window.mittely && window.mittely.sb && window.mittely.sb(); }
  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function money(usd) { return (window.mittelyCurrency && window.mittelyCurrency.format) ? window.mittelyCurrency.format(usd) : ('$' + Number(usd || 0).toFixed(2)); }

  /* ============ Storage ============ */

  function readCart() {
    try {
      var raw = localStorage.getItem(CART_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(arr)) return [];
      // Sanitize each entry.
      return arr.filter(function (it) {
        return it && it.slug && it.title && isFinite(Number(it.price));
      }).map(function (it) {
        return {
          slug: String(it.slug),
          title: String(it.title),
          image_url: it.image_url ? String(it.image_url) : '',
          price: Number(it.price),
          license: it.license === 'extended' ? 'extended' : 'standard',
          qty: Math.max(MIN_QTY, Math.min(MAX_QTY, parseInt(it.qty, 10) || 1)),
          product_id: it.product_id || null
        };
      });
    } catch (e) { return []; }
  }

  function writeCart(items) {
    try { localStorage.setItem(CART_KEY, JSON.stringify(items)); } catch (e) {}
    updateBadge();
    document.dispatchEvent(new CustomEvent('mittely:cart-updated', { detail: { count: countItems(items) } }));
  }

  function readCoupon() {
    try {
      var raw = sessionStorage.getItem(COUPON_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function writeCoupon(c) {
    try {
      if (!c) sessionStorage.removeItem(COUPON_KEY);
      else sessionStorage.setItem(COUPON_KEY, JSON.stringify(c));
    } catch (e) {}
    document.dispatchEvent(new CustomEvent('mittely:coupon-updated', { detail: { coupon: c || null } }));
  }

  /* ============ Math ============ */

  // License multiplier mirrors the licenses table: Standard=1.0, Extended=3.0.
  var LICENSE_MULTIPLIER = { standard: 1.0, extended: 3.0 };

  function priceWithLicense(item) {
    var mult = LICENSE_MULTIPLIER[item.license] || 1;
    return Number(item.price) * mult;
  }

  function subtotalUsd(items) {
    return (items || readCart()).reduce(function (sum, it) {
      return sum + priceWithLicense(it) * it.qty;
    }, 0);
  }

  function countItems(items) {
    return (items || readCart()).reduce(function (n, it) { return n + it.qty; }, 0);
  }

  function computeTotals() {
    var items = readCart();
    var subtotal = subtotalUsd(items);
    var coupon = readCoupon();
    var discount = 0;
    if (coupon) {
      if (coupon.type === 'percent') {
        discount = subtotal * (Number(coupon.value) / 100);
      } else if (coupon.type === 'fixed') {
        discount = Math.min(subtotal, Number(coupon.value));
      }
    }
    discount = Math.max(0, Math.min(subtotal, discount));
    var total = Math.max(0, subtotal - discount);
    return { items: items, subtotal: subtotal, discount: discount, total: total, coupon: coupon };
  }

  /* ============ Mutations ============ */

  function addItem(product, license) {
    var items = readCart();
    var lic = license === 'extended' ? 'extended' : 'standard';
    var idx = items.findIndex(function (it) { return it.slug === product.slug && it.license === lic; });
    if (idx !== -1) {
      items[idx].qty = Math.min(MAX_QTY, items[idx].qty + 1);
    } else {
      items.push({
        slug: product.slug,
        title: product.title,
        image_url: product.image_url || '',
        price: Number(product.price),
        license: lic,
        qty: 1,
        product_id: product.id || null
      });
    }
    writeCart(items);
    return items;
  }

  function updateQty(slug, license, qty) {
    var items = readCart();
    var idx = items.findIndex(function (it) { return it.slug === slug && it.license === license; });
    if (idx === -1) return items;
    var n = Math.max(MIN_QTY, Math.min(MAX_QTY, parseInt(qty, 10) || 1));
    items[idx].qty = n;
    writeCart(items);
    return items;
  }

  function removeItem(slug, license) {
    var items = readCart().filter(function (it) {
      return !(it.slug === slug && it.license === license);
    });
    writeCart(items);
    return items;
  }

  function clear() {
    try { localStorage.removeItem(CART_KEY); } catch (e) {}
    updateBadge();
    document.dispatchEvent(new CustomEvent('mittely:cart-updated', { detail: { count: 0 } }));
  }

  /* ============ DB price refresh ============ */

  function refreshPrices() {
    var client = sb();
    var items = readCart();
    if (!client || !items.length) return Promise.resolve(items);

    var slugs = items.map(function (it) { return it.slug; });
    return client.from('products')
      .select('id,slug,title,image_url,price,sale_price,is_free,is_published')
      .in('slug', slugs)
      .then(function (res) {
        if (res.error || !res.data) return items;
        var bySlug = {};
        res.data.forEach(function (p) { bySlug[p.slug] = p; });
        var changed = false;
        var next = items.filter(function (it) {
          var p = bySlug[it.slug];
          // Remove items no longer available.
          if (!p || p.is_published === false) { changed = true; return false; }
          var base = (p.sale_price != null && Number(p.sale_price) > 0) ? Number(p.sale_price) : Number(p.price);
          if (p.is_free) base = 0;
          if (Number(it.price) !== base) { it.price = base; changed = true; }
          if (p.title && it.title !== p.title) { it.title = p.title; changed = true; }
          if (p.image_url && it.image_url !== p.image_url) { it.image_url = p.image_url; changed = true; }
          it.product_id = p.id;
          return true;
        });
        if (changed) writeCart(next);
        return next;
      })
      .catch(function () { return items; });
  }

  /* ============ Badge ============ */

  function updateBadge() {
    var badge = document.getElementById('cartBadge');
    if (!badge) return;
    var n = countItems();
    if (n > 0) { badge.hidden = false; badge.textContent = String(n); }
    else { badge.hidden = true; badge.textContent = '0'; }
  }

  /* ============ Coupon flow (client-side format validation only; verify server-side) ============ */

  function couponFormatCheck(code) {
    if (!code) return { ok: false, reason: 'Enter a code.' };
    var c = String(code).trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,32}$/.test(c)) return { ok: false, reason: 'Code format looks invalid.' };
    return { ok: true, code: c };
  }

  function applyCoupon(code) {
    var client = sb();
    if (!client) return Promise.resolve({ ok: false, reason: 'Network unavailable.' });
    var check = couponFormatCheck(code);
    if (!check.ok) return Promise.resolve(check);

    // Client-side preview only; verify-payment re-validates server-side.
    return client.from('coupons')
      .select('code,type,value,min_subtotal,max_uses,used_count,expires_at,is_active')
      .eq('code', check.code)
      .maybeSingle()
      .then(function (res) {
        if (res.error || !res.data) return { ok: false, reason: 'Invalid or unknown code.' };
        var c = res.data;
        if (!c.is_active) return { ok: false, reason: 'This code is no longer active.' };
        if (c.expires_at && new Date(c.expires_at) < new Date()) return { ok: false, reason: 'This code has expired.' };
        if (c.max_uses != null && Number(c.used_count) >= Number(c.max_uses)) return { ok: false, reason: 'This code has reached its usage limit.' };

        var subtotal = subtotalUsd();
        if (subtotal < Number(c.min_subtotal || 0)) {
          return { ok: false, reason: 'Add ' + money(Number(c.min_subtotal) - subtotal) + ' more to use this code.' };
        }

        var applied = {
          code: c.code,
          type: c.type,
          value: Number(c.value)
        };
        writeCoupon(applied);
        return { ok: true, coupon: applied };
      })
      .catch(function () { return { ok: false, reason: 'Could not validate code. Try again.' }; });
  }

  function removeCoupon() {
    writeCoupon(null);
  }

  /* ============ Cross-tab sync ============ */

  window.addEventListener('storage', function (e) {
    if (e.key === CART_KEY) {
      updateBadge();
      document.dispatchEvent(new CustomEvent('mittely:cart-updated', { detail: { count: countItems() } }));
    }
    if (e.key === COUPON_KEY) {
      document.dispatchEvent(new CustomEvent('mittely:coupon-updated', { detail: { coupon: readCoupon() } }));
    }
  });

  /* ============ Ready ============ */

  function onReady(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  onReady(function () {
    updateBadge();
    refreshPrices().then(updateBadge);
  });

  window.mittelyCart = {
    read: readCart,
    write: writeCart,
    add: addItem,
    updateQty: updateQty,
    remove: removeItem,
    clear: clear,
    count: countItems,
    subtotal: subtotalUsd,
    totals: computeTotals,
    refreshPrices: refreshPrices,
    getCoupon: readCoupon,
    applyCoupon: applyCoupon,
    removeCoupon: removeCoupon,
    priceWithLicense: priceWithLicense,
    LICENSE_MULTIPLIER: LICENSE_MULTIPLIER
  };
})();