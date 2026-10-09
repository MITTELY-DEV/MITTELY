/* ============================================================
   MITTELY — freebies.js
   Renders is_free products. Download is gated by the sign-in
   modal; actual download goes through create-download-url edge
   function which is safe for free products too.
   ============================================================ */

(function () {
  'use strict';

  var utils = (window.MITTELY && window.MITTELY.utils) || {};
  var esc = utils.escapeHtml || function (s) { return String(s == null ? '' : s); };
  var money = window.formatMoney || function (n) { return '$' + (Number(n) || 0).toFixed(2); };

  function freebieCardHTML(p) {
    var img = p.image_url || 'assets/og-default.jpg';
    var url = 'product.html?slug=' + encodeURIComponent(p.slug);
    return '' +
      '<article class="product-card reveal">' +
        '<a class="product-card-media" href="' + url + '" aria-label="View ' + esc(p.title) + '">' +
          '<span class="product-card-badge">FREE</span>' +
          '<img src="' + esc(img) + '" alt="' + esc(p.title) + ' preview" loading="lazy" decoding="async" width="600" height="375">' +
        '</a>' +
        '<div class="product-card-body">' +
          '<div class="product-card-meta">' +
            '<span>' + esc((p.category || '').replace('-', ' ')) + '</span>' +
            '<span>' + (Number(p.download_count) || 0).toLocaleString() + ' downloads</span>' +
          '</div>' +
          '<a href="' + url + '" class="product-card-title">' + esc(p.title) + '</a>' +
          '<p class="product-card-desc">' + esc(p.short_desc || '') + '</p>' +
          '<div class="product-card-footer">' +
            '<span class="product-card-price">Free</span>' +
            '<button type="button" class="btn btn-primary btn-sm" data-freebie-download="' + esc(p.id) + '">Download →</button>' +
          '</div>' +
        '</div>' +
      '</article>';
  }

  function load() {
    var grid = document.getElementById('freebies-grid');
    var emptyEl = document.getElementById('freebies-empty');
    if (!grid || !window.sb) return;

    window.sb
      .from('products')
      .select('*')
      .eq('is_published', true)
      .eq('is_free', true)
      .order('download_count', { ascending: false })
      .then(function (res) {
        var items = (res && !res.error && res.data) ? res.data : [];
        if (!items.length) {
          grid.innerHTML = '';
          if (emptyEl) emptyEl.hidden = false;
          return;
        }
        if (emptyEl) emptyEl.hidden = true;
        grid.innerHTML = items.map(freebieCardHTML).join('');
        document.dispatchEvent(new CustomEvent('mittely:content-updated'));
      });
  }

  function bindDownloads() {
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-freebie-download]');
      if (!btn) return;
      e.preventDefault();

      var user = window.MITTELY && window.MITTELY.auth && window.MITTELY.auth.getUser();
      if (!user) {
        window.toast && window.toast('Sign in to download freebies.', 'info');
        if (window.MITTELY && window.MITTELY.auth) window.MITTELY.auth.open();
        return;
      }

      var productId = btn.getAttribute('data-freebie-download');
      if (!productId || !window.sb) return;

      btn.disabled = true;
      var originalText = btn.textContent;
      btn.textContent = 'Preparing…';

      window.sb.functions
        .invoke('create-download-url', { body: { product_id: productId } })
        .then(function (res) {
          var data = res && res.data;
          if (!data || !data.ok || !data.url) {
            throw new Error((data && data.error) || 'Failed');
          }
          window.location.href = data.url;
        })
        .catch(function () {
          window.toast && window.toast('Could not prepare download. Try again later.', 'error');
        })
        .then(function () {
          btn.disabled = false;
          btn.textContent = originalText;
        });
    });
  }

  function init() {
    bindDownloads();
    load();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();