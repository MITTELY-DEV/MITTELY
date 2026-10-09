/* MITTELY — dashboard.js
   Renders the signed-in dashboard: profile, orders, reviews, wishlist, wallet,
   activity timeline, payout requests. Login-gated via auth.js. */
(function () {
  'use strict';

  function sb() { return window.mittely && window.mittely.sb && window.mittely.sb(); }
  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) { return window.escapeHtml ? window.escapeHtml(s) : String(s == null ? '' : s); }
  function money(usd) { return (window.mittelyCurrency && window.mittelyCurrency.format) ? window.mittelyCurrency.format(usd) : ('$' + Number(usd || 0).toFixed(2)); }
  function toast(m, k) { if (window.toast) window.toast(m, k); }
  function starsHtml(r) { var h='',n=Number(r)||0; for (var i=1;i<=5;i++){ if(n>=i)h+='<i class="fa-solid fa-star" aria-hidden="true"></i>'; else if(n>=i-0.5)h+='<i class="fa-solid fa-star-half-stroke" aria-hidden="true"></i>'; else h+='<i class="fa-regular fa-star" aria-hidden="true"></i>'; } return h; }

  var state = { user: null, email: null, activeTab: 'orders' };

  /* ================= Gate ================= */

  function toggleGate(signedIn) {
    var header = document.getElementById('dashboardHeader');
    var gate = document.getElementById('dashboardGate');
    var content = document.getElementById('dashboardContent');
    if (header) header.hidden = !signedIn;
    if (gate) gate.hidden = signedIn;
    if (content) content.hidden = !signedIn;
  }

  function hydrateProfile() {
    var user = state.user;
    if (!user) return;
    var name = (user.user_metadata && (user.user_metadata.full_name || user.user_metadata.name)) || user.email;
    var avatar = (user.user_metadata && user.user_metadata.avatar_url) || '';
    var a = document.getElementById('profileAvatar');
    var n = document.getElementById('profileName');
    var e = document.getElementById('profileEmail');
    if (a) a.src = avatar || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(name) + '&background=C6F13C&color=1A1F1A';
    if (n) n.textContent = name;
    if (e) e.textContent = user.email;
  }

  /* ================= Tab switching ================= */

  function setTab(name) {
    state.activeTab = name;
    qsa('.dash-tab').forEach(function (b) { b.classList.toggle('is-active', b.getAttribute('data-tab') === name); });
    qsa('.dash-panel').forEach(function (p) { p.hidden = p.id !== ('panel-' + name); });
    var hash = window.location.hash.replace('#', '');
    if (hash !== name) window.history.replaceState({}, '', '# ' + name === '# ' + '' ? '' : '#' + name);
    if (name === 'wallet') loadWallet();
    if (name === 'activity') loadActivity();
    if (name === 'orders') loadOrders();
    if (name === 'reviews') loadReviews();
    if (name === 'wishlist') loadWishlist();
  }

  function bindTabs() {
    qsa('.dash-tab').forEach(function (b) {
      b.addEventListener('click', function () { setTab(b.getAttribute('data-tab')); });
    });
    var hash = window.location.hash.replace('#', '');
    if (hash && ['orders','reviews','wishlist','wallet','activity'].indexOf(hash) !== -1) setTab(hash);
    else setTab('orders');
  }

  /* ================= Orders ================= */

  function loadOrders() {
    var list = document.getElementById('ordersList');
    var empty = document.getElementById('ordersEmpty');
    if (!list) return;
    list.innerHTML = '<div class="skeleton-line"></div><div class="skeleton-line"></div>';
    var client = sb();
    if (!client || !state.email) return;
    client.from('orders')
      .select('id,paystack_reference,amount,currency,usd_amount,status,created_at,order_items(id,price_paid,license,products(id,title,slug,image_url))')
      .eq('email', state.email)
      .order('created_at', { ascending: false })
      .then(function (res) {
        var rows = (res && res.data) || [];
        if (!rows.length) { list.innerHTML = ''; if (empty) empty.hidden = false; return; }
        if (empty) empty.hidden = true;
        list.innerHTML = rows.map(function (o) {
          var items = o.order_items || [];
          return '' +
            '<article class="order-row" data-order-id="' + esc(o.id) + '">' +
              '<header class="order-row-head">' +
                '<div>' +
                  '<div class="order-row-ref">' + esc(o.paystack_reference) + '</div>' +
                  '<div class="order-row-date">' + new Date(o.created_at).toLocaleString() + '</div>' +
                '</div>' +
                '<div class="order-row-total">' + money(o.usd_amount) + '</div>' +
                '<span class="status-badge status-' + esc(o.status) + '">' + esc(o.status) + '</span>' +
              '</header>' +
              '<div class="order-row-items">' +
                items.map(function (it) {
                  var p = it.products || {};
                  return '' +
                    '<div class="order-item-row">' +
                      '<img src="' + esc(p.image_url || 'https://images.unsplash.com/photo-1559028012-481c04fa702d?w=200&q=60') + '" alt="">' +
                      '<div><strong>' + esc(p.title || '—') + '</strong><br><span class="muted" style="font-size:.85em">' + esc(it.license) + '</span></div>' +
                      '<div style="display:flex;gap:6px">' +
                        '<button class="btn btn-outline btn-sm" type="button" data-download="' + esc(p.id || '') + '" data-ref="' + esc(o.paystack_reference) + '"><i class="fa-solid fa-download" aria-hidden="true"></i> Download</button>' +
                        '<button class="btn btn-ghost btn-sm" type="button" data-print="1"><i class="fa-solid fa-print" aria-hidden="true"></i></button>' +
                      '</div>' +
                    '</div>';
                }).join('') +
              '</div>' +
            '</article>';
        }).join('');

        qsa('[data-download]', list).forEach(function (b) {
          b.addEventListener('click', function () {
            b.classList.add('is-loading');
            client.functions.invoke('create-download-url', { body: { product_id: b.getAttribute('data-download'), order_reference: b.getAttribute('data-ref') } })
              .then(function (r) {
                b.classList.remove('is-loading');
                var url = r && r.data && r.data.url;
                if (!url) { toast('Could not create download.', 'error'); return; }
                window.location.href = url;
              }).catch(function () { b.classList.remove('is-loading'); toast('Could not create download.', 'error'); });
          });
        });
        qsa('[data-print]', list).forEach(function (b) {
          b.addEventListener('click', function () { window.print(); });
        });
      });
  }

  /* ================= Reviews ================= */

  function loadReviews() {
    var list = document.getElementById('reviewsList');
    var empty = document.getElementById('reviewsDashEmpty');
    if (!list) return;
    list.innerHTML = '<div class="skeleton-line"></div>';
    var client = sb();
    if (!client || !state.email) return;
    client.from('reviews')
      .select('id,rating,comment,status,created_at,products(title,slug)')
      .eq('email', state.email)
      .order('created_at', { ascending: false })
      .then(function (res) {
        var rows = (res && res.data) || [];
        if (!rows.length) { list.innerHTML = ''; if (empty) empty.hidden = false; return; }
        if (empty) empty.hidden = true;
        list.innerHTML = rows.map(function (r) {
          var p = r.products || {};
          return '' +
            '<article class="review-card">' +
              '<div class="review-card-head">' +
                '<div><div class="review-name">' + esc(p.title || 'Product') + '</div>' +
                '<div class="review-date">' + new Date(r.created_at).toLocaleDateString() + '</div></div>' +
                '<span class="status-badge status-' + esc(r.status) + '" style="margin-left:auto">' + esc(r.status) + '</span>' +
              '</div>' +
              '<div class="review-stars">' + starsHtml(r.rating) + '</div>' +
              '<p class="review-comment">' + esc(r.comment || '') + '</p>' +
            '</article>';
        }).join('');
        if (window.mittelyMain && window.mittelyMain.initReviewClamps) window.mittelyMain.initReviewClamps(list);
      });
  }

  /* ================= Wishlist ================= */

  function loadWishlist() {
    var grid = document.getElementById('wishlistGrid');
    var empty = document.getElementById('wishlistEmpty');
    if (!grid) return;
    var client = sb();
    if (!client || !state.email) return;
    client.from('wishlist')
      .select('product_id,products(id,title,slug,category,price,sale_price,rating,reviews_count,image_url,is_free,is_hot_sale,is_black_friday,is_featured,badge,is_published)')
      .eq('email', state.email)
      .then(function (res) {
        var rows = (res && res.data) || [];
        var products = rows.map(function (r) { return r.products; }).filter(function (p) { return p && p.is_published; });
        if (!products.length) { grid.innerHTML = ''; if (empty) empty.hidden = false; return; }
        if (empty) empty.hidden = true;
        if (window.mittelyProducts && window.mittelyProducts.renderGrid) {
          window.mittelyProducts.renderGrid(grid, products, empty);
        }
      });
  }

  /* ================= Wallet ================= */

  function loadWallet() {
    var client = sb();
    if (!client || !state.email) return;

    client.from('wallets').select('balance,updated_at').eq('email', state.email).maybeSingle()
      .then(function (res) {
        var bal = res && res.data ? Number(res.data.balance || 0) : 0;
        var balEl = document.getElementById('walletBalance');
        var ghsEl = document.getElementById('walletBalanceGhs');
        if (balEl) balEl.textContent = money(bal);
        if (ghsEl) {
          var rate = window.mittelyCurrency && window.mittelyCurrency.currentRate ? window.mittelyCurrency.currentRate() : 15.5;
          var fmt = new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS' });
          ghsEl.textContent = fmt.format(bal * rate);
        }
      });

    client.from('wallet_transactions')
      .select('type,amount,balance_after,note,created_at')
      .eq('email', state.email)
      .order('created_at', { ascending: false })
      .then(function (res) {
        var rows = (res && res.data) || [];
        var lifetime = 0, pending = 0;
        rows.forEach(function (r) {
          if (r.type === 'earning') lifetime += Number(r.amount);
          if (r.type === 'payout') pending += Number(r.amount);
        });
        var earnEl = document.getElementById('walletEarnings');
        var pendEl = document.getElementById('walletPending');
        if (earnEl) earnEl.textContent = money(lifetime);
        if (pendEl) pendEl.textContent = money(pending);

        var body = document.getElementById('walletTransactionsBody');
        if (!body) return;
        if (!rows.length) { body.innerHTML = '<tr><td colspan="5" class="cell-empty">No transactions yet.</td></tr>'; return; }
        body.innerHTML = rows.map(function (r) {
          return '<tr>' +
            '<td>' + new Date(r.created_at).toLocaleDateString() + '</td>' +
            '<td>' + esc(r.type) + '</td>' +
            '<td>' + money(r.amount) + '</td>' +
            '<td>' + money(r.balance_after) + '</td>' +
            '<td>' + esc(r.note || '') + '</td>' +
          '</tr>';
        }).join('');
      });

    client.from('payout_requests')
      .select('amount,status,note,created_at,handled_at')
      .eq('email', state.email)
      .order('created_at', { ascending: false })
      .then(function (res) {
        var rows = (res && res.data) || [];
        var body = document.getElementById('payoutHistoryBody');
        if (!body) return;
        if (!rows.length) { body.innerHTML = '<tr><td colspan="4" class="cell-empty">No payout requests yet.</td></tr>'; return; }
        body.innerHTML = rows.map(function (r) {
          return '<tr>' +
            '<td>' + new Date(r.created_at).toLocaleDateString() + '</td>' +
            '<td>' + money(r.amount) + '</td>' +
            '<td><span class="status-badge status-' + esc(r.status) + '">' + esc(r.status) + '</span></td>' +
            '<td>' + esc(r.note || '') + '</td>' +
          '</tr>';
        }).join('');
      });

    // Payout form
    var form = document.getElementById('payoutForm');
    if (form && form.dataset.bound !== '1') {
      form.dataset.bound = '1';
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var amtEl = document.getElementById('payoutAmount');
        var err = document.getElementById('payoutError');
        var ok = document.getElementById('payoutSuccess');
        var btn = document.getElementById('payoutSubmitBtn');
        if (err) err.hidden = true;
        if (ok) ok.hidden = true;
        var amt = parseFloat(amtEl.value);
        var MIN = (window.MITTELY_CONFIG && window.MITTELY_CONFIG.MIN_PAYOUT) || 20;
        if (!isFinite(amt) || amt < MIN) { if (err) { err.textContent = 'Minimum payout is $' + MIN.toFixed(2) + '.'; err.hidden = false; } return; }
        btn.classList.add('is-loading');
        client.rpc('request_payout', { p_amount: amt }).then(function (res) {
          btn.classList.remove('is-loading');
          var data = res && res.data;
          if (res.error || !data || !data.ok) {
            if (err) { err.textContent = (res.error && res.error.message) || (data && data.reason) || 'Request failed.'; err.hidden = false; }
            return;
          }
          if (ok) ok.hidden = false;
          amtEl.value = '';
          loadWallet();
        }).catch(function (e2) {
          btn.classList.remove('is-loading');
          if (err) { err.textContent = e2.message || 'Request failed.'; err.hidden = false; }
        });
      });
    }
  }

  /* ================= Activity ================= */

  var ACTIVITY_ICON = {
    signup: 'fa-solid fa-user-plus',
    sign_in: 'fa-solid fa-right-to-bracket',
    order: 'fa-solid fa-receipt',
    download: 'fa-solid fa-download',
    review: 'fa-solid fa-comment-dots',
    wishlist: 'fa-regular fa-heart',
    payout_request: 'fa-solid fa-money-bill-transfer',
    payout_paid: 'fa-solid fa-check'
  };

  function loadActivity() {
    var list = document.getElementById('activityTimeline');
    var empty = document.getElementById('activityEmpty');
    if (!list) return;
    var client = sb();
    if (!client || !state.email) return;
    list.innerHTML = '<li class="skeleton-line"></li>';
    client.from('activity_log')
      .select('event,meta,created_at')
      .eq('email', state.email)
      .order('created_at', { ascending: false })
      .limit(30)
      .then(function (res) {
        var rows = (res && res.data) || [];
        if (!rows.length) { list.innerHTML = ''; if (empty) empty.hidden = false; return; }
        if (empty) empty.hidden = true;
        list.innerHTML = rows.map(function (r) {
          var icon = ACTIVITY_ICON[r.event] || 'fa-solid fa-circle-info';
          var when = new Date(r.created_at).toLocaleString();
          return '<li class="activity-item">' +
            '<i class="' + icon + '" aria-hidden="true"></i>' +
            '<div><div>' + esc(r.event.replace(/_/g, ' ')) + '</div>' +
            '<div class="activity-meta">' + esc(when) + '</div></div>' +
          '</li>';
        }).join('');
      });
  }

  /* ================= Auth subscription ================= */

  function onAuthReady() {
    var user = window.mittelyAuth && window.mittelyAuth.getUser && window.mittelyAuth.getUser();
    state.user = user;
    state.email = user && user.email ? String(user.email).toLowerCase() : null;
    toggleGate(!!user);
    if (!user) return;
    hydrateProfile();
    bindTabs();
  }

  function onReady(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  onReady(function () {
    // Wait a tick for auth.js to resolve the session.
    setTimeout(onAuthReady, 300);
    window.addEventListener('mittely:auth-changed', onAuthReady);
    var client = sb();
    if (client) {
      client.auth.onAuthStateChange(function () { setTimeout(onAuthReady, 100); });
    }
  });
})();