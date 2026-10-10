/* ============================================
   MITTELY — dashboard.js
   Profile card, My Orders (expandable + invoice
   + downloads), My Reviews, My Wishlist.
   ============================================ */
(function () {
  'use strict';

  if (!window.MITTELY) window.MITTELY = {};

  var esc = function (s) { return window.MITTELY.main ? window.MITTELY.main.escapeHtml(s) : String(s || ''); };
  var money = function (n) { return window.MITTELY.currency ? window.MITTELY.currency.formatMoney(n) : ('$' + Number(n || 0).toFixed(2)); };
  var toast = function (m, t) { if (window.MITTELY.main) window.MITTELY.main.toast(m, t); };

  var currentEmail = null;

  /* ---------- Profile ---------- */

  function renderProfile(session) {
    if (!session || !session.user) return;
    var meta = session.user.user_metadata || {};
    var name = meta.full_name || meta.name || session.user.email;
    var avatar = meta.avatar_url || meta.picture || '';

    var nameEl = document.getElementById('profileName');
    var emailEl = document.getElementById('profileEmail');
    var avEl = document.getElementById('profileAvatar');
    var sinceEl = document.getElementById('profileMemberSince');

    if (nameEl) nameEl.textContent = name || '—';
    if (emailEl) emailEl.textContent = session.user.email || '—';
    if (sinceEl && session.user.created_at) {
      sinceEl.textContent = 'Member since ' + new Date(session.user.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
    }
    if (avEl) {
      avEl.innerHTML = avatar
        ? '<img src="' + esc(avatar) + '" alt="" referrerpolicy="no-referrer">'
        : '<span style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-weight:800;font-size:1.75rem;color:var(--highlight);">' + esc((name || 'U').charAt(0).toUpperCase()) + '</span>';
    }
  }

  /* ---------- Orders ---------- */

  async function loadOrders() {
    var list = document.getElementById('ordersList');
    var emptyEl = document.getElementById('ordersEmpty');
    if (!list || !window.MITTELY.supabase || !currentEmail) return;

    list.innerHTML = '<div class="skeleton-card"></div><div class="skeleton-card"></div>';
    if (emptyEl) emptyEl.style.display = 'none';

    try {
      var res = await window.MITTELY.supabase
        .from('orders').select('*')
        .eq('email', currentEmail)
        .order('created_at', { ascending: false });
      var orders = (res && res.data) || [];

      if (!orders.length) {
        list.innerHTML = '';
        if (emptyEl) emptyEl.style.display = 'flex';
        return;
      }

      var itemsRes = await window.MITTELY.supabase
        .from('order_items').select('*, products(id, title, image_url, slug)')
        .in('order_id', orders.map(function (o) { return o.id; }));
      var itemsByOrder = {};
      ((itemsRes && itemsRes.data) || []).forEach(function (it) {
        if (!itemsByOrder[it.order_id]) itemsByOrder[it.order_id] = [];
        itemsByOrder[it.order_id].push(it);
      });

      list.innerHTML = orders.map(function (o) {
        var items = itemsByOrder[o.id] || [];
        var itemsHtml = items.map(function (it) {
          var p = it.products || {};
          return '' +
            '<div class="order-item-row">' +
              '<img src="' + esc(p.image_url || '') + '" alt="">' +
              '<div class="oi-info">' +
                '<div class="oi-title">' + esc(p.title || 'Product') + '</div>' +
                '<div class="oi-meta">' + esc((it.license || 'standard').toUpperCase()) + ' · ' + money(it.price_paid) + '</div>' +
              '</div>' +
              (o.status === 'success' ?
                '<button class="btn btn-outline" data-download="' + esc(it.product_id) + '" data-ref="' + esc(o.paystack_reference) + '">' +
                  '<i class="fa-solid fa-download"></i> Download' +
                '</button>' : '') +
            '</div>';
        }).join('');

        var date = o.created_at ? new Date(o.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '';
        var statusClass = o.status === 'success' ? 'success' : (o.status === 'failed' ? 'failed' : 'pending');

        return '' +
          '<div class="order-card" data-order-id="' + esc(o.id) + '">' +
            '<div class="order-card-header">' +
              '<div>' +
                '<div class="order-card-ref">' + esc(o.paystack_reference || '—') + '</div>' +
                '<div class="order-card-meta">' +
                  '<span>' + esc(date) + '</span>' +
                  '<span>' + money(o.usd_amount) + '</span>' +
                  '<span class="order-status-badge ' + statusClass + '">' + esc(o.status || 'pending') + '</span>' +
                '</div>' +
              '</div>' +
              '<i class="fa-solid fa-chevron-down"></i>' +
            '</div>' +
            '<div class="order-card-body">' +
              '<div class="order-items-list">' + itemsHtml + '</div>' +
              '<div class="order-card-actions">' +
                '<button class="btn btn-outline" data-print="' + esc(o.id) + '"><i class="fa-solid fa-print"></i> Print invoice</button>' +
              '</div>' +
            '</div>' +
          '</div>';
      }).join('');

      list.querySelectorAll('.order-card-header').forEach(function (h) {
        h.addEventListener('click', function () {
          var card = h.closest('.order-card');
          if (card) card.classList.toggle('open');
        });
      });

      list.addEventListener('click', handleOrderAction);
    } catch (e) {
      list.innerHTML = '';
      if (emptyEl) emptyEl.style.display = 'flex';
    }
  }

  async function handleOrderAction(e) {
    var dl = e.target.closest('[data-download]');
    if (dl) {
      e.stopPropagation();
      var pid = dl.getAttribute('data-download');
      var ref = dl.getAttribute('data-ref');
      if (!pid) return;
      if (window.MITTELY.main) window.MITTELY.main.setLoading(dl, true, '<i class="fa-solid fa-spinner fa-spin"></i>');
      try {
        var res = await window.MITTELY.supabase.functions.invoke('create-download-url', {
          body: { product_id: pid, order_reference: ref }
        });
        if (res && res.error) throw res.error;
        var data = res && res.data;
        if (!data || !data.url) throw new Error('No URL');
        window.open(data.url, '_blank', 'noopener');
        toast('Download opened', 'success');
      } catch (err) {
        toast('Download failed', 'error');
      } finally {
        if (window.MITTELY.main) window.MITTELY.main.setLoading(dl, false);
      }
      return;
    }

    var pr = e.target.closest('[data-print]');
    if (pr) {
      e.stopPropagation();
      window.print();
    }
  }

  /* ---------- Reviews ---------- */

  async function loadUserReviews() {
    var list = document.getElementById('userReviewsList');
    var emptyEl = document.getElementById('userReviewsEmpty');
    if (!list || !window.MITTELY.supabase || !currentEmail) return;
    list.innerHTML = '<div class="skeleton-card"></div>';
    if (emptyEl) emptyEl.style.display = 'none';

    try {
      var res = await window.MITTELY.supabase
        .from('reviews').select('*, products(title, image_url)')
        .eq('email', currentEmail)
        .order('created_at', { ascending: false });
      var data = (res && res.data) || [];
      if (!data.length) {
        list.innerHTML = '';
        if (emptyEl) emptyEl.style.display = 'flex';
        return;
      }
      list.innerHTML = data.map(function (r) {
        var stars = '';
        for (var i = 0; i < 5; i++) stars += '<i class="fa-solid fa-star' + (i < (r.rating || 0) ? '' : ' style="opacity:0.3"') + '"></i>';
        var statusLabels = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' };
        var cls = r.status === 'approved' ? 'success' : (r.status === 'rejected' ? 'failed' : 'pending');
        return '' +
          '<div class="review-user-card">' +
            '<div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;">' +
              '<div style="font-weight:700;">' + esc((r.products && r.products.title) || 'Product') + '</div>' +
              '<span class="order-status-badge ' + cls + '">' + esc(statusLabels[r.status] || r.status) + '</span>' +
            '</div>' +
            '<div class="review-stars">' + stars + '</div>' +
            '<div class="review-body">' + esc(r.comment || '') + '</div>' +
            '<div class="review-date">' + (r.created_at ? new Date(r.created_at).toLocaleDateString() : '') + '</div>' +
          '</div>';
      }).join('');
    } catch (e) {
      list.innerHTML = '';
      if (emptyEl) emptyEl.style.display = 'flex';
    }
  }

  /* ---------- Wishlist ---------- */

  async function loadWishlist() {
    var grid = document.getElementById('wishlistGrid');
    var emptyEl = document.getElementById('wishlistEmpty');
    if (!grid || !window.MITTELY.supabase || !currentEmail) return;
    grid.innerHTML = '<div class="skeleton-card"></div>';
    if (emptyEl) emptyEl.style.display = 'none';

    try {
      var res = await window.MITTELY.supabase
        .from('wishlist').select('product_id, products(*)')
        .eq('email', currentEmail);
      var rows = (res && res.data) || [];
      var products = rows.map(function (r) { return r.products; }).filter(Boolean);
      if (!products.length) {
        grid.innerHTML = '';
        if (emptyEl) emptyEl.style.display = 'flex';
        return;
      }
      grid.innerHTML = products.map(function (p) {
        return window.MITTELY.products.productCardHtml(p);
      }).join('');
      if (window.MITTELY.products && typeof window.MITTELY.products.loadWishlistFlags === 'function') {
        window.MITTELY.products.loadWishlistFlags(grid);
      }
    } catch (e) {
      grid.innerHTML = '';
      if (emptyEl) emptyEl.style.display = 'flex';
    }
  }

  /* ---------- Tabs ---------- */

  function bindTabs() {
    var nav = document.querySelector('.dashboard-tabs .tab-nav');
    if (!nav || nav.dataset.bound === '1') return;
    nav.dataset.bound = '1';
    nav.addEventListener('click', function (e) {
      var btn = e.target.closest('.tab-btn');
      if (!btn) return;
      var tab = btn.getAttribute('data-tab');
      nav.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.toggle('active', b === btn); });
      document.querySelectorAll('.dashboard-tabs .tab-panel').forEach(function (p) {
        p.classList.toggle('active', p.id === 'tab-' + tab);
      });
    });
  }

  /* ---------- Init ---------- */

  async function init() {
    var gate = document.getElementById('dashboardAuthGate');
    var content = document.getElementById('dashboardContent');
    var signInBtn = document.getElementById('dashboardSignInBtn');
    if (signInBtn) signInBtn.addEventListener('click', function () { window.MITTELY.auth.openSignInModal(); });

    bindTabs();

    async function refresh() {
      var session = await window.MITTELY.auth.getSession();
      if (!session || !session.user) {
        if (gate) gate.style.display = 'block';
        if (content) content.style.display = 'none';
        return;
      }
      if (gate) gate.style.display = 'none';
      if (content) content.style.display = 'block';
      currentEmail = session.user.email;
      renderProfile(session);
      await Promise.all([loadOrders(), loadUserReviews(), loadWishlist()]);
    }

    document.addEventListener('mittely:auth-changed', refresh);
    await refresh();
  }

  window.MITTELY.dashboard = { init: init };
})();