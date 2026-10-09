/* MITTELY — admin.js
   Admin shell + sections: dashboard, products, orders, reviews, submissions,
   coupons, blog, users, activity, payouts, newsletter, settings, admins. */
(function () {
  'use strict';

  var state = {
    user: null, email: null, isAdmin: false,
    section: 'dashboard',
    settings: {},
    users: { page: 1, pageSize: 20, search: '' },
    activity: { event: '', page: 1, pageSize: 20 },
    currentChart: 'sales',
    currentPeriod: 30
  };

  function sb() { return window.mittely && window.mittely.sb && window.mittely.sb(); }
  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) { return window.escapeHtml ? window.escapeHtml(s) : String(s == null ? '' : s); }
  function money(usd) { return (window.mittelyCurrency && window.mittelyCurrency.format) ? window.mittelyCurrency.format(usd) : ('$' + Number(usd || 0).toFixed(2)); }
  function toast(m, k) { if (window.toast) window.toast(m, k); }
  function confirmTyped(message, expected) {
    var typed = window.prompt(message + '\n\nType "' + expected + '" to confirm:');
    return typed === expected;
  }

  /* ================= Gate ================= */

  function showGate(which) {
    qs('#adminGate').hidden = which !== 'gate';
    qs('#adminForbidden').hidden = which !== 'forbidden';
    qs('#adminShell').hidden = which !== 'shell';
  }

  function hydrateAdminUser() {
    var u = state.user;
    if (!u) return;
    var email = u.email || '';
    var avatar = (u.user_metadata && u.user_metadata.avatar_url) || '';
    var a = document.getElementById('adminAvatar');
    var e = document.getElementById('adminEmail');
    if (a) a.src = avatar || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(email);
    if (e) e.textContent = email;
  }

  /* ================= Sidebar ================= */

  function bindNav() {
    qsa('.admin-nav-item').forEach(function (b) {
      b.addEventListener('click', function () {
        var section = b.getAttribute('data-section');
        setSection(section);
      });
    });
    var hamburger = document.getElementById('adminHamburger');
    var sidebar = document.getElementById('adminSidebar');
    var closeBtn = document.getElementById('adminSidebarClose');
    if (hamburger && sidebar) hamburger.addEventListener('click', function () { sidebar.classList.add('is-open'); });
    if (closeBtn && sidebar) closeBtn.addEventListener('click', function () { sidebar.classList.remove('is-open'); });
  }

  function setSection(name) {
    state.section = name;
    qsa('.admin-nav-item').forEach(function (b) { b.classList.toggle('is-active', b.getAttribute('data-section') === name); });
    qsa('.admin-section').forEach(function (s) { s.hidden = s.id !== ('section-' + name); });
    var titleEl = document.getElementById('adminPageTitle');
    if (titleEl) titleEl.textContent = name.charAt(0).toUpperCase() + name.slice(1);
    var sidebar = document.getElementById('adminSidebar');
    if (sidebar) sidebar.classList.remove('is-open');

    switch (name) {
      case 'dashboard': loadDashboard(); break;
      case 'products': loadProducts(); break;
      case 'orders': loadOrders(); break;
      case 'reviews': loadReviews(); break;
      case 'submissions': loadSubmissions(); break;
      case 'coupons': loadCoupons(); break;
      case 'blog': loadBlog(); break;
      case 'users': loadUsers(); break;
      case 'activity': loadActivity(); break;
      case 'payouts': loadPayouts(); break;
      case 'newsletter': loadNewsletter(); break;
      case 'settings': loadSettings(); break;
      case 'admins': loadAdmins(); break;
    }
  }

  /* ================= Dashboard ================= */

  function loadDashboard() {
    var client = sb();
    if (!client) return;

    client.rpc('admin_stats').then(function (res) {
      var s = (res && res.data) || {};
      setText('statRevenueToday', money(s.revenue_today || 0));
      setText('statRevenueTodayGhs', ghsLabel(s.revenue_today || 0));
      setText('statRevenue7d', money(s.revenue_7d || 0));
      setText('statRevenue30d', money(s.revenue_30d || 0));
      setText('statRevenueAll', money(s.revenue_all || 0));
      setText('statOrders', String(s.orders_count || 0));
      setText('statDownloads', String(s.downloads_count || 0));
      setText('statPendingReviews', String(s.pending_reviews || 0));
      setText('statPendingSubs', String(s.pending_submissions || 0));
      setText('statPendingPayouts', String(s.pending_payouts || 0));
    }).catch(function () {});

    client.from('orders')
      .select('paystack_reference,email,usd_amount,currency,status,created_at')
      .order('created_at', { ascending: false })
      .limit(5)
      .then(function (res) {
        var body = document.getElementById('adminRecentOrders');
        if (!body) return;
        var rows = (res && res.data) || [];
        if (!rows.length) { body.innerHTML = '<tr><td colspan="5" class="cell-empty">No orders yet.</td></tr>'; return; }
        body.innerHTML = rows.map(function (o) {
          return '<tr>' +
            '<td>' + new Date(o.created_at).toLocaleDateString() + '</td>' +
            '<td>' + esc(o.paystack_reference) + '</td>' +
            '<td>' + esc(o.email) + '</td>' +
            '<td>' + money(o.usd_amount) + '</td>' +
            '<td><span class="status-badge status-' + esc(o.status) + '">' + esc(o.status) + '</span></td>' +
          '</tr>';
        }).join('');
      });

    client.from('activity_log')
      .select('email,event,created_at')
      .order('created_at', { ascending: false })
      .limit(8)
      .then(function (res) {
        var list = document.getElementById('adminRecentActivity');
        if (!list) return;
        var rows = (res && res.data) || [];
        if (!rows.length) { list.innerHTML = '<li class="activity-item"><i class="fa-solid fa-circle-info" aria-hidden="true"></i><div>No activity yet.</div></li>'; return; }
        list.innerHTML = rows.map(function (r) {
          return '<li class="activity-item">' +
            '<i class="fa-solid fa-circle-info" aria-hidden="true"></i>' +
            '<div><div>' + esc(r.event.replace(/_/g, ' ')) + ' — ' + esc(r.email) + '</div>' +
            '<div class="activity-meta">' + new Date(r.created_at).toLocaleString() + '</div></div>' +
          '</li>';
        }).join('');
      });

    bindChartSwitcher();
    renderChart(state.currentChart, state.currentPeriod);
  }

  function setText(id, value) { var el = document.getElementById(id); if (el) el.textContent = value; }

  function ghsLabel(usd) {
    var rate = window.mittelyCurrency && window.mittelyCurrency.currentRate ? window.mittelyCurrency.currentRate() : 15.5;
    try { return new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS' }).format(Number(usd || 0) * rate); }
    catch (e) { return 'GH₵ ' + (Number(usd || 0) * rate).toFixed(2); }
  }

  /* ================= Charts ================= */

  function bindChartSwitcher() {
    var sw = document.getElementById('chartSwitcher');
    if (sw && sw.dataset.bound !== '1') {
      sw.dataset.bound = '1';
      qsa('button', sw).forEach(function (b) {
        b.addEventListener('click', function () {
          qsa('button', sw).forEach(function (x) { x.classList.remove('is-active'); });
          b.classList.add('is-active');
          state.currentChart = b.getAttribute('data-chart');
          renderChart(state.currentChart, state.currentPeriod);
        });
      });
    }
    var sel = document.getElementById('chartPeriod');
    if (sel && sel.dataset.bound !== '1') {
      sel.dataset.bound = '1';
      sel.addEventListener('change', function () {
        state.currentPeriod = Number(sel.value) || 30;
        renderChart(state.currentChart, state.currentPeriod);
      });
    }
  }

  function renderChart(kind, period) {
    var canvas = document.getElementById('chartCanvas');
    var summary = document.getElementById('chartSummary');
    if (!canvas) return;
    var client = sb();
    if (!client) return;

    var since = new Date(Date.now() - period * 86400000).toISOString();
    var loader = Promise.resolve(null);

    if (kind === 'sales' || kind === 'revenue') {
      loader = client.from('orders')
        .select('usd_amount,created_at,status')
        .gte('created_at', since)
        .eq('status', 'success');
    } else if (kind === 'status') {
      loader = client.from('orders').select('status').gte('created_at', since);
    } else if (kind === 'top') {
      loader = client.from('products').select('title,sales_count').order('sales_count', { ascending: false }).limit(5);
    } else if (kind === 'downloads') {
      loader = client.from('products').select('title,download_count').order('download_count', { ascending: false }).limit(5);
    }

    loader.then(function (res) {
      var rows = (res && res.data) || [];
      if (kind === 'sales') {
        var series = bucketByDay(rows, period, function (r) { return Number(r.usd_amount || 0); });
        var total = series.reduce(function (a, b) { return a + b; }, 0);
        if (summary) summary.textContent = 'Total: ' + money(total) + ' over ' + period + ' days';
        drawBars(canvas, series);
      } else if (kind === 'revenue') {
        var seriesR = bucketByDay(rows, period, function (r) { return Number(r.usd_amount || 0); });
        var totalR = seriesR.reduce(function (a, b) { return a + b; }, 0);
        if (summary) summary.textContent = 'Revenue: ' + money(totalR);
        drawLine(canvas, seriesR);
      } else if (kind === 'status') {
        var counts = { pending: 0, success: 0, failed: 0 };
        rows.forEach(function (r) { counts[r.status] = (counts[r.status] || 0) + 1; });
        var total2 = rows.length || 1;
        if (summary) summary.textContent = rows.length + ' orders';
        drawDonut(canvas, [
          { label: 'Success', value: counts.success, color: '#16A34A' },
          { label: 'Pending', value: counts.pending, color: '#D97706' },
          { label: 'Failed', value: counts.failed, color: '#DC2626' }
        ], total2);
      } else if (kind === 'top' || kind === 'downloads') {
        var key = kind === 'top' ? 'sales_count' : 'download_count';
        if (summary) summary.textContent = kind === 'top' ? 'Top 5 by sales' : 'Top 5 by downloads';
        drawHBars(canvas, rows.map(function (r) { return { label: r.title, value: Number(r[key] || 0) }; }));
      }
    });
  }

  function bucketByDay(rows, days, valueFn) {
    var out = [];
    var now = new Date();
    var byDay = {};
    rows.forEach(function (r) {
      var d = new Date(r.created_at);
      var k = d.toISOString().slice(0, 10);
      byDay[k] = (byDay[k] || 0) + valueFn(r);
    });
    for (var i = days - 1; i >= 0; i--) {
      var d = new Date(now.getTime() - i * 86400000);
      var k = d.toISOString().slice(0, 10);
      out.push(byDay[k] || 0);
    }
    return out;
  }

  function drawBars(el, values) {
    var max = Math.max(1, Math.max.apply(null, values));
    el.innerHTML = values.map(function (v) {
      var pct = Math.max(2, Math.round((v / max) * 100));
      return '<div class="bar" style="height:' + pct + '%" title="' + v.toFixed(2) + '"></div>';
    }).join('');
  }

  function drawLine(el, values) {
    var max = Math.max(1, Math.max.apply(null, values));
    var w = 600, h = 220, pad = 12;
    var step = values.length > 1 ? (w - pad * 2) / (values.length - 1) : 0;
    var points = values.map(function (v, i) {
      var x = pad + i * step;
      var y = h - pad - ((v / max) * (h - pad * 2));
      return x.toFixed(1) + ',' + y.toFixed(1);
    }).join(' ');
    el.innerHTML = '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" width="100%" height="220" role="img" aria-label="Revenue trend">' +
      '<polyline points="' + points + '" fill="none" stroke="var(--highlight)" stroke-width="3" />' +
      '</svg>';
  }

  function drawDonut(el, segments, total) {
    var stops = [];
    var acc = 0;
    segments.forEach(function (s) {
      var pct = total > 0 ? (s.value / total) * 100 : 0;
      stops.push(s.color + ' ' + acc + '% ' + (acc + pct) + '%');
      acc += pct;
    });
    el.innerHTML = '' +
      '<div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">' +
      '<div class="donut" style="background:conic-gradient(' + stops.join(',') + ')"></div>' +
      '<ul style="list-style:none;margin:0;padding:0;display:grid;gap:6px">' +
      segments.map(function (s) {
        return '<li class="chart-legend-item"><span class="chart-legend-dot" style="background:' + s.color + '"></span> ' + esc(s.label) + ' — ' + s.value + '</li>';
      }).join('') +
      '</ul></div>';
  }

  function drawHBars(el, items) {
    var max = Math.max(1, Math.max.apply(null, items.map(function (i) { return i.value; })));
    el.innerHTML = items.map(function (i) {
      var pct = Math.max(4, Math.round((i.value / max) * 100));
      return '<div class="chart-hbar-row">' +
        '<span class="chart-hbar-label">' + esc(i.label) + '</span>' +
        '<span class="chart-hbar-bar" style="width:' + pct + '%"></span>' +
        '<span>' + i.value + '</span>' +
      '</div>';
    }).join('');
  }

  /* ================= Products ================= */

  var PRODUCT_COLS = 'id,title,slug,category,tech,style_tags,price,sale_price,rating,reviews_count,short_desc,long_desc,badge,image_url,gallery,demo_url,preview_embed_url,whats_included,version,changelog,is_free,is_hot_sale,is_black_friday,is_featured,is_published,download_path,designer_email,download_count,sales_count,created_at,updated_at';

  function loadProducts() {
    var client = sb();
    var body = document.getElementById('adminProductsBody');
    if (!client || !body) return;
    body.innerHTML = '<tr><td colspan="7" class="cell-empty">Loading…</td></tr>';
    client.from('products').select(PRODUCT_COLS).order('created_at', { ascending: false })
      .then(function (res) {
        var rows = (res && res.data) || [];
        if (!rows.length) { body.innerHTML = '<tr><td colspan="7" class="cell-empty">No products.</td></tr>'; return; }
        body.innerHTML = rows.map(function (p) {
          var flags = [];
          if (p.is_hot_sale) flags.push('<i class="fa-solid fa-star" title="Hot Sale"></i>');
          if (p.is_black_friday) flags.push('<i class="fa-solid fa-heart" title="Black Friday"></i>');
          if (p.is_featured) flags.push('<i class="fa-solid fa-wand-magic-sparkles" title="Featured"></i>');
          if (p.is_free) flags.push('<i class="fa-solid fa-gift" title="Free"></i>');
          return '<tr>' +
            '<td>' + esc(p.title) + '</td>' +
            '<td>' + esc(p.category) + '</td>' +
            '<td>' + money(p.sale_price || p.price) + '</td>' +
            '<td>' + esc(p.designer_email || '—') + '</td>' +
            '<td>' + flags.join(' ') + '</td>' +
            '<td>' + (p.is_published ? '<i class="fa-solid fa-check" style="color:var(--success)"></i>' : '<i class="fa-solid fa-xmark" style="color:var(--danger)"></i>') + '</td>' +
            '<td><span class="table-actions">' +
              '<button type="button" data-edit="' + esc(p.id) + '" aria-label="Edit"><i class="fa-solid fa-pen"></i></button>' +
              '<button type="button" data-dup="' + esc(p.id) + '" aria-label="Duplicate"><i class="fa-regular fa-copy"></i></button>' +
              '<button type="button" data-del="' + esc(p.id) + '" aria-label="Delete"><i class="fa-solid fa-trash"></i></button>' +
            '</span></td>' +
          '</tr>';
        }).join('');

        qsa('[data-edit]', body).forEach(function (b) {
          b.addEventListener('click', function () { editProduct(b.getAttribute('data-edit')); });
        });
        qsa('[data-dup]', body).forEach(function (b) {
          b.addEventListener('click', function () { duplicateProduct(b.getAttribute('data-dup')); });
        });
        qsa('[data-del]', body).forEach(function (b) {
          b.addEventListener('click', function () { deleteProduct(b.getAttribute('data-del')); });
        });
      });

    var newBtn = document.getElementById('newProductBtn');
    if (newBtn && newBtn.dataset.bound !== '1') {
      newBtn.dataset.bound = '1';
      newBtn.addEventListener('click', function () { editProduct(null); });
    }
  }

  function editProduct(id) {
    var client = sb();
    if (!client) return;
    var promptDone = Promise.resolve(null);
    if (id) promptDone = client.from('products').select('*').eq('id', id).maybeSingle();

    promptDone.then(function (res) {
      var p = (res && res.data) || {};
      var title = window.prompt('Title', p.title || '');
      if (title === null) return;
      var category = window.prompt('Category (ui-kits, dashboards, landing-pages, ecommerce, portfolios, mobile-apps)', p.category || 'ui-kits');
      if (category === null) return;
      var price = window.prompt('Price (USD)', p.price != null ? String(p.price) : '');
      if (price === null) return;
      var sale = window.prompt('Sale price (leave empty for none)', p.sale_price != null ? String(p.sale_price) : '');
      var designerEmail = window.prompt('Designer email (wallet payee)', p.designer_email || (window.MITTELY_CONFIG && window.MITTELY_CONFIG.ADMIN_EMAIL) || '');
      var slug = p.slug || (window.mittely && window.mittely.slugify ? window.mittely.slugify(title) : title.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
      var payload = {
        title: title,
        slug: slug,
        category: category,
        price: parseFloat(price) || 0,
        sale_price: sale ? parseFloat(sale) : null,
        designer_email: designerEmail || null
      };
      if (id) {
        client.from('products').update(payload).eq('id', id).then(function (r) {
          if (r.error) { toast('Update failed: ' + r.error.message, 'error'); return; }
          toast('Product updated.', 'success'); loadProducts();
        });
      } else {
        client.from('products').insert(payload).then(function (r) {
          if (r.error) { toast('Create failed: ' + r.error.message, 'error'); return; }
          toast('Product created.', 'success'); loadProducts();
        });
      }
    });
  }

  function duplicateProduct(id) {
    var client = sb();
    if (!client) return;
    client.from('products').select('*').eq('id', id).maybeSingle().then(function (res) {
      var p = res && res.data;
      if (!p) return;
      delete p.id; delete p.created_at; delete p.updated_at;
      p.title = p.title + ' (copy)';
      p.slug = p.slug + '-copy-' + Math.random().toString(36).slice(2, 6);
      p.is_published = false;
      client.from('products').insert(p).then(function (r) {
        if (r.error) { toast('Duplicate failed.', 'error'); return; }
        toast('Duplicated.', 'success'); loadProducts();
      });
    });
  }

  function deleteProduct(id) {
    if (!confirmTyped('Delete this product permanently?', 'DELETE')) return;
    sb().from('products').delete().eq('id', id).then(function (r) {
      if (r.error) { toast('Delete failed.', 'error'); return; }
      toast('Deleted.', 'success'); loadProducts();
    });
  }

  /* ================= Orders ================= */

  function loadOrders() {
    var client = sb();
    var body = document.getElementById('adminOrdersBody');
    if (!client || !body) return;
    var status = document.getElementById('orderStatusFilter') ? document.getElementById('orderStatusFilter').value : '';
    var search = document.getElementById('orderSearch') ? document.getElementById('orderSearch').value.trim() : '';
    var q = client.from('orders').select('*').order('created_at', { ascending: false }).limit(50);
    if (status) q = q.eq('status', status);
    if (search) q = q.or('email.ilike.%' + search + '%,paystack_reference.ilike.%' + search + '%');
    q.then(function (res) {
      var rows = (res && res.data) || [];
      if (!rows.length) { body.innerHTML = '<tr><td colspan="7" class="cell-empty">No orders.</td></tr>'; return; }
      body.innerHTML = rows.map(function (o) {
        return '<tr>' +
          '<td>' + new Date(o.created_at).toLocaleDateString() + '</td>' +
          '<td>' + esc(o.paystack_reference) + '</td>' +
          '<td>' + esc(o.email) + '</td>' +
          '<td>' + money(o.usd_amount) + '</td>' +
          '<td>' + esc(o.currency) + '</td>' +
          '<td><span class="status-badge status-' + esc(o.status) + '">' + esc(o.status) + '</span></td>' +
          '<td><span class="table-actions">' +
            '<button type="button" data-status="' + esc(o.id) + '" data-current="' + esc(o.status) + '" aria-label="Change status"><i class="fa-solid fa-pen"></i></button>' +
          '</span></td>' +
        '</tr>';
      }).join('');
      qsa('[data-status]', body).forEach(function (b) {
        b.addEventListener('click', function () {
          var id = b.getAttribute('data-status');
          var cur = b.getAttribute('data-current');
          var next = window.prompt('New status: pending | success | failed', cur);
          if (!next || ['pending','success','failed'].indexOf(next) === -1) return;
          if (!window.confirm('Change order status to "' + next + '"?')) return;
          client.from('orders').update({ status: next }).eq('id', id).then(function (r) {
            if (r.error) { toast('Update failed.', 'error'); return; }
            toast('Status updated.', 'success'); loadOrders();
          });
        });
      });
    });

    ['orderStatusFilter','orderSearch'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el && el.dataset.bound !== '1') {
        el.dataset.bound = '1';
        el.addEventListener('change', loadOrders);
        if (el.tagName === 'INPUT') el.addEventListener('input', window.debounce(loadOrders, 260));
      }
    });
  }

  /* ================= Reviews ================= */

  function loadReviews() {
    var client = sb();
    var body = document.getElementById('adminReviewsBody');
    if (!client || !body) return;
    var status = document.getElementById('reviewStatusFilter') ? document.getElementById('reviewStatusFilter').value : 'pending';
    var q = client.from('reviews').select('id,name,rating,comment,status,created_at,products(title)').order('created_at', { ascending: false });
    if (status) q = q.eq('status', status);
    q.then(function (res) {
      var rows = (res && res.data) || [];
      if (!rows.length) { body.innerHTML = '<tr><td colspan="7" class="cell-empty">No reviews.</td></tr>'; return; }
      body.innerHTML = rows.map(function (r) {
        return '<tr>' +
          '<td><input type="checkbox" data-select-review="' + esc(r.id) + '" aria-label="Select review"></td>' +
          '<td>' + esc((r.products && r.products.title) || '—') + '</td>' +
          '<td>' + esc(r.name) + '</td>' +
          '<td>' + r.rating + '</td>' +
          '<td>' + esc((r.comment || '').slice(0, 90)) + '</td>' +
          '<td><span class="status-badge status-' + esc(r.status) + '">' + esc(r.status) + '</span></td>' +
          '<td><span class="table-actions">' +
            '<button type="button" data-approve="' + esc(r.id) + '" aria-label="Approve"><i class="fa-solid fa-check"></i></button>' +
            '<button type="button" data-reject="' + esc(r.id) + '" aria-label="Reject"><i class="fa-solid fa-xmark"></i></button>' +
          '</span></td>' +
        '</tr>';
      }).join('');
      qsa('[data-approve]', body).forEach(function (b) {
        b.addEventListener('click', function () { updateReview(b.getAttribute('data-approve'), 'approved'); });
      });
      qsa('[data-reject]', body).forEach(function (b) {
        b.addEventListener('click', function () { updateReview(b.getAttribute('data-reject'), 'rejected'); });
      });
    });

    var sel = document.getElementById('reviewStatusFilter');
    if (sel && sel.dataset.bound !== '1') {
      sel.dataset.bound = '1';
      sel.addEventListener('change', loadReviews);
    }
    var bulk = document.getElementById('bulkApproveBtn');
    if (bulk && bulk.dataset.bound !== '1') {
      bulk.dataset.bound = '1';
      bulk.addEventListener('click', function () {
        var ids = qsa('[data-select-review]').filter(function (c) { return c.checked; }).map(function (c) { return c.getAttribute('data-select-review'); });
        if (!ids.length) { toast('Select reviews first.', 'error'); return; }
        sb().from('reviews').update({ status: 'approved' }).in('id', ids).then(function (r) {
          if (r.error) { toast('Bulk approve failed.', 'error'); return; }
          toast('Approved ' + ids.length + ' reviews.', 'success'); loadReviews();
        });
      });
    }
    var selAll = document.getElementById('reviewSelectAll');
    if (selAll && selAll.dataset.bound !== '1') {
      selAll.dataset.bound = '1';
      selAll.addEventListener('change', function () {
        qsa('[data-select-review]').forEach(function (c) { c.checked = selAll.checked; });
      });
    }
  }

  function updateReview(id, status) {
    sb().from('reviews').update({ status: status }).eq('id', id).then(function (r) {
      if (r.error) { toast('Update failed.', 'error'); return; }
      toast('Review ' + status + '.', 'success'); loadReviews();
    });
  }

  /* ================= Submissions ================= */

  function loadSubmissions() {
    var client = sb();
    var body = document.getElementById('adminSubsBody');
    if (!client || !body) return;
    var status = document.getElementById('subStatusFilter') ? document.getElementById('subStatusFilter').value : 'pending';
    var q = client.from('submissions').select('*').order('created_at', { ascending: false });
    if (status) q = q.eq('status', status);
    q.then(function (res) {
      var rows = (res && res.data) || [];
      if (!rows.length) { body.innerHTML = '<tr><td colspan="6" class="cell-empty">No submissions.</td></tr>'; return; }
      body.innerHTML = rows.map(function (s) {
        return '<tr>' +
          '<td>' + new Date(s.created_at).toLocaleDateString() + '</td>' +
          '<td>' + esc(s.designer_name || '') + '<br><span class="muted" style="font-size:.85em">' + esc(s.designer_email || '') + '</span></td>' +
          '<td>' + esc(s.product_title || '') + '</td>' +
          '<td>' + esc(s.category || '') + '</td>' +
          '<td><span class="status-badge status-' + esc(s.status) + '">' + esc(s.status) + '</span></td>' +
          '<td><span class="table-actions">' +
            '<button type="button" data-detail="' + esc(s.id) + '" aria-label="View detail"><i class="fa-regular fa-eye"></i></button>' +
            '<button type="button" data-copy="' + esc(s.designer_email || '') + '" aria-label="Copy email"><i class="fa-regular fa-copy"></i></button>' +
            '<button type="button" data-accept="' + esc(s.id) + '" aria-label="Accept"><i class="fa-solid fa-check"></i></button>' +
            '<button type="button" data-rej="' + esc(s.id) + '" aria-label="Reject"><i class="fa-solid fa-xmark"></i></button>' +
          '</span></td>' +
        '</tr>';
      }).join('');
      qsa('[data-accept]', body).forEach(function (b) { b.addEventListener('click', function () { updateSub(b.getAttribute('data-accept'), 'accepted'); }); });
      qsa('[data-rej]', body).forEach(function (b) { b.addEventListener('click', function () { updateSub(b.getAttribute('data-rej'), 'rejected'); }); });
      qsa('[data-copy]', body).forEach(function (b) {
        b.addEventListener('click', function () {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(b.getAttribute('data-copy')).then(function () { toast('Email copied.', 'success'); });
          }
        });
      });
      qsa('[data-detail]', body).forEach(function (b) {
        b.addEventListener('click', function () {
          var id = b.getAttribute('data-detail');
          client.from('submissions').select('*').eq('id', id).maybeSingle().then(function (rr) {
            var s = rr && rr.data; if (!s) return;
            window.alert('Designer: ' + (s.designer_name || '') + '\nEmail: ' + (s.designer_email || '') +
              '\nProduct: ' + (s.product_title || '') + '\nCategory: ' + (s.category || '') +
              '\nDemo: ' + (s.demo_url || '—') + '\nPortfolio: ' + (s.portfolio_url || '—') +
              '\n\n' + (s.description || ''));
          });
        });
      });
    });
    var sel = document.getElementById('subStatusFilter');
    if (sel && sel.dataset.bound !== '1') { sel.dataset.bound = '1'; sel.addEventListener('change', loadSubmissions); }
  }

  function updateSub(id, status) {
    sb().from('submissions').update({ status: status }).eq('id', id).then(function (r) {
      if (r.error) { toast('Update failed.', 'error'); return; }
      toast('Submission ' + status + '.', 'success'); loadSubmissions();
    });
  }

  /* ================= Coupons ================= */

  function loadCoupons() {
    var client = sb();
    var body = document.getElementById('adminCouponsBody');
    if (!client || !body) return;
    client.from('coupons').select('*').order('created_at', { ascending: false }).then(function (res) {
      var rows = (res && res.data) || [];
      if (!rows.length) { body.innerHTML = '<tr><td colspan="9" class="cell-empty">No coupons.</td></tr>'; return; }
      body.innerHTML = rows.map(function (c) {
        return '<tr>' +
          '<td>' + esc(c.code) + '</td>' +
          '<td>' + esc(c.type) + '</td>' +
          '<td>' + (c.type === 'percent' ? c.value + '%' : money(c.value)) + '</td>' +
          '<td>' + money(c.min_subtotal) + '</td>' +
          '<td>' + (c.used_count || 0) + '</td>' +
          '<td>' + (c.max_uses != null ? c.max_uses : '∞') + '</td>' +
          '<td>' + (c.expires_at ? new Date(c.expires_at).toLocaleDateString() : '—') + '</td>' +
          '<td>' + (c.is_active ? '<i class="fa-solid fa-check" style="color:var(--success)"></i>' : '<i class="fa-solid fa-xmark" style="color:var(--danger)"></i>') + '</td>' +
          '<td><span class="table-actions">' +
            '<button type="button" data-cedit="' + esc(c.id) + '" aria-label="Edit"><i class="fa-solid fa-pen"></i></button>' +
            '<button type="button" data-ctoggle="' + esc(c.id) + '" data-active="' + (c.is_active ? '1' : '0') + '" aria-label="Toggle"><i class="fa-solid fa-power-off"></i></button>' +
            '<button type="button" data-cdel="' + esc(c.id) + '" aria-label="Delete"><i class="fa-solid fa-trash"></i></button>' +
          '</span></td>' +
        '</tr>';
      }).join('');

      qsa('[data-cedit]', body).forEach(function (b) {
        b.addEventListener('click', function () { editCoupon(b.getAttribute('data-cedit')); });
      });
      qsa('[data-ctoggle]', body).forEach(function (b) {
        b.addEventListener('click', function () {
          var id = b.getAttribute('data-ctoggle');
          var active = b.getAttribute('data-active') === '1';
          client.from('coupons').update({ is_active: !active }).eq('id', id).then(function () { loadCoupons(); });
        });
      });
      qsa('[data-cdel]', body).forEach(function (b) {
        b.addEventListener('click', function () {
          if (!confirmTyped('Delete this coupon?', 'DELETE')) return;
          client.from('coupons').delete().eq('id', b.getAttribute('data-cdel')).then(function () { loadCoupons(); });
        });
      });
    });
    var newBtn = document.getElementById('newCouponBtn');
    if (newBtn && newBtn.dataset.bound !== '1') {
      newBtn.dataset.bound = '1';
      newBtn.addEventListener('click', function () { editCoupon(null); });
    }
  }

  function editCoupon(id) {
    var client = sb();
    if (!client) return;
    var prep = id ? client.from('coupons').select('*').eq('id', id).maybeSingle() : Promise.resolve({ data: {} });
    prep.then(function (res) {
      var c = (res && res.data) || {};
      var code = window.prompt('Code', c.code || '');
      if (code === null) return;
      var type = window.prompt('Type (percent | fixed)', c.type || 'percent');
      if (type === null) return;
      var value = window.prompt('Value', c.value != null ? String(c.value) : '');
      if (value === null) return;
      var min = window.prompt('Min subtotal (USD)', c.min_subtotal != null ? String(c.min_subtotal) : '0');
      var maxUses = window.prompt('Max uses (empty = unlimited)', c.max_uses != null ? String(c.max_uses) : '');
      var expires = window.prompt('Expires at (ISO date, empty for none)', c.expires_at || '');
      var payload = {
        code: String(code).trim().toUpperCase(),
        type: type === 'fixed' ? 'fixed' : 'percent',
        value: parseFloat(value) || 0,
        min_subtotal: parseFloat(min) || 0,
        max_uses: maxUses ? parseInt(maxUses, 10) : null,
        expires_at: expires ? new Date(expires).toISOString() : null
      };
      if (id) client.from('coupons').update(payload).eq('id', id).then(function () { toast('Coupon updated.', 'success'); loadCoupons(); });
      else client.from('coupons').insert(payload).then(function (r) {
        if (r.error) { toast('Create failed: ' + r.error.message, 'error'); return; }
        toast('Coupon created.', 'success'); loadCoupons();
      });
    });
  }

  /* ================= Blog ================= */

  function loadBlog() {
    var client = sb();
    var body = document.getElementById('adminBlogBody');
    if (!client || !body) return;
    client.from('blog_posts').select('id,title,slug,status,views_count,updated_at').order('updated_at', { ascending: false })
      .then(function (res) {
        var rows = (res && res.data) || [];
        if (!rows.length) { body.innerHTML = '<tr><td colspan="6" class="cell-empty">No posts.</td></tr>'; return; }
        body.innerHTML = rows.map(function (p) {
          return '<tr>' +
            '<td>' + esc(p.title) + '</td>' +
            '<td>' + esc(p.slug) + '</td>' +
            '<td><span class="status-badge status-' + (p.status === 'published' ? 'success' : 'pending') + '">' + esc(p.status) + '</span></td>' +
            '<td>' + (p.views_count || 0) + '</td>' +
            '<td>' + new Date(p.updated_at).toLocaleDateString() + '</td>' +
            '<td><span class="table-actions">' +
              '<button type="button" data-bview="' + esc(p.slug) + '" aria-label="View"><i class="fa-solid fa-arrow-up-right-from-square"></i></button>' +
              '<button type="button" data-bedit="' + esc(p.id) + '" aria-label="Edit"><i class="fa-solid fa-pen"></i></button>' +
              '<button type="button" data-bdel="' + esc(p.id) + '" aria-label="Delete"><i class="fa-solid fa-trash"></i></button>' +
            '</span></td>' +
          '</tr>';
        }).join('');
        qsa('[data-bview]', body).forEach(function (b) {
          b.addEventListener('click', function () { window.open('blog.html?slug=' + encodeURIComponent(b.getAttribute('data-bview')), '_blank', 'noopener'); });
        });
        qsa('[data-bedit]', body).forEach(function (b) {
          b.addEventListener('click', function () { editPost(b.getAttribute('data-bedit')); });
        });
        qsa('[data-bdel]', body).forEach(function (b) {
          b.addEventListener('click', function () {
            if (!confirmTyped('Delete this post?', 'DELETE')) return;
            client.from('blog_posts').delete().eq('id', b.getAttribute('data-bdel')).then(function () { loadBlog(); });
          });
        });
      });
    var newBtn = document.getElementById('newPostBtn');
    if (newBtn && newBtn.dataset.bound !== '1') {
      newBtn.dataset.bound = '1';
      newBtn.addEventListener('click', function () { editPost(null); });
    }
  }

  function editPost(id) {
    var client = sb();
    if (!client) return;
    var prep = id ? client.from('blog_posts').select('*').eq('id', id).maybeSingle() : Promise.resolve({ data: {} });
    prep.then(function (res) {
      var p = (res && res.data) || {};
      var title = window.prompt('Title', p.title || '');
      if (title === null) return;
      var slug = window.prompt('Slug', p.slug || (window.mittely.slugify ? window.mittely.slugify(title) : ''));
      if (slug === null) return;
      var excerpt = window.prompt('Excerpt', p.excerpt || '');
      var content = window.prompt('Content (HTML allowed, sanitized on render)', p.content || '');
      var cover = window.prompt('Cover image URL', p.cover_image || '');
      var tags = window.prompt('Tags (comma separated)', p.tags || '');
      var status = window.prompt('Status (draft | published)', p.status || 'draft');
      var payload = {
        title: title, slug: slug, excerpt: excerpt || '',
        content: content || '', cover_image: cover || '',
        tags: tags || '', status: status === 'published' ? 'published' : 'draft'
      };
      if (id) client.from('blog_posts').update(payload).eq('id', id).then(function () { toast('Post updated.', 'success'); loadBlog(); });
      else client.from('blog_posts').insert(payload).then(function (r) {
        if (r.error) { toast('Create failed: ' + r.error.message, 'error'); return; }
        toast('Post created.', 'success'); loadBlog();
      });
    });
  }

  /* ================= Users ================= */

  function loadUsers() {
    var client = sb();
    var body = document.getElementById('adminUsersBody');
    if (!client || !body) return;
    body.innerHTML = '<tr><td colspan="7" class="cell-empty">Loading…</td></tr>';
    client.rpc('admin_list_users', {
      p_search: state.users.search || null,
      p_limit: state.users.pageSize,
      p_offset: (state.users.page - 1) * state.users.pageSize
    }).then(function (res) {
      var rows = (res && res.data) || [];
      if (!rows.length) { body.innerHTML = '<tr><td colspan="7" class="cell-empty">No users.</td></tr>'; return; }
      body.innerHTML = rows.map(function (u) {
        return '<tr>' +
          '<td>' + esc(u.name || '—') + '</td>' +
          '<td>' + esc(u.email) + '</td>' +
          '<td>' + (u.orders_count || 0) + '</td>' +
          '<td>' + money(u.total_spent || 0) + '</td>' +
          '<td>' + (u.downloads || 0) + '</td>' +
          '<td>' + money(u.wallet_balance || 0) + '</td>' +
          '<td><span class="table-actions">' +
            '<button type="button" data-udetail="' + esc(u.email) + '" aria-label="Details"><i class="fa-regular fa-eye"></i></button>' +
            '<button type="button" data-uadjust="' + esc(u.email) + '" aria-label="Adjust balance"><i class="fa-solid fa-wallet"></i></button>' +
          '</span></td>' +
        '</tr>';
      }).join('');

      qsa('[data-udetail]', body).forEach(function (b) {
        b.addEventListener('click', function () { showUserDetail(b.getAttribute('data-udetail')); });
      });
      qsa('[data-uadjust]', body).forEach(function (b) {
        b.addEventListener('click', function () { adjustBalance(b.getAttribute('data-uadjust')); });
      });
    });

    var search = document.getElementById('userSearch');
    if (search && search.dataset.bound !== '1') {
      search.dataset.bound = '1';
      search.addEventListener('input', window.debounce(function () {
        state.users.search = search.value.trim();
        state.users.page = 1;
        loadUsers();
      }, 260));
    }
  }

  function showUserDetail(email) {
    var client = sb();
    if (!client) return;
    Promise.all([
      client.from('orders').select('paystack_reference,usd_amount,status,created_at').eq('email', email).order('created_at', { ascending: false }).limit(10),
      client.from('wallet_transactions').select('type,amount,note,created_at').eq('email', email).order('created_at', { ascending: false }).limit(15),
      client.from('activity_log').select('event,meta,created_at').eq('email', email).order('created_at', { ascending: false }).limit(15)
    ]).then(function (res) {
      var orders = (res[0] && res[0].data) || [];
      var wallet = (res[1] && res[1].data) || [];
      var activity = (res[2] && res[2].data) || [];
      var lines = [];
      lines.push('=== Orders (' + orders.length + ') ===');
      orders.forEach(function (o) { lines.push(new Date(o.created_at).toLocaleDateString() + ' · ' + o.paystack_reference + ' · ' + money(o.usd_amount) + ' · ' + o.status); });
      lines.push('');
      lines.push('=== Wallet (' + wallet.length + ') ===');
      wallet.forEach(function (w) { lines.push(new Date(w.created_at).toLocaleDateString() + ' · ' + w.type + ' · ' + money(w.amount) + ' · ' + (w.note || '')); });
      lines.push('');
      lines.push('=== Activity (' + activity.length + ') ===');
      activity.forEach(function (a) { lines.push(new Date(a.created_at).toLocaleDateString() + ' · ' + a.event); });
      window.alert(email + '\n\n' + lines.join('\n'));
    });
  }

  function adjustBalance(email) {
    var amount = window.prompt('Adjust balance for ' + email + ' (positive to add, negative to deduct):');
    if (amount === null) return;
    var num = parseFloat(amount);
    if (!isFinite(num) || num === 0) { toast('Invalid amount.', 'error'); return; }
    var note = window.prompt('Required note:');
    if (!note) { toast('Note is required.', 'error'); return; }
    sb().rpc('credit_wallet', { p_email: email, p_amount: num, p_type: 'adjustment', p_note: note }).then(function (r) {
      if (r.error) { toast('Adjust failed.', 'error'); return; }
      toast('Balance adjusted.', 'success'); loadUsers();
    });
  }

  /* ================= Activity ================= */

  function loadActivity() {
    var client = sb();
    var body = document.getElementById('adminActivityBody');
    if (!client || !body) return;
    var q = client.from('activity_log')
      .select('email,event,meta,created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((state.activity.page - 1) * state.activity.pageSize, state.activity.page * state.activity.pageSize - 1);
    if (state.activity.event) q = q.eq('event', state.activity.event);
    q.then(function (res) {
      var rows = (res && res.data) || [];
      if (!rows.length) { body.innerHTML = '<tr><td colspan="4" class="cell-empty">No activity.</td></tr>'; return; }
      body.innerHTML = rows.map(function (r) {
        return '<tr>' +
          '<td>' + new Date(r.created_at).toLocaleString() + '</td>' +
          '<td>' + esc(r.email) + '</td>' +
          '<td>' + esc(r.event) + '</td>' +
          '<td>' + esc(JSON.stringify(r.meta || {})) + '</td>' +
        '</tr>';
      }).join('');
    });
    var chips = document.getElementById('activityChips');
    if (chips && chips.dataset.bound !== '1') {
      chips.dataset.bound = '1';
      qsa('button', chips).forEach(function (b) {
        b.addEventListener('click', function () {
          qsa('button', chips).forEach(function (x) { x.classList.remove('is-active'); });
          b.classList.add('is-active');
          state.activity.event = b.getAttribute('data-event') || '';
          state.activity.page = 1;
          loadActivity();
        });
      });
    }
  }

  /* ================= Payouts ================= */

  function loadPayouts() {
    var client = sb();
    if (!client) return;
    client.from('payout_requests').select('*').eq('status', 'pending').order('created_at')
      .then(function (res) {
        var body = document.getElementById('adminPayoutsPendingBody');
        if (!body) return;
        var rows = (res && res.data) || [];
        if (!rows.length) { body.innerHTML = '<tr><td colspan="5" class="cell-empty">No pending payouts.</td></tr>'; return; }
        body.innerHTML = rows.map(function (p) {
          return '<tr>' +
            '<td>' + new Date(p.created_at).toLocaleDateString() + '</td>' +
            '<td>' + esc(p.email) + '</td>' +
            '<td>' + money(p.amount) + '</td>' +
            '<td>' + esc(p.note || '') + '</td>' +
            '<td><span class="table-actions">' +
              '<button type="button" data-ppaid="' + esc(p.id) + '" aria-label="Mark paid"><i class="fa-solid fa-check"></i></button>' +
              '<button type="button" data-prej="' + esc(p.id) + '" aria-label="Reject"><i class="fa-solid fa-xmark"></i></button>' +
            '</span></td>' +
          '</tr>';
        }).join('');
        qsa('[data-ppaid]', body).forEach(function (b) {
          b.addEventListener('click', function () { handlePayout(b.getAttribute('data-ppaid'), 'paid'); });
        });
        qsa('[data-prej]', body).forEach(function (b) {
          b.addEventListener('click', function () { handlePayout(b.getAttribute('data-prej'), 'rejected'); });
        });
      });

    client.from('payout_requests').select('*').neq('status', 'pending').order('handled_at', { ascending: false }).limit(50)
      .then(function (res) {
        var body = document.getElementById('adminPayoutsHistoryBody');
        if (!body) return;
        var rows = (res && res.data) || [];
        if (!rows.length) { body.innerHTML = '<tr><td colspan="5" class="cell-empty">No payout history.</td></tr>'; return; }
        body.innerHTML = rows.map(function (p) {
          return '<tr>' +
            '<td>' + new Date(p.created_at).toLocaleDateString() + '</td>' +
            '<td>' + esc(p.email) + '</td>' +
            '<td>' + money(p.amount) + '</td>' +
            '<td><span class="status-badge status-' + esc(p.status) + '">' + esc(p.status) + '</span></td>' +
            '<td>' + esc(p.note || '') + '</td>' +
          '</tr>';
        }).join('');
      });
  }

  function handlePayout(id, action) {
    var note = window.prompt('Note (required for reject, optional for paid)', '');
    if (action === 'rejected' && !note) { toast('Note required for reject.', 'error'); return; }
    sb().rpc('admin_handle_payout', { p_id: id, p_action: action, p_note: note || null }).then(function (r) {
      if (r.error) { toast('Failed: ' + r.error.message, 'error'); return; }
      toast('Payout ' + action + '.', 'success'); loadPayouts();
    });
  }

  /* ================= Newsletter ================= */

  function loadNewsletter() {
    var client = sb();
    var body = document.getElementById('adminNewsletterBody');
    if (!client || !body) return;
    client.from('newsletter').select('email,created_at').order('created_at', { ascending: false }).then(function (res) {
      var rows = (res && res.data) || [];
      var count = document.getElementById('newsletterCount');
      if (count) count.textContent = rows.length + ' subscribers';
      if (!rows.length) { body.innerHTML = '<tr><td colspan="3" class="cell-empty">No subscribers yet.</td></tr>'; return; }
      body.innerHTML = rows.map(function (r) {
        return '<tr>' +
          '<td>' + esc(r.email) + '</td>' +
          '<td>' + new Date(r.created_at).toLocaleDateString() + '</td>' +
          '<td><span class="table-actions"><button type="button" data-ndel="' + esc(r.email) + '" aria-label="Delete"><i class="fa-solid fa-trash"></i></button></span></td>' +
        '</tr>';
      }).join('');
      qsa('[data-ndel]', body).forEach(function (b) {
        b.addEventListener('click', function () {
          if (!window.confirm('Remove this subscriber?')) return;
          client.from('newsletter').delete().eq('email', b.getAttribute('data-ndel')).then(function () { loadNewsletter(); });
        });
      });
    });

    var exp = document.getElementById('exportNewsletterBtn');
    if (exp && exp.dataset.bound !== '1') {
      exp.dataset.bound = '1';
      exp.addEventListener('click', function () {
        client.from('newsletter').select('email,created_at').then(function (res) {
          var rows = (res && res.data) || [];
          var csv = 'email,created_at\n' + rows.map(function (r) { return '"' + r.email + '","' + r.created_at + '"'; }).join('\n');
          var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
          var a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'mittely-newsletter.csv';
          a.click();
          URL.revokeObjectURL(a.href);
        });
      });
    }
  }

  /* ================= Settings ================= */

  function loadSettings() {
    var client = sb();
    if (!client) return;
    client.from('settings').select('skey,svalue').then(function (res) {
      var map = {};
      (res && res.data || []).forEach(function (r) { map[r.skey] = r.svalue; });
      state.settings = map;
      function set(id, v) { var el = document.getElementById(id); if (el) el.value = v || ''; }
      set('setHotSale', map.hot_sale_mode || 'off');
      set('setHotSaleEnds', map.hot_sale_ends_at || '');
      set('setBf', map.black_friday_mode || 'off');
      set('setAnnouncement', map.announcement_bar || '');
      set('setHero', map.hero_headline || '');
      set('setFx', map.fx_fallback_rate || '15.50');
      set('setGithub', map.github_url || '');
      set('setX', map.x_url || '');
      set('setTelegram', map.telegram_url || '');
      set('setInstagram', map.instagram_url || '');
      set('setLinkedin', map.linkedin_url || '');
      set('setYoutube', map.youtube_url || '');
      set('setDiscord', map.discord_url || '');
    });

    var form = document.getElementById('settingsForm');
    if (form && form.dataset.bound !== '1') {
      form.dataset.bound = '1';
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var updates = [
          ['hot_sale_mode', val('setHotSale')],
          ['hot_sale_ends_at', val('setHotSaleEnds')],
          ['black_friday_mode', val('setBf')],
          ['announcement_bar', val('setAnnouncement')],
          ['hero_headline', val('setHero')],
          ['fx_fallback_rate', val('setFx') || '15.50'],
          ['github_url', val('setGithub')],
          ['x_url', val('setX')],
          ['telegram_url', val('setTelegram')],
          ['instagram_url', val('setInstagram')],
          ['linkedin_url', val('setLinkedin')],
          ['youtube_url', val('setYoutube')],
          ['discord_url', val('setDiscord')]
        ].map(function (pair) { return { skey: pair[0], svalue: pair[1] }; });

        client.from('settings').upsert(updates, { onConflict: 'skey' }).then(function (r) {
          if (r.error) { toast('Save failed: ' + r.error.message, 'error'); return; }
          var ok = document.getElementById('settingsSaved');
          if (ok) { ok.hidden = false; setTimeout(function () { ok.hidden = true; }, 2500); }
          toast('Settings saved.', 'success');
        });
      });
    }

    function val(id) { var el = document.getElementById(id); return el ? el.value : ''; }
  }

  /* ================= Admins ================= */

  function loadAdmins() {
    var client = sb();
    var body = document.getElementById('adminAdminsBody');
    if (!client || !body) return;
    client.from('admin_users').select('email').order('email').then(function (res) {
      var rows = (res && res.data) || [];
      var owner = window.MITTELY_CONFIG && window.MITTELY_CONFIG.ADMIN_EMAIL;
      body.innerHTML = rows.map(function (a) {
        var isOwner = a.email === owner;
        return '<tr>' +
          '<td>' + esc(a.email) + (isOwner ? ' <span class="badge badge-best">Owner</span>' : '') + '</td>' +
          '<td>' + (isOwner ? '<span class="muted">Protected</span>' :
            '<span class="table-actions"><button type="button" data-adel="' + esc(a.email) + '" aria-label="Remove"><i class="fa-solid fa-trash"></i></button></span>') + '</td>' +
        '</tr>';
      }).join('');
      qsa('[data-adel]', body).forEach(function (b) {
        b.addEventListener('click', function () {
          if (!window.confirm('Remove this admin?')) return;
          client.from('admin_users').delete().eq('email', b.getAttribute('data-adel')).then(function (r) {
            if (r.error) { toast('Remove failed.', 'error'); return; }
            toast('Admin removed.', 'success'); loadAdmins();
          });
        });
      });
    });

    var form = document.getElementById('addAdminForm');
    if (form && form.dataset.bound !== '1') {
      form.dataset.bound = '1';
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var em = document.getElementById('newAdminEmail').value.trim().toLowerCase();
        if (!em) return;
        client.from('admin_users').insert({ email: em }).then(function (r) {
          if (r.error) { toast('Add failed: ' + r.error.message, 'error'); return; }
          document.getElementById('newAdminEmail').value = '';
          toast('Admin added.', 'success'); loadAdmins();
        });
      });
    }
  }

  /* ================= Auth bootstrap ================= */

  function checkAccess() {
    var user = window.mittelyAuth && window.mittelyAuth.getUser && window.mittelyAuth.getUser();
    if (!user) { showGate('gate'); return; }
    state.user = user;
    state.email = user.email;

    var isAdmin = window.mittelyAuth.isAdmin && window.mittelyAuth.isAdmin();
    if (isAdmin) {
      state.isAdmin = true;
      showGate('shell');
      hydrateAdminUser();
      bindNav();
      setSection('dashboard');
      return;
    }

    // Fallback server check if the session just landed.
    var client = sb();
    if (!client) { showGate('forbidden'); return; }
    client.rpc('is_admin_rpc').then(function (res) {
      if (res && !res.error && res.data === true) {
        state.isAdmin = true;
        showGate('shell');
        hydrateAdminUser();
        bindNav();
        setSection('dashboard');
      } else {
        showGate('forbidden');
      }
    }).catch(function () { showGate('forbidden'); });
  }

  function onReady(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  onReady(function () {
    setTimeout(checkAccess, 350);
    window.addEventListener('mittely:auth-changed', checkAccess);
    var client = sb();
    if (client) client.auth.onAuthStateChange(function () { setTimeout(checkAccess, 100); });
  });
})();