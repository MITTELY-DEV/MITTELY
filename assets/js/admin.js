/* ============================================
   MITTELY — admin.js
   Admin console: gating, sidebar, sections,
   products, orders, reviews, submissions,
   coupons, blog, users, activity, newsletter,
   settings, admins, multi-chart analytics.
   ============================================ */
(function () {
  'use strict';

  if (!window.MITTELY) window.MITTELY = {};

  var esc = function (s) { return window.MITTELY.main ? window.MITTELY.main.escapeHtml(s) : String(s || ''); };
  var toast = function (m, t) { if (window.MITTELY.main) window.MITTELY.main.toast(m, t); };
  var money = function (n) { return window.MITTELY.currency ? window.MITTELY.currency.formatMoney(n) : ('$' + Number(n || 0).toFixed(2)); };
  var setLoading = function (b, l, txt) { if (window.MITTELY.main) window.MITTELY.main.setLoading(b, l, txt); };

  var OWNER_EMAIL = 'henryagyemang906@gmail.com';
  var currentSection = 'dashboard';
  var charts = { period: 30, type: 'sales' };
  var usersPage = 1;
  var activityPage = 1;
  var activityFilter = { event: '', date: '' };

  /* ---------- Gating ---------- */

  async function init() {
    var gate = document.getElementById('adminGate');
    var forbidden = document.getElementById('adminForbidden');
    var layout = document.getElementById('adminLayout');
    var signInBtn = document.getElementById('adminSignInBtn');

    if (signInBtn) signInBtn.addEventListener('click', function () { window.MITTELY.auth.openSignInModal(); });

    async function evaluate() {
      var session = await window.MITTELY.auth.getSession();
      if (!session || !session.user) {
        if (gate) gate.style.display = 'block';
        if (forbidden) forbidden.style.display = 'none';
        if (layout) layout.style.display = 'none';
        return;
      }
      var admin = await window.MITTELY.auth.isAdmin();
      if (!admin) {
        if (gate) gate.style.display = 'none';
        if (forbidden) forbidden.style.display = 'block';
        if (layout) layout.style.display = 'none';
        return;
      }
      if (gate) gate.style.display = 'none';
      if (forbidden) forbidden.style.display = 'none';
      if (layout) layout.style.display = 'grid';
      bindAdminUi();
      showSection('dashboard');
    }

    document.addEventListener('mittely:auth-changed', evaluate);
    await evaluate();
  }

  /* ---------- Sidebar / sections ---------- */

  function bindAdminUi() {
    var sidebar = document.getElementById('adminSidebar');
    var toggle = document.getElementById('adminSidebarToggle');
    if (toggle && !toggle.dataset.bound) {
      toggle.dataset.bound = '1';
      toggle.addEventListener('click', function () {
        if (sidebar) sidebar.classList.toggle('open');
      });
    }

    var nav = document.querySelector('.admin-nav');
    if (nav && !nav.dataset.bound) {
      nav.dataset.bound = '1';
      nav.addEventListener('click', function (e) {
        var btn = e.target.closest('.admin-nav-item');
        if (!btn) return;
        showSection(btn.getAttribute('data-section') || 'dashboard');
        if (sidebar && window.innerWidth < 1024) sidebar.classList.remove('open');
      });
    }
  }

  function showSection(name) {
    currentSection = name;
    document.querySelectorAll('.admin-nav-item').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-section') === name);
    });
    document.querySelectorAll('.admin-section').forEach(function (s) {
      s.classList.toggle('active', s.id === 'admin-section-' + name);
    });
    loadSection(name);
  }

  async function loadSection(name) {
    try {
      switch (name) {
        case 'dashboard': await loadDashboard(); break;
        case 'products': await loadProducts(); break;
        case 'orders': await loadOrders(); break;
        case 'reviews': await loadReviews(); break;
        case 'submissions': await loadSubmissions(); break;
        case 'coupons': await loadCoupons(); break;
        case 'blog': await loadBlog(); break;
        case 'users': await loadUsers(); break;
        case 'activity': await loadActivity(); break;
        case 'newsletter': await loadNewsletter(); break;
        case 'settings': await loadSettings(); break;
        case 'admins': await loadAdmins(); break;
      }
    } catch (e) {
      toast('Failed to load section', 'error');
    }
  }

  /* ---------- Dashboard ---------- */

  async function loadDashboard() {
    if (!window.MITTELY.supabase) return;
    try {
      var [ordersRes, productsRes] = await Promise.all([
        window.MITTELY.supabase.from('orders').select('*').order('created_at', { ascending: false }),
        window.MITTELY.supabase.from('products').select('id, title, price, sales_count').order('sales_count', { ascending: false }).limit(5)
      ]);
      var orders = (ordersRes && ordersRes.data) || [];
      var topProducts = (productsRes && productsRes.data) || [];

      var now = Date.now();
      var sums = { today: 0, d7: 0, d30: 0, all: 0 };
      orders.forEach(function (o) {
        var usd = Number(o.usd_amount) || 0;
        sums.all += usd;
        var t = new Date(o.created_at).getTime();
        if (now - t < 86400000) sums.today += usd;
        if (now - t < 7 * 86400000) sums.d7 += usd;
        if (now - t < 30 * 86400000) sums.d30 += usd;
      });

      setStat('revenue_today', money(sums.today));
      setStat('revenue_7d', money(sums.d7));
      setStat('revenue_30d', money(sums.d30));
      setStat('revenue_all', money(sums.all));

      var tbody = document.getElementById('adminRecentOrders');
      if (tbody) {
        tbody.innerHTML = orders.slice(0, 5).map(function (o) {
          var cls = o.status === 'success' ? 'success' : (o.status === 'failed' ? 'failed' : 'pending');
          return '<tr><td>' + esc(o.paystack_reference) + '</td><td>' + esc(o.email) + '</td>' +
            '<td>' + money(o.usd_amount) + '</td>' +
            '<td><span class="order-status-badge ' + cls + '">' + esc(o.status) + '</span></td>' +
            '<td>' + (o.created_at ? new Date(o.created_at).toLocaleDateString() : '') + '</td></tr>';
        }).join('') || '<tr><td colspan="5">No orders yet</td></tr>';
      }

      var actList = document.getElementById('adminRecentActivity');
      if (actList) {
        var actRes = await window.MITTELY.supabase
          .from('activity_log').select('*').order('created_at', { ascending: false }).limit(8);
        var acts = (actRes && actRes.data) || [];
        actList.innerHTML = acts.length ? acts.map(activityItemHtml).join('') : '<li>No activity yet</li>';
      }

      bindChartTabs();
      await renderChart(charts.type, charts.period, orders, topProducts);
    } catch (e) { /* silent */ }
  }

  function setStat(key, value) {
    var el = document.querySelector('[data-stat="' + key + '"]');
    if (el) el.textContent = value;
  }

  function activityItemHtml(a) {
    var icons = {
      signup: 'fa-user-plus', sign_in: 'fa-right-to-bracket', order: 'fa-receipt',
      download: 'fa-download', review: 'fa-star', wishlist: 'fa-heart'
    };
    return '<li><span class="activity-icon"><i class="fa-solid ' + (icons[a.event] || 'fa-circle') + '"></i></span>' +
      '<div><div class="activity-email">' + esc(a.email) + '</div>' +
      '<div class="activity-meta">' + esc(a.event) + ' · ' + new Date(a.created_at).toLocaleString() + '</div></div></li>';
  }

  function bindChartTabs() {
    var wrap = document.querySelector('.admin-chart-tabs');
    if (!wrap || wrap.dataset.bound === '1') return;
    wrap.dataset.bound = '1';
    wrap.addEventListener('click', async function (e) {
      var tab = e.target.closest('.chart-tab');
      if (!tab) return;
      wrap.querySelectorAll('.chart-tab').forEach(function (t) { t.classList.toggle('active', t === tab); });
      charts.type = tab.getAttribute('data-chart') || 'sales';
      var ordersRes = await window.MITTELY.supabase.from('orders').select('*').order('created_at', { ascending: false });
      var productsRes = await window.MITTELY.supabase.from('products').select('id, title, price, sales_count').order('sales_count', { ascending: false }).limit(5);
      renderChart(charts.type, charts.period, (ordersRes && ordersRes.data) || [], (productsRes && productsRes.data) || []);
    });
  }

  async function renderChart(type, period, orders, topProducts) {
    var canvas = document.getElementById('chartCanvas');
    var summary = document.getElementById('chartSummary');
    if (!canvas) return;
    canvas.innerHTML = '';

    if (type === 'sales' || type === 'revenue' || type === 'downloads') {
      var buckets = [];
      var labels = [];
      for (var i = period - 1; i >= 0; i--) {
        var d = new Date(); d.setDate(d.getDate() - i);
        labels.push(d);
        buckets.push(0);
      }
      orders.forEach(function (o) {
        var t = new Date(o.created_at);
        var diff = Math.floor((Date.now() - t.getTime()) / 86400000);
        if (diff >= 0 && diff < period) {
          var idx = period - 1 - diff;
          if (buckets[idx] !== undefined) buckets[idx] += Number(o.usd_amount) || 0;
        }
      });
      var max = Math.max.apply(null, buckets.concat([1]));
      if (summary) {
        var total = buckets.reduce(function (a, b) { return a + b; }, 0);
        summary.textContent = (type === 'revenue' ? money(total) : total + ' orders');
      }
      buckets.forEach(function (v, i) {
        var h = (v / max) * 180;
        var bar = document.createElement('div');
        bar.style.cssText = 'flex:1;background:linear-gradient(to top,var(--lime),var(--highlight));height:' + Math.max(4, h) + 'px;border-radius:4px 4px 0 0;transition:height 400ms;';
        canvas.appendChild(bar);
      });
      return;
    }

    if (type === 'status') {
      var counts = { success: 0, pending: 0, failed: 0 };
      orders.forEach(function (o) { if (counts[o.status] !== undefined) counts[o.status]++; });
      var total = Math.max(1, counts.success + counts.pending + counts.failed);
      if (summary) summary.textContent = total + ' total';
      var colors = { success: '#16A34A', pending: '#D97706', failed: '#DC2626' };
      var html = '<div style="display:flex;flex-direction:column;gap:10px;width:100%;">';
      Object.keys(counts).forEach(function (k) {
        var pct = (counts[k] / total) * 100;
        html += '<div><div style="display:flex;justify-content:space-between;font-size:0.875rem;margin-bottom:4px;"><span>' + k + '</span><span>' + counts[k] + '</span></div><div style="height:10px;background:var(--card-alt);border-radius:6px;overflow:hidden;"><div style="width:' + pct + '%;height:100%;background:' + colors[k] + ';"></div></div></div>';
      });
      html += '</div>';
      canvas.innerHTML = html;
      return;
    }

    if (type === 'top') {
      var tops = topProducts || [];
      if (summary) summary.textContent = tops.length + ' products';
      var maxSales = Math.max.apply(null, tops.map(function (p) { return p.sales_count || 0; }).concat([1]));
      canvas.innerHTML = tops.map(function (p) {
        var pct = ((p.sales_count || 0) / maxSales) * 100;
        return '<div style="margin-bottom:12px;"><div style="display:flex;justify-content:space-between;font-size:0.875rem;margin-bottom:4px;"><span>' + esc(p.title) + '</span><span>' + (p.sales_count || 0) + '</span></div>' +
          '<div style="height:10px;background:var(--card-alt);border-radius:6px;overflow:hidden;"><div style="width:' + pct + '%;height:100%;background:var(--lime);"></div></div></div>';
      }).join('') || '<div>No products</div>';
      return;
    }
  }

  /* ---------- Products ---------- */

  async function loadProducts() {
    var tbody = document.getElementById('adminProductsTable');
    if (!tbody) return;
    var res = await window.MITTELY.supabase.from('products').select('*').order('created_at', { ascending: false });
    var data = (res && res.data) || [];
    tbody.innerHTML = data.map(function (p) {
      var flags = [];
      if (p.is_published) flags.push('fa-eye');
      if (p.is_free) flags.push('fa-gift');
      if (p.is_hot_sale) flags.push('fa-star');
      if (p.is_black_friday) flags.push('fa-heart');
      if (p.is_featured) flags.push('fa-sparkles');
      return '<tr>' +
        '<td>' + esc(p.title) + '</td>' +
        '<td>' + esc(p.category) + '</td>' +
        '<td>' + money(p.price) + '</td>' +
        '<td>' + (p.is_published ? 'Published' : 'Draft') + '</td>' +
        '<td>' + flags.map(function (f) { return '<i class="fa-solid ' + f + '" style="color:var(--highlight);margin-right:4px;"></i>'; }).join('') + '</td>' +
        '<td><div class="table-actions">' +
          '<button data-edit="' + esc(p.id) + '" aria-label="Edit"><i class="fa-solid fa-pen"></i></button>' +
          '<button data-duplicate="' + esc(p.id) + '" aria-label="Duplicate"><i class="fa-solid fa-copy"></i></button>' +
          '<button data-toggle-published="' + esc(p.id) + '" aria-label="Toggle published"><i class="fa-solid fa-eye"></i></button>' +
          '<button class="danger" data-delete="' + esc(p.id) + '" aria-label="Delete"><i class="fa-solid fa-trash"></i></button>' +
        '</div></td></tr>';
    }).join('') || '<tr><td colspan="6">No products</td></tr>';

    if (!tbody.dataset.bound) {
      tbody.dataset.bound = '1';
      tbody.addEventListener('click', function (e) {
        var btn = e.target.closest('button');
        if (!btn) return;
        if (btn.hasAttribute('data-edit')) openProductModal(btn.getAttribute('data-edit'));
        else if (btn.hasAttribute('data-duplicate')) duplicateProduct(btn.getAttribute('data-duplicate'));
        else if (btn.hasAttribute('data-toggle-published')) toggleProductPublished(btn.getAttribute('data-toggle-published'));
        else if (btn.hasAttribute('data-delete')) confirmDeleteProduct(btn.getAttribute('data-delete'));
      });
    }

    var newBtn = document.getElementById('newProductBtn');
    if (newBtn && !newBtn.dataset.bound) {
      newBtn.dataset.bound = '1';
      newBtn.addEventListener('click', function () { openProductModal(null); });
    }
  }

  async function openProductModal(id) {
    var title = document.getElementById('adminEntityTitle');
    var body = document.getElementById('adminEntityBody');
    var footer = document.getElementById('adminEntityFooter');
    if (!body || !footer) return;
    var p = null;
    if (id) {
      var res = await window.MITTELY.supabase.from('products').select('*').eq('id', id).maybeSingle();
      p = res && res.data;
    }
    if (title) title.textContent = p ? 'Edit product' : 'New product';
    body.innerHTML = productFormHtml(p || {});
    footer.innerHTML = '<button class="btn btn-outline" id="entityCancel">Cancel</button><button class="btn btn-primary" id="entitySave">Save</button>';
    openModal('adminEntityModal');
    document.getElementById('entityCancel').addEventListener('click', function () { closeModal('adminEntityModal'); });
    document.getElementById('entitySave').addEventListener('click', function () { saveProduct(p ? p.id : null); });
  }

  function productFormHtml(p) {
    function val(k, d) { return p[k] != null ? p[k] : (d != null ? d : ''); }
    return '' +
      '<div class="form-group"><label>Title</label><input type="text" id="f_title" value="' + esc(val('title')) + '"></div>' +
      '<div class="form-group"><label>Slug</label><input type="text" id="f_slug" value="' + esc(val('slug')) + '" placeholder="auto-slug"></div>' +
      '<div class="form-group"><label>Category</label><select id="f_category">' +
        ['ui-kits', 'dashboards', 'landing-pages', 'ecommerce', 'portfolios', 'mobile-apps'].map(function (c) {
          return '<option value="' + c + '"' + (val('category') === c ? ' selected' : '') + '>' + c + '</option>';
        }).join('') +
      '</select></div>' +
      '<div class="form-group"><label>Price (USD)</label><input type="number" step="0.01" id="f_price" value="' + esc(val('price', 0)) + '"></div>' +
      '<div class="form-group"><label>Sale price (USD)</label><input type="number" step="0.01" id="f_sale_price" value="' + esc(val('sale_price')) + '"></div>' +
      '<div class="form-group"><label>Short description</label><input type="text" id="f_short_desc" value="' + esc(val('short_desc')) + '"></div>' +
      '<div class="form-group"><label>Long description</label><textarea id="f_long_desc" rows="4">' + esc(val('long_desc')) + '</textarea></div>' +
      '<div class="form-group"><label>Image URL</label><input type="url" id="f_image_url" value="' + esc(val('image_url')) + '"></div>' +
      '<div class="form-group"><label>Demo URL</label><input type="url" id="f_demo_url" value="' + esc(val('demo_url')) + '"></div>' +
      '<div class="form-group"><label>Preview embed URL</label><input type="url" id="f_preview_embed_url" value="' + esc(val('preview_embed_url')) + '"></div>' +
      '<div class="form-group"><label>Version</label><input type="text" id="f_version" value="' + esc(val('version', '1.0')) + '"></div>' +
      '<div class="form-group"><label>Changelog</label><textarea id="f_changelog" rows="3">' + esc(val('changelog')) + '</textarea></div>' +
      '<div class="form-group"><label><input type="checkbox" id="f_is_published"' + (p.is_published !== false ? ' checked' : '') + '> Published</label></div>' +
      '<div class="form-group"><label><input type="checkbox" id="f_is_free"' + (p.is_free ? ' checked' : '') + '> Free</label></div>' +
      '<div class="form-group"><label><input type="checkbox" id="f_is_hot_sale"' + (p.is_hot_sale ? ' checked' : '') + '> Hot Sale</label></div>' +
      '<div class="form-group"><label><input type="checkbox" id="f_is_black_friday"' + (p.is_black_friday ? ' checked' : '') + '> Black Friday</label></div>' +
      '<div class="form-group"><label><input type="checkbox" id="f_is_featured"' + (p.is_featured ? ' checked' : '') + '> Featured</label></div>';
  }

  async function saveProduct(id) {
    var btn = document.getElementById('entitySave');
    setLoading(btn, true);
    try {
      var payload = {
        title: val('f_title'),
        slug: val('f_slug') || slugify(val('f_title')),
        category: val('f_category'),
        price: parseFloat(val('f_price')) || 0,
        sale_price: val('f_sale_price') ? parseFloat(val('f_sale_price')) : null,
        short_desc: val('f_short_desc'),
        long_desc: val('f_long_desc'),
        image_url: val('f_image_url'),
        demo_url: val('f_demo_url'),
        preview_embed_url: val('f_preview_embed_url'),
        version: val('f_version') || '1.0',
        changelog: val('f_changelog'),
        is_published: checked('f_is_published'),
        is_free: checked('f_is_free'),
        is_hot_sale: checked('f_is_hot_sale'),
        is_black_friday: checked('f_is_black_friday'),
        is_featured: checked('f_is_featured'),
        updated_at: new Date().toISOString()
      };
      if (!payload.title) throw new Error('Title required');
      var res = id
        ? await window.MITTELY.supabase.from('products').update(payload).eq('id', id)
        : await window.MITTELY.supabase.from('products').insert(payload);
      if (res && res.error) throw res.error;
      toast('Product saved', 'success');
      closeModal('adminEntityModal');
      loadProducts();
    } catch (e) {
      toast((e && e.message) || 'Save failed', 'error');
    } finally {
      setLoading(btn, false);
    }
  }

  function slugify(s) {
    return String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  function val(id) { var el = document.getElementById(id); return el ? (el.type === 'checkbox' ? el.checked : el.value) : ''; }
  function checked(id) { var el = document.getElementById(id); return el ? !!el.checked : false; }

  async function duplicateProduct(id) {
    try {
      var res = await window.MITTELY.supabase.from('products').select('*').eq('id', id).maybeSingle();
      var p = res && res.data;
      if (!p) return;
      delete p.id;
      p.title = p.title + ' (copy)';
      p.slug = p.slug + '-copy-' + Date.now();
      p.is_published = false;
      var ins = await window.MITTELY.supabase.from('products').insert(p);
      if (ins && ins.error) throw ins.error;
      toast('Product duplicated', 'success');
      loadProducts();
    } catch (e) { toast('Duplicate failed', 'error'); }
  }

  async function toggleProductPublished(id) {
    try {
      var res = await window.MITTELY.supabase.from('products').select('is_published').eq('id', id).maybeSingle();
      var cur = res && res.data ? res.data.is_published : true;
      await window.MITTELY.supabase.from('products').update({ is_published: !cur }).eq('id', id);
      loadProducts();
    } catch (e) { toast('Toggle failed', 'error'); }
  }

  async function confirmDeleteProduct(id) {
    openConfirm('Delete this product? Type the product title to confirm.', async function (typed) {
      try {
        var res = await window.MITTELY.supabase.from('products').select('title').eq('id', id).maybeSingle();
        var t = res && res.data ? res.data.title : '';
        if (!typed || typed !== t) { toast('Title does not match', 'error'); return; }
        var del = await window.MITTELY.supabase.from('products').delete().eq('id', id);
        if (del && del.error) throw del.error;
        toast('Product deleted', 'success');
        loadProducts();
      } catch (e) { toast('Delete failed', 'error'); }
    });
  }

  /* ---------- Orders ---------- */

  async function loadOrders() {
    var tbody = document.getElementById('adminOrdersTable');
    var search = document.getElementById('adminOrderSearch');
    var status = document.getElementById('adminOrderStatus');
    if (!tbody) return;

    async function fetchList() {
      var q = window.MITTELY.supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(100);
      if (status && status.value) q = q.eq('status', status.value);
      if (search && search.value.trim()) {
        var s = search.value.trim();
        q = q.or('email.ilike.%' + s + '%,paystack_reference.ilike.%' + s + '%');
      }
      var res = await q;
      var data = (res && res.data) || [];
      tbody.innerHTML = data.map(function (o) {
        var cls = o.status === 'success' ? 'success' : (o.status === 'failed' ? 'failed' : 'pending');
        return '<tr><td>' + esc(o.paystack_reference) + '</td><td>' + esc(o.email) + '</td>' +
          '<td>' + money(o.usd_amount) + '</td><td>' + esc(o.currency || 'USD') + '</td>' +
          '<td><span class="order-status-badge ' + cls + '">' + esc(o.status) + '</span></td>' +
          '<td>' + (o.created_at ? new Date(o.created_at).toLocaleDateString() : '') + '</td>' +
          '<td><div class="table-actions">' +
            '<button data-status="' + esc(o.id) + '" data-cur="' + esc(o.status) + '" aria-label="Change status"><i class="fa-solid fa-arrows-rotate"></i></button>' +
          '</div></td></tr>';
      }).join('') || '<tr><td colspan="7">No orders</td></tr>';
    }

    if (search) {
      var deb = window.MITTELY.main.debounce(fetchList, 250);
      if (!search.dataset.bound) { search.dataset.bound = '1'; search.addEventListener('input', deb); }
    }
    if (status && !status.dataset.bound) { status.dataset.bound = '1'; status.addEventListener('change', fetchList); }

    if (!tbody.dataset.bound) {
      tbody.dataset.bound = '1';
      tbody.addEventListener('click', async function (e) {
        var btn = e.target.closest('[data-status]');
        if (!btn) return;
        var id = btn.getAttribute('data-status');
        var cur = btn.getAttribute('data-cur');
        openConfirm('Change order status?', async function () {
          var next = cur === 'success' ? 'pending' : 'success';
          await window.MITTELY.supabase.from('orders').update({ status: next }).eq('id', id);
          toast('Status updated', 'success');
          fetchList();
        });
      });
    }

    await fetchList();
  }

  /* ---------- Reviews ---------- */

  async function loadReviews() {
    var tbody = document.getElementById('adminReviewsTable');
    var status = document.getElementById('adminReviewStatus');
    var bulkBtn = document.getElementById('bulkApproveReviewsBtn');
    if (!tbody) return;

    async function fetchList() {
      var q = window.MITTELY.supabase
        .from('reviews').select('*, products(title)')
        .order('created_at', { ascending: false }).limit(100);
      if (status && status.value) q = q.eq('status', status.value);
      var res = await q;
      var data = (res && res.data) || [];
      tbody.innerHTML = data.map(function (r) {
        var cls = r.status === 'approved' ? 'success' : (r.status === 'rejected' ? 'failed' : 'pending');
        return '<tr><td>' + esc((r.products && r.products.title) || '—') + '</td><td>' + esc(r.name) + '</td>' +
          '<td>' + (r.rating || 0) + '</td><td>' + esc((r.comment || '').slice(0, 80)) + '</td>' +
          '<td><span class="order-status-badge ' + cls + '">' + esc(r.status) + '</span></td>' +
          '<td><div class="table-actions">' +
            '<button data-approve="' + esc(r.id) + '" aria-label="Approve"><i class="fa-solid fa-check"></i></button>' +
            '<button class="danger" data-reject="' + esc(r.id) + '" aria-label="Reject"><i class="fa-solid fa-xmark"></i></button>' +
          '</div></td></tr>';
      }).join('') || '<tr><td colspan="6">No reviews</td></tr>';
    }

    if (status && !status.dataset.bound) { status.dataset.bound = '1'; status.addEventListener('change', fetchList); }

    if (!tbody.dataset.bound) {
      tbody.dataset.bound = '1';
      tbody.addEventListener('click', async function (e) {
        var ap = e.target.closest('[data-approve]');
        var rj = e.target.closest('[data-reject]');
        if (ap) {
          await window.MITTELY.supabase.from('reviews').update({ status: 'approved' }).eq('id', ap.getAttribute('data-approve'));
          toast('Review approved', 'success');
          fetchList();
        } else if (rj) {
          await window.MITTELY.supabase.from('reviews').update({ status: 'rejected' }).eq('id', rj.getAttribute('data-reject'));
          toast('Review rejected', 'info');
          fetchList();
        }
      });
    }

    if (bulkBtn && !bulkBtn.dataset.bound) {
      bulkBtn.dataset.bound = '1';
      bulkBtn.addEventListener('click', async function () {
        openConfirm('Approve all pending reviews?', async function () {
          var res = await window.MITTELY.supabase.from('reviews').update({ status: 'approved' }).eq('status', 'pending');
          if (res && res.error) { toast('Bulk approve failed', 'error'); return; }
          toast('All pending reviews approved', 'success');
          fetchList();
        });
      });
    }

    await fetchList();
  }

  /* ---------- Submissions ---------- */

  async function loadSubmissions() {
    var tbody = document.getElementById('adminSubmissionsTable');
    if (!tbody) return;
    var res = await window.MITTELY.supabase.from('submissions').select('*').order('created_at', { ascending: false }).limit(100);
    var data = (res && res.data) || [];
    tbody.innerHTML = data.map(function (s) {
      var cls = s.status === 'accepted' ? 'success' : (s.status === 'rejected' ? 'failed' : 'pending');
      return '<tr><td>' + esc(s.designer_name) + '</td><td>' + esc(s.designer_email) + '</td>' +
        '<td>' + esc(s.product_title) + '</td><td>' + esc(s.category) + '</td>' +
        '<td><span class="order-status-badge ' + cls + '">' + esc(s.status) + '</span></td>' +
        '<td><div class="table-actions">' +
          '<button data-view="' + esc(s.id) + '" aria-label="View"><i class="fa-solid fa-eye"></i></button>' +
          '<button data-accept="' + esc(s.id) + '" aria-label="Accept"><i class="fa-solid fa-check"></i></button>' +
          '<button class="danger" data-reject="' + esc(s.id) + '" aria-label="Reject"><i class="fa-solid fa-xmark"></i></button>' +
        '</div></td></tr>';
    }).join('') || '<tr><td colspan="6">No submissions</td></tr>';

    if (!tbody.dataset.bound) {
      tbody.dataset.bound = '1';
      tbody.addEventListener('click', async function (e) {
        var v = e.target.closest('[data-view]');
        var a = e.target.closest('[data-accept]');
        var r = e.target.closest('[data-reject]');
        if (v) {
          var id = v.getAttribute('data-view');
          var one = await window.MITTELY.supabase.from('submissions').select('*').eq('id', id).maybeSingle();
          var s = one && one.data;
          if (s) openDrawer('Submission', '<p><strong>Designer:</strong> ' + esc(s.designer_name) + '</p>' +
            '<p><strong>Email:</strong> ' + esc(s.designer_email) + '</p>' +
            '<p><strong>Product:</strong> ' + esc(s.product_title) + '</p>' +
            '<p><strong>Category:</strong> ' + esc(s.category) + '</p>' +
            '<p><strong>Description:</strong> ' + esc(s.description) + '</p>' +
            (s.demo_url ? '<p><strong>Demo:</strong> <a href="' + esc(s.demo_url) + '" target="_blank" rel="noopener">' + esc(s.demo_url) + '</a></p>' : '') +
            (s.portfolio_url ? '<p><strong>Portfolio:</strong> <a href="' + esc(s.portfolio_url) + '" target="_blank" rel="noopener">' + esc(s.portfolio_url) + '</a></p>' : ''));
        } else if (a) {
          await window.MITTELY.supabase.from('submissions').update({ status: 'accepted' }).eq('id', a.getAttribute('data-accept'));
          toast('Accepted', 'success');
          loadSubmissions();
        } else if (r) {
          await window.MITTELY.supabase.from('submissions').update({ status: 'rejected' }).eq('id', r.getAttribute('data-reject'));
          toast('Rejected', 'info');
          loadSubmissions();
        }
      });
    }
  }

  /* ---------- Coupons ---------- */

  async function loadCoupons() {
    var tbody = document.getElementById('adminCouponsTable');
    if (!tbody) return;
    var res = await window.MITTELY.supabase.from('coupons').select('*').order('created_at', { ascending: false });
    var data = (res && res.data) || [];
    tbody.innerHTML = data.map(function (c) {
      return '<tr><td>' + esc(c.code) + '</td><td>' + esc(c.type) + '</td>' +
        '<td>' + (c.type === 'percent' ? c.value + '%' : money(c.value)) + '</td>' +
        '<td>' + money(c.min_subtotal) + '</td>' +
        '<td>' + (c.used_count || 0) + (c.max_uses ? ' / ' + c.max_uses : '') + '</td>' +
        '<td>' + (c.expires_at ? new Date(c.expires_at).toLocaleDateString() : '—') + '</td>' +
        '<td>' + (c.is_active ? 'Active' : 'Inactive') + '</td>' +
        '<td><div class="table-actions">' +
          '<button data-edit-coupon="' + esc(c.id) + '" aria-label="Edit"><i class="fa-solid fa-pen"></i></button>' +
          '<button data-toggle-coupon="' + esc(c.id) + '" aria-label="Toggle"><i class="fa-solid fa-power-off"></i></button>' +
          '<button class="danger" data-delete-coupon="' + esc(c.id) + '" aria-label="Delete"><i class="fa-solid fa-trash"></i></button>' +
        '</div></td></tr>';
    }).join('') || '<tr><td colspan="8">No coupons</td></tr>';

    var newBtn = document.getElementById('newCouponBtn');
    if (newBtn && !newBtn.dataset.bound) {
      newBtn.dataset.bound = '1';
      newBtn.addEventListener('click', function () { openCouponModal(null); });
    }

    if (!tbody.dataset.bound) {
      tbody.dataset.bound = '1';
      tbody.addEventListener('click', async function (e) {
        var ed = e.target.closest('[data-edit-coupon]');
        var tg = e.target.closest('[data-toggle-coupon]');
        var dl = e.target.closest('[data-delete-coupon]');
        if (ed) openCouponModal(ed.getAttribute('data-edit-coupon'));
        else if (tg) {
          var id = tg.getAttribute('data-toggle-coupon');
          var cur = await window.MITTELY.supabase.from('coupons').select('is_active').eq('id', id).maybeSingle();
          var active = cur && cur.data ? cur.data.is_active : true;
          await window.MITTELY.supabase.from('coupons').update({ is_active: !active }).eq('id', id);
          loadCoupons();
        } else if (dl) {
          openConfirm('Delete this coupon?', async function () {
            await window.MITTELY.supabase.from('coupons').delete().eq('id', dl.getAttribute('data-delete-coupon'));
            toast('Coupon deleted', 'success');
            loadCoupons();
          });
        }
      });
    }
  }

  async function openCouponModal(id) {
    var c = null;
    if (id) {
      var res = await window.MITTELY.supabase.from('coupons').select('*').eq('id', id).maybeSingle();
      c = res && res.data;
    }
    var title = document.getElementById('adminEntityTitle');
    var body = document.getElementById('adminEntityBody');
    var footer = document.getElementById('adminEntityFooter');
    if (title) title.textContent = c ? 'Edit coupon' : 'New coupon';
    if (body) {
      body.innerHTML =
        '<div class="form-group"><label>Code</label><input type="text" id="c_code" value="' + esc(c ? c.code : '') + '"></div>' +
        '<div class="form-group"><label>Type</label><select id="c_type"><option value="percent"' + (c && c.type === 'percent' ? ' selected' : '') + '>percent</option><option value="fixed"' + (c && c.type === 'fixed' ? ' selected' : '') + '>fixed</option></select></div>' +
        '<div class="form-group"><label>Value</label><input type="number" step="0.01" id="c_value" value="' + esc(c ? c.value : '') + '"></div>' +
        '<div class="form-group"><label>Min subtotal (USD)</label><input type="number" step="0.01" id="c_min" value="' + esc(c ? c.min_subtotal : 0) + '"></div>' +
        '<div class="form-group"><label>Max uses</label><input type="number" id="c_max" value="' + esc(c ? (c.max_uses || '') : '') + '"></div>' +
        '<div class="form-group"><label>Expires at</label><input type="datetime-local" id="c_expires" value="' + esc(c && c.expires_at ? c.expires_at.slice(0, 16) : '') + '"></div>';
    }
    if (footer) {
      footer.innerHTML = '<button class="btn btn-outline" id="couponCancel">Cancel</button><button class="btn btn-primary" id="couponSave">Save</button>';
      document.getElementById('couponCancel').addEventListener('click', function () { closeModal('adminEntityModal'); });
      document.getElementById('couponSave').addEventListener('click', function () { saveCoupon(id); });
    }
    openModal('adminEntityModal');
  }

  async function saveCoupon(id) {
    try {
      var payload = {
        code: (val('c_code') || '').toUpperCase().trim(),
        type: val('c_type'),
        value: parseFloat(val('c_value')) || 0,
        min_subtotal: parseFloat(val('c_min')) || 0,
        max_uses: val('c_max') ? parseInt(val('c_max'), 10) : null,
        expires_at: val('c_expires') ? new Date(val('c_expires')).toISOString() : null
      };
      if (!payload.code) throw new Error('Code required');
      if (payload.value <= 0) throw new Error('Value must be > 0');
      var res = id
        ? await window.MITTELY.supabase.from('coupons').update(payload).eq('id', id)
        : await window.MITTELY.supabase.from('coupons').insert(payload);
      if (res && res.error) throw res.error;
      toast('Coupon saved', 'success');
      closeModal('adminEntityModal');
      loadCoupons();
    } catch (e) { toast((e && e.message) || 'Save failed', 'error'); }
  }

  /* ---------- Blog ---------- */

  async function loadBlog() {
    var tbody = document.getElementById('adminBlogTable');
    if (!tbody) return;
    var res = await window.MITTELY.supabase.from('blog_posts').select('*').order('created_at', { ascending: false });
    var data = (res && res.data) || [];
    tbody.innerHTML = data.map(function (b) {
      return '<tr><td>' + esc(b.title) + '</td><td>' + esc(b.slug) + '</td>' +
        '<td>' + esc(b.status) + '</td><td>' + (b.views_count || 0) + '</td>' +
        '<td>' + (b.created_at ? new Date(b.created_at).toLocaleDateString() : '') + '</td>' +
        '<td><div class="table-actions">' +
          '<button data-edit-post="' + esc(b.id) + '" aria-label="Edit"><i class="fa-solid fa-pen"></i></button>' +
          '<button class="danger" data-delete-post="' + esc(b.id) + '" aria-label="Delete"><i class="fa-solid fa-trash"></i></button>' +
        '</div></td></tr>';
    }).join('') || '<tr><td colspan="6">No posts</td></tr>';

    var newBtn = document.getElementById('newPostBtn');
    if (newBtn && !newBtn.dataset.bound) {
      newBtn.dataset.bound = '1';
      newBtn.addEventListener('click', function () { openPostModal(null); });
    }

    if (!tbody.dataset.bound) {
      tbody.dataset.bound = '1';
      tbody.addEventListener('click', function (e) {
        var ed = e.target.closest('[data-edit-post]');
        var dl = e.target.closest('[data-delete-post]');
        if (ed) openPostModal(ed.getAttribute('data-edit-post'));
        else if (dl) {
          openConfirm('Delete this post? Type the title to confirm.', async function (typed) {
            var id = dl.getAttribute('data-delete-post');
            var one = await window.MITTELY.supabase.from('blog_posts').select('title').eq('id', id).maybeSingle();
            var t = one && one.data ? one.data.title : '';
            if (typed !== t) { toast('Title mismatch', 'error'); return; }
            await window.MITTELY.supabase.from('blog_posts').delete().eq('id', id);
            toast('Post deleted', 'success');
            loadBlog();
          });
        }
      });
    }
  }

  async function openPostModal(id) {
    var b = null;
    if (id) {
      var res = await window.MITTELY.supabase.from('blog_posts').select('*').eq('id', id).maybeSingle();
      b = res && res.data;
    }
    var title = document.getElementById('adminEntityTitle');
    var body = document.getElementById('adminEntityBody');
    var footer = document.getElementById('adminEntityFooter');
    if (title) title.textContent = b ? 'Edit post' : 'New post';
    if (body) {
      body.innerHTML =
        '<div class="form-group"><label>Title</label><input type="text" id="p_title" value="' + esc(b ? b.title : '') + '"></div>' +
        '<div class="form-group"><label>Slug</label><input type="text" id="p_slug" value="' + esc(b ? b.slug : '') + '" placeholder="auto-slug"></div>' +
        '<div class="form-group"><label>Excerpt</label><input type="text" id="p_excerpt" value="' + esc(b ? b.excerpt : '') + '"></div>' +
        '<div class="form-group"><label>Content (HTML allowed)</label><textarea id="p_content" rows="8">' + esc(b ? b.content : '') + '</textarea></div>' +
        '<div class="form-group"><label>Cover image URL</label><input type="url" id="p_cover" value="' + esc(b ? b.cover_image : '') + '"></div>' +
        '<div class="form-group"><label>Tags (comma separated)</label><input type="text" id="p_tags" value="' + esc(b ? b.tags : '') + '"></div>' +
        '<div class="form-group"><label>Author name</label><input type="text" id="p_author" value="' + esc(b ? b.author_name : '') + '"></div>' +
        '<div class="form-group"><label>Meta title</label><input type="text" id="p_meta_title" value="' + esc(b ? b.meta_title : '') + '"></div>' +
        '<div class="form-group"><label>Meta description</label><input type="text" id="p_meta_desc" value="' + esc(b ? b.meta_description : '') + '"></div>' +
        '<div class="form-group"><label>Status</label><select id="p_status"><option value="draft"' + (b && b.status === 'draft' ? ' selected' : '') + '>Draft</option><option value="published"' + (b && b.status === 'published' ? ' selected' : '') + '>Published</option></select></div>';
    }
    if (footer) {
      footer.innerHTML = '<button class="btn btn-outline" id="postCancel">Cancel</button><button class="btn btn-primary" id="postSave">Save</button>';
      document.getElementById('postCancel').addEventListener('click', function () { closeModal('adminEntityModal'); });
      document.getElementById('postSave').addEventListener('click', function () { savePost(id); });
    }
    openModal('adminEntityModal');
  }

  async function savePost(id) {
    try {
      var payload = {
        title: val('p_title'),
        slug: val('p_slug') || slugify(val('p_title')),
        excerpt: val('p_excerpt'),
        content: val('p_content'),
        cover_image: val('p_cover'),
        tags: val('p_tags'),
        author_name: val('p_author'),
        meta_title: val('p_meta_title'),
        meta_description: val('p_meta_desc'),
        status: val('p_status'),
        updated_at: new Date().toISOString()
      };
      if (!payload.title) throw new Error('Title required');
      var res = id
        ? await window.MITTELY.supabase.from('blog_posts').update(payload).eq('id', id)
        : await window.MITTELY.supabase.from('blog_posts').insert(payload);
      if (res && res.error) throw res.error;
      toast('Post saved', 'success');
      closeModal('adminEntityModal');
      loadBlog();
    } catch (e) { toast((e && e.message) || 'Save failed', 'error'); }
  }

  /* ---------- Users ---------- */

  async function loadUsers() {
    var tbody = document.getElementById('adminUsersTable');
    var search = document.getElementById('adminUserSearch');
    var pag = document.getElementById('adminUsersPagination');
    if (!tbody) return;

    async function fetchList() {
      var res = await window.MITTELY.supabase.rpc('admin_list_users');
      var data = (res && res.data) || [];
      if (Array.isArray(data) && data.length && Array.isArray(data[0])) data = data[0];
      var q = (search && search.value.trim() || '').toLowerCase();
      if (q) {
        data = data.filter(function (u) {
          return (u.email || '').toLowerCase().indexOf(q) !== -1 || (u.name || '').toLowerCase().indexOf(q) !== -1;
        });
      }
      var perPage = 20;
      var total = data.length;
      var pages = Math.max(1, Math.ceil(total / perPage));
      if (usersPage > pages) usersPage = pages;
      var slice = data.slice((usersPage - 1) * perPage, usersPage * perPage);
      tbody.innerHTML = slice.map(function (u) {
        return '<tr><td>' + esc(u.name || '—') + '</td><td>' + esc(u.email) + '</td>' +
          '<td>' + (u.orders_count || 0) + '</td><td>' + money(u.total_spent_usd || 0) + '</td>' +
          '<td>' + (u.downloads_count || 0) + '</td>' +
          '<td>' + (u.created_at ? new Date(u.created_at).toLocaleDateString() : '') + '</td>' +
          '<td><div class="table-actions"><button data-user="' + esc(u.id) + '" data-email="' + esc(u.email) + '"><i class="fa-solid fa-eye"></i></button></div></td></tr>';
      }).join('') || '<tr><td colspan="7">No users</td></tr>';

      if (pag) {
        var html = '';
        for (var i = 1; i <= pages; i++) html += '<button class="chip' + (i === usersPage ? ' active' : '') + '" data-page="' + i + '">' + i + '</button>';
        pag.innerHTML = pages > 1 ? html : '';
      }
    }

    if (search && !search.dataset.bound) {
      search.dataset.bound = '1';
      var deb = window.MITTELY.main.debounce(function () { usersPage = 1; fetchList(); }, 250);
      search.addEventListener('input', deb);
    }
    if (pag && !pag.dataset.bound) {
      pag.dataset.bound = '1';
      pag.addEventListener('click', function (e) {
        var b = e.target.closest('[data-page]');
        if (!b) return;
        usersPage = parseInt(b.getAttribute('data-page'), 10) || 1;
        fetchList();
      });
    }
    if (!tbody.dataset.bound) {
      tbody.dataset.bound = '1';
      tbody.addEventListener('click', async function (e) {
        var b = e.target.closest('[data-user]');
        if (!b) return;
        var email = b.getAttribute('data-email');
        var ordersRes = await window.MITTELY.supabase.from('orders').select('*').eq('email', email).order('created_at', { ascending: false });
        var actRes = await window.MITTELY.supabase.from('activity_log').select('*').eq('email', email).order('created_at', { ascending: false }).limit(20);
        var orders = (ordersRes && ordersRes.data) || [];
        var acts = (actRes && actRes.data) || [];
        openDrawer('User detail',
          '<h3>' + esc(email) + '</h3>' +
          '<h4 style="margin-top:16px;">Orders</h4>' +
          (orders.length ? orders.map(function (o) { return '<div style="padding:8px 0;border-bottom:1px solid var(--border);">' + esc(o.paystack_reference) + ' · ' + money(o.usd_amount) + ' · ' + esc(o.status) + '</div>'; }).join('') : '<p>No orders</p>') +
          '<h4 style="margin-top:16px;">Activity</h4>' +
          (acts.length ? '<ul class="activity-feed">' + acts.map(activityItemHtml).join('') + '</ul>' : '<p>No activity</p>'));
      });
    }

    await fetchList();
  }

  /* ---------- Activity ---------- */

  async function loadActivity() {
    var feed = document.getElementById('adminActivityFeed');
    var pag = document.getElementById('adminActivityPagination');
    var filters = document.getElementById('activityFilters');
    if (!feed) return;
    var PER = 20;

    async function fetchList() {
      var q = window.MITTELY.supabase.from('activity_log').select('*', { count: 'exact' }).order('created_at', { ascending: false });
      if (activityFilter.event) q = q.eq('event', activityFilter.event);
      if (activityFilter.date) {
        var start = new Date(activityFilter.date + 'T00:00:00').toISOString();
        var end = new Date(activityFilter.date + 'T23:59:59').toISOString();
        q = q.gte('created_at', start).lte('created_at', end);
      }
      var from = (activityPage - 1) * PER;
      q = q.range(from, from + PER - 1);
      var res = await q;
      var data = (res && res.data) || [];
      var total = (res && res.count) || 0;
      feed.innerHTML = data.length ? data.map(activityItemHtml).join('') : '<li>No activity</li>';
      if (pag) {
        var pages = Math.max(1, Math.ceil(total / PER));
        var html = '';
        for (var i = 1; i <= pages; i++) html += '<button class="chip' + (i === activityPage ? ' active' : '') + '" data-page="' + i + '">' + i + '</button>';
        pag.innerHTML = pages > 1 ? html : '';
      }
    }

    if (filters && !filters.dataset.bound) {
      filters.dataset.bound = '1';
      filters.addEventListener('click', function (e) {
        var chip = e.target.closest('.chip');
        if (chip) {
          filters.querySelectorAll('.chip').forEach(function (c) { c.classList.remove('active'); });
          chip.classList.add('active');
          activityFilter.event = chip.getAttribute('data-event') || '';
          activityPage = 1;
          fetchList();
        }
      });
      var dateInput = document.getElementById('activityDate');
      if (dateInput) {
        dateInput.addEventListener('change', function () {
          activityFilter.date = dateInput.value || '';
          activityPage = 1;
          fetchList();
        });
      }
    }
    if (pag && !pag.dataset.bound) {
      pag.dataset.bound = '1';
      pag.addEventListener('click', function (e) {
        var b = e.target.closest('[data-page]');
        if (!b) return;
        activityPage = parseInt(b.getAttribute('data-page'), 10) || 1;
        fetchList();
      });
    }

    await fetchList();
  }

  /* ---------- Newsletter ---------- */

  async function loadNewsletter() {
    var tbody = document.getElementById('adminNewsletterTable');
    var count = document.getElementById('newsletterCount');
    var exportBtn = document.getElementById('exportNewsletterBtn');
    if (!tbody) return;
    var res = await window.MITTELY.supabase.from('newsletter').select('*').order('created_at', { ascending: false });
    var data = (res && res.data) || [];
    if (count) count.textContent = String(data.length);
    tbody.innerHTML = data.map(function (n) {
      return '<tr><td>' + esc(n.email) + '</td><td>' + (n.created_at ? new Date(n.created_at).toLocaleDateString() : '') + '</td>' +
        '<td><div class="table-actions"><button class="danger" data-del="' + esc(n.id) + '"><i class="fa-solid fa-trash"></i></button></div></td></tr>';
    }).join('') || '<tr><td colspan="3">No subscribers</td></tr>';

    if (!tbody.dataset.bound) {
      tbody.dataset.bound = '1';
      tbody.addEventListener('click', async function (e) {
        var b = e.target.closest('[data-del]');
        if (!b) return;
        openConfirm('Delete this subscriber?', async function () {
          await window.MITTELY.supabase.from('newsletter').delete().eq('id', b.getAttribute('data-del'));
          toast('Deleted', 'success');
          loadNewsletter();
        });
      });
    }

    if (exportBtn && !exportBtn.dataset.bound) {
      exportBtn.dataset.bound = '1';
      exportBtn.addEventListener('click', function () {
        var csv = 'email,subscribed\n' + data.map(function (n) {
          return '"' + (n.email || '') + '","' + (n.created_at || '') + '"';
        }).join('\n');
        var blob = new Blob([csv], { type: 'text/csv' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url; a.download = 'mittely-newsletter.csv';
        document.body.appendChild(a); a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      });
    }
  }

  /* ---------- Settings ---------- */

  async function loadSettings() {
    var res = await window.MITTELY.supabase.from('settings').select('skey, svalue');
    var data = (res && res.data) || [];
    var map = {};
    data.forEach(function (r) { map[r.skey] = r.svalue; });

    var hot = document.getElementById('settingHotSaleToggle');
    var hotEnds = document.getElementById('settingHotSaleEnds');
    var bf = document.getElementById('settingBlackFridayToggle');
    var ann = document.getElementById('settingAnnouncement');
    var hero = document.getElementById('settingHeroHeadline');
    var fx = document.getElementById('settingFxFallback');
    var gh = document.getElementById('settingGithub');
    var x = document.getElementById('settingX');
    var tg = document.getElementById('settingTelegram');
    var ig = document.getElementById('settingInstagram');
    var li = document.getElementById('settingLinkedin');
    var yt = document.getElementById('settingYoutube');
    var dc = document.getElementById('settingDiscord');

    if (hot) hot.checked = map.hot_sale_mode === 'on';
    if (hotEnds) hotEnds.value = map.hot_sale_ends_at ? map.hot_sale_ends_at.slice(0, 16) : '';
    if (bf) bf.checked = map.black_friday_mode === 'on';
    if (ann) ann.value = map.announcement_bar || '';
    if (hero) hero.value = map.hero_headline || '';
    if (fx) fx.value = map.fx_fallback_rate || '15.50';
    if (gh) gh.value = map.github_url || '';
    if (x) x.value = map.x_url || '';
    if (tg) tg.value = map.telegram_url || '';
    if (ig) ig.value = map.instagram_url || '';
    if (li) li.value = map.linkedin_url || '';
    if (yt) yt.value = map.youtube_url || '';
    if (dc) dc.value = map.discord_url || '';

    var saveBtn = document.getElementById('saveSettingsBtn');
    if (saveBtn && !saveBtn.dataset.bound) {
      saveBtn.dataset.bound = '1';
      saveBtn.addEventListener('click', async function () {
        setLoading(saveBtn, true);
        try {
          var entries = {
            hot_sale_mode: hot && hot.checked ? 'on' : 'off',
            hot_sale_ends_at: hotEnds ? hotEnds.value : '',
            black_friday_mode: bf && bf.checked ? 'on' : 'off',
            announcement_bar: ann ? ann.value : '',
            hero_headline: hero ? hero.value : '',
            fx_fallback_rate: fx ? fx.value : '15.50'
          };
          await upsertSettings(entries);
          toast('Settings saved', 'success');
        } catch (e) { toast('Save failed', 'error'); }
        finally { setLoading(saveBtn, false); }
      });
    }

    var saveSocial = document.getElementById('saveSocialBtn');
    if (saveSocial && !saveSocial.dataset.bound) {
      saveSocial.dataset.bound = '1';
      saveSocial.addEventListener('click', async function () {
        setLoading(saveSocial, true);
        try {
          await upsertSettings({
            github_url: gh ? gh.value : '',
            x_url: x ? x.value : '',
            telegram_url: tg ? tg.value : '',
            instagram_url: ig ? ig.value : '',
            linkedin_url: li ? li.value : '',
            youtube_url: yt ? yt.value : '',
            discord_url: dc ? dc.value : ''
          });
          toast('Socials saved', 'success');
        } catch (e) { toast('Save failed', 'error'); }
        finally { setLoading(saveSocial, false); }
      });
    }
  }

  async function upsertSettings(entries) {
    var rows = Object.keys(entries).map(function (k) { return { skey: k, svalue: String(entries[k] || '') }; });
    var res = await window.MITTELY.supabase.from('settings').upsert(rows, { onConflict: 'skey' });
    if (res && res.error) throw res.error;
  }

  /* ---------- Admins ---------- */

  async function loadAdmins() {
    var tbody = document.getElementById('adminAdminsTable');
    var addBtn = document.getElementById('addAdminBtn');
    if (!tbody) return;
    var res = await window.MITTELY.supabase.from('admin_users').select('*').order('email');
    var data = (res && res.data) || [];
    tbody.innerHTML = data.map(function (a) {
      var isOwner = a.email === OWNER_EMAIL;
      return '<tr><td>' + esc(a.email) + (isOwner ? ' <span class="coupon-badge-sm">owner</span>' : '') + '</td>' +
        '<td>' + (isOwner ? '<span class="text-muted">Protected</span>' :
          '<div class="table-actions"><button class="danger" data-remove-admin="' + esc(a.email) + '"><i class="fa-solid fa-trash"></i></button></div>') + '</td></tr>';
    }).join('') || '<tr><td colspan="2">No admins</td></tr>';

    if (!tbody.dataset.bound) {
      tbody.dataset.bound = '1';
      tbody.addEventListener('click', function (e) {
        var b = e.target.closest('[data-remove-admin]');
        if (!b) return;
        var email = b.getAttribute('data-remove-admin');
        if (email === OWNER_EMAIL) { toast('Owner cannot be removed', 'error'); return; }
        openConfirm('Remove admin ' + email + '?', async function () {
          var del = await window.MITTELY.supabase.from('admin_users').delete().eq('email', email);
          if (del && del.error) { toast('Remove failed', 'error'); return; }
          toast('Admin removed', 'success');
          loadAdmins();
        });
      });
    }

    if (addBtn && !addBtn.dataset.bound) {
      addBtn.dataset.bound = '1';
      addBtn.addEventListener('click', async function () {
        var input = document.getElementById('newAdminEmail');
        var email = input ? input.value.trim() : '';
        if (!email || email.indexOf('@') === -1) { toast('Valid email required', 'error'); return; }
        var ins = await window.MITTELY.supabase.from('admin_users').insert({ email: email });
        if (ins && ins.error) { toast('Add failed', 'error'); return; }
        toast('Admin added', 'success');
        if (input) input.value = '';
        loadAdmins();
      });
    }
  }

  /* ---------- Modals & confirm ---------- */

  function openModal(id) {
    var m = document.getElementById(id);
    if (!m) return;
    m.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    var close = m.querySelector('.modal-close');
    if (close && !close.dataset.bound) {
      close.dataset.bound = '1';
      close.addEventListener('click', function () { closeModal(id); });
    }
    m.addEventListener('click', function (e) { if (e.target === m) closeModal(id); });
  }

  function closeModal(id) {
    var m = document.getElementById(id);
    if (!m) return;
    m.style.display = 'none';
    document.body.style.overflow = '';
  }

  function openDrawer(title, html) {
    var t = document.getElementById('adminDrawerTitle');
    var b = document.getElementById('adminDrawerBody');
    if (t) t.textContent = title;
    if (b) b.innerHTML = html;
    openModal('adminDrawerModal');
  }

  function openConfirm(message, onOk) {
    var title = document.getElementById('confirmTitle');
    var msg = document.getElementById('confirmMessage');
    var body = document.getElementById('confirmBody');
    var ok = document.getElementById('confirmOkBtn');
    var cancel = document.getElementById('confirmCancelBtn');
    if (msg) msg.textContent = message;
    if (body) {
      var needsTyped = /type the/i.test(message);
      body.innerHTML = needsTyped ? '<div class="form-group"><label>Type to confirm</label><input type="text" id="confirmTyped"></div>' : '';
    }
    if (ok) {
      var clone = ok.cloneNode(true);
      ok.parentNode.replaceChild(clone, ok);
      clone.addEventListener('click', async function () {
        var typed = '';
        var input = document.getElementById('confirmTyped');
        if (input) typed = input.value.trim();
        closeModal('confirmModal');
        try { await onOk(typed); } catch (e) { /* handled */ }
      });
    }
    if (cancel && !cancel.dataset.bound) {
      cancel.dataset.bound = '1';
      cancel.addEventListener('click', function () { closeModal('confirmModal'); });
    }
    openModal('confirmModal');
  }

  window.MITTELY.admin = { init: init };
})();