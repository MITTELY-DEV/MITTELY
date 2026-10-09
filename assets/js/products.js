/* MITTELY — products.js
   Renders product/store/freebie/related/wishlist/home grids, review lists,
   the product detail page, review submission, wishlist toggle, recently viewed,
   and realtime approved-review streaming. No demo data — everything comes from Supabase. */
(function () {
  'use strict';

  var CARD_BADGE_ICONS = {
    BESTSELLER: 'fa-solid fa-star',
    NEW: 'fa-solid fa-wand-magic-sparkles'
  };

  function sb() { return window.mittely && window.mittely.sb && window.mittely.sb(); }
  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function money(usd) { return (window.mittelyCurrency && window.mittelyCurrency.format) ? window.mittelyCurrency.format(usd) : ('$' + Number(usd || 0).toFixed(2)); }
  function esc(s) { return window.escapeHtml ? window.escapeHtml(s) : String(s == null ? '' : s); }
  function toast(m, k) { if (window.toast) window.toast(m, k); }

  /* ============ Stars ============ */

  function starsHtml(rating) {
    var r = Number(rating) || 0;
    var html = '';
    for (var i = 1; i <= 5; i++) {
      if (r >= i) html += '<i class="fa-solid fa-star" aria-hidden="true"></i>';
      else if (r >= i - 0.5) html += '<i class="fa-solid fa-star-half-stroke" aria-hidden="true"></i>';
      else html += '<i class="fa-regular fa-star" aria-hidden="true"></i>';
    }
    return html;
  }

  function priceFor(product) {
    if (product.is_free) return { current: 0, strike: null, isFree: true };
    var sale = (product.sale_price != null && Number(product.sale_price) > 0) ? Number(product.sale_price) : null;
    var base = Number(product.price);
    if (sale != null && sale < base) return { current: sale, strike: base, isFree: false };
    return { current: base, strike: null, isFree: false };
  }

  /* ============ Product card (Pinterest-style) ============ */

  function productCardHtml(p) {
    var price = priceFor(p);
    var badges = [];
    if (p.badge === 'BESTSELLER') badges.push('<span class="badge badge-best"><i class="' + CARD_BADGE_ICONS.BESTSELLER + '" aria-hidden="true"></i> Bestseller</span>');
    if (p.badge === 'NEW') badges.push('<span class="badge badge-new"><i class="' + CARD_BADGE_ICONS.NEW + '" aria-hidden="true"></i> New</span>');
    if (p.is_hot_sale) badges.push('<span class="badge badge-hot"><i class="fa-solid fa-star" aria-hidden="true"></i> Hot Sale</span>');
    if (p.is_black_friday) badges.push('<span class="badge badge-bf"><i class="fa-solid fa-heart" aria-hidden="true"></i> <span class="sr-only">Black Friday deal</span></span>');
    if (p.is_featured) badges.push('<span class="badge badge-featured"><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i> Featured</span>');
    if (p.is_free) badges.push('<span class="badge badge-free"><i class="fa-solid fa-gift" aria-hidden="true"></i> Free</span>');

    var priceHtml = '';
    if (price.isFree) priceHtml = '<span class="card-price card-price-free">Free</span>';
    else {
      priceHtml = '<span class="card-price" data-price="' + price.current + '">' + esc(money(price.current)) + '</span>';
      if (price.strike) priceHtml += '<span class="card-price-strike" data-price="' + price.strike + '">' + esc(money(price.strike)) + '</span>';
    }

    var rating = Number(p.rating || 0);
    var reviews = Number(p.reviews_count || 0);
    var ratingHtml = reviews > 0
      ? '<span class="card-rating"><i class="fa-solid fa-star" aria-hidden="true"></i> ' + rating.toFixed(1) + ' <span class="muted">(' + reviews + ')</span></span>'
      : '<span class="card-rating muted">No reviews yet</span>';

    var productUrl = 'product.html?slug=' + encodeURIComponent(p.slug);
    var isBf = p.is_black_friday ? ' is-black-friday' : '';

    return '' +
      '<article class="card' + isBf + '" data-product-id="' + esc(p.id) + '" data-slug="' + esc(p.slug) + '">' +
        '<div class="card-media">' +
          (p.image_url
            ? '<img src="' + esc(p.image_url) + '" alt="' + esc(p.title) + ' preview" loading="lazy" decoding="async" width="600" height="450">'
            : '<div class="skeleton-block" aria-hidden="true"></div>') +
          '<div class="card-badges">' + badges.join('') + '</div>' +
          '<button class="card-heart" type="button" aria-label="Add ' + esc(p.title) + ' to wishlist" data-wishlist="' + esc(p.id) + '"><i class="fa-regular fa-heart" aria-hidden="true"></i></button>' +
          '<div class="card-scrim" aria-hidden="true"></div>' +
          '<a href="' + productUrl + '" class="card-save-pill"><i class="fa-solid fa-arrow-right" aria-hidden="true"></i> Quick view</a>' +
        '</div>' +
        '<div class="card-body">' +
          '<span class="card-cat">' + esc((p.category || '').replace(/-/g, ' ')) + '</span>' +
          '<h3 class="card-title"><a href="' + productUrl + '">' + esc(p.title) + '</a></h3>' +
          ratingHtml +
          '<div class="card-price-row">' + priceHtml + '</div>' +
        '</div>' +
      '</article>';
  }

  /* ============ Grid renderers ============ */

  function renderGrid(target, products, emptyEl) {
    if (!target) return;
    if (!products || !products.length) {
      target.innerHTML = '';
      if (emptyEl) emptyEl.hidden = false;
      return;
    }
    target.innerHTML = products.map(productCardHtml).join('');
    if (emptyEl) emptyEl.hidden = true;
    bindCardActions(target);
    if (window.mittelyMain && window.mittelyMain.initReviewClamps) {
      // Not reviews but shared reveal for cards.
    }
    initCardReveal(target);
    decorateWishlistStates(target);
  }

  function initCardReveal(scope) {
    if (!('IntersectionObserver' in window)) return;
    var cards = qsa('.card', scope).filter(function (c) { return !c.dataset.revealBound; });
    cards.forEach(function (c) { c.dataset.revealBound = '1'; });
    if (!cards.length) return;
    cards.forEach(function (c) {
      c.style.opacity = '0';
      c.style.transform = 'translateY(14px)';
      c.style.transition = 'opacity 500ms cubic-bezier(.22,.9,.32,1), transform 500ms cubic-bezier(.22,.9,.32,1)';
    });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry, i) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        setTimeout(function () {
          el.style.opacity = '1';
          el.style.transform = 'none';
        }, i * 50);
        io.unobserve(el);
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
    cards.forEach(function (c) { io.observe(c); });
  }

  /* ============ Wishlist ============ */

  function currentEmail() {
    return (window.mittely && window.mittely.currentEmail && window.mittely.currentEmail()) || null;
  }

  function loadWishlistIds() {
    var client = sb(), email = currentEmail();
    if (!client || !email) return Promise.resolve([]);
    return client.from('wishlist').select('product_id').eq('email', email)
      .then(function (res) {
        if (res.error || !res.data) return [];
        return res.data.map(function (r) { return r.product_id; });
      })
      .catch(function () { return []; });
  }

  function decorateWishlistStates(scope) {
    loadWishlistIds().then(function (ids) {
      var set = {};
      ids.forEach(function (id) { set[id] = true; });
      qsa('[data-wishlist]', scope).forEach(function (btn) {
        var id = btn.getAttribute('data-wishlist');
        var active = !!set[id];
        btn.classList.toggle('is-active', active);
        var i = btn.querySelector('i');
        if (i) i.className = active ? 'fa-solid fa-heart' : 'fa-regular fa-heart';
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
    });
  }

  function toggleWishlist(productId, btn) {
    var client = sb(), email = currentEmail();
    if (!email) {
      if (window.mittelyAuth && window.mittelyAuth.openModal) window.mittelyAuth.openModal('wishlist');
      return;
    }
    var active = btn && btn.classList.contains('is-active');
    if (active) {
      client.from('wishlist').delete().eq('email', email).eq('product_id', productId)
        .then(function () {
          if (btn) {
            btn.classList.remove('is-active');
            var i = btn.querySelector('i'); if (i) i.className = 'fa-regular fa-heart';
            btn.setAttribute('aria-pressed', 'false');
          }
          toast('Removed from wishlist.', 'success');
        });
    } else {
      client.from('wishlist').insert({ email: email, product_id: productId })
        .then(function (res) {
          if (res.error) { toast('Could not update wishlist.', 'error'); return; }
          if (btn) {
            btn.classList.add('is-active', 'is-pop');
            setTimeout(function () { btn.classList.remove('is-pop'); }, 600);
            var i = btn.querySelector('i'); if (i) i.className = 'fa-solid fa-heart';
            btn.setAttribute('aria-pressed', 'true');
          }
          toast('Saved to wishlist.', 'success');
        });
    }
  }

  function bindCardActions(scope) {
    qsa('[data-wishlist]', scope).forEach(function (btn) {
      if (btn.dataset.bound === '1') return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        toggleWishlist(btn.getAttribute('data-wishlist'), btn);
      });
    });
  }

  /* ============ Featured / hot / freebie loaders ============ */

  var PRODUCT_COLS = 'id,title,slug,category,tech,style_tags,price,sale_price,rating,reviews_count,short_desc,image_url,badge,is_free,is_hot_sale,is_black_friday,is_featured,is_published,download_count,sales_count,created_at';

  function loadFeatured() {
    var target = document.getElementById('featuredGrid');
    if (!target) return;
    var client = sb();
    if (!client) return;
    client.from('products').select(PRODUCT_COLS)
      .eq('is_published', true).eq('is_featured', true)
      .order('created_at', { ascending: false }).limit(6)
      .then(function (res) { renderGrid(target, res.data || []); });
  }

  function loadHotSale() {
    var section = document.getElementById('hotSaleSection');
    var target = document.getElementById('hotGrid');
    if (!section || !target) return;
    if (window.mittelyMain) {
      window.mittelyMain.getSettings().then(function (settings) {
        if (!settings || settings.hot_sale_mode !== 'on') { section.hidden = true; return; }
        section.hidden = false;
        startCountdown(settings.hot_sale_ends_at);
        var client = sb();
        if (!client) return;
        client.from('products').select(PRODUCT_COLS)
          .eq('is_published', true).eq('is_hot_sale', true)
          .order('sales_count', { ascending: false }).limit(3)
          .then(function (res) { renderGrid(target, res.data || []); });
      });
    }
  }

  function startCountdown(endsAt) {
    var el = document.getElementById('countdown');
    if (!el) return;
    var target = endsAt ? new Date(endsAt).getTime() : Date.now() + 3 * 24 * 3600 * 1000;
    var dayEl = document.getElementById('cdDays');
    var hourEl = document.getElementById('cdHours');
    var minEl = document.getElementById('cdMins');
    var secEl = document.getElementById('cdSecs');
    function pad(n) { return String(Math.max(0, n)).padStart(2, '0'); }
    function tick() {
      var diff = Math.max(0, target - Date.now());
      var days = Math.floor(diff / 86400000);
      var hours = Math.floor((diff % 86400000) / 3600000);
      var mins = Math.floor((diff % 3600000) / 60000);
      var secs = Math.floor((diff % 60000) / 1000);
      if (dayEl) dayEl.textContent = pad(days);
      if (hourEl) hourEl.textContent = pad(hours);
      if (minEl) minEl.textContent = pad(mins);
      if (secEl) secEl.textContent = pad(secs);
      if (diff <= 0) clearInterval(id);
    }
    tick();
    var id = setInterval(tick, 1000);
  }

  function loadBlackFriday() {
    var section = document.getElementById('bfSection');
    if (!section) return;
    if (!window.mittelyMain) return;
    window.mittelyMain.getSettings().then(function (settings) {
      if (!settings || settings.black_friday_mode !== 'on') { section.hidden = true; return; }
      section.hidden = false;
      if (window.mittelyMain && window.mittelyMain.initBFParticles) {
        window.mittelyMain.initBFParticles(document.getElementById('bfCanvas'));
      }
    });
  }

  function loadFreebies() {
    var target = document.getElementById('freebiesGrid');
    var empty = document.getElementById('freebiesEmpty');
    if (!target) return;
    var client = sb();
    if (!client) return;
    client.from('products').select(PRODUCT_COLS)
      .eq('is_published', true).eq('is_free', true)
      .order('created_at', { ascending: false })
      .then(function (res) { renderGrid(target, res.data || [], empty); });
  }

  /* ============ Store page ============ */

  var storeState = {
    page: 1, pageSize: 9,
    category: '', tech: '', style: '',
    maxPrice: 200, freeOnly: false,
    search: '', sort: 'newest',
    total: 0
  };

  function storeQuery() {
    var client = sb();
    if (!client) return null;
    var q = client.from('products').select(PRODUCT_COLS, { count: 'exact' }).eq('is_published', true);
    if (storeState.category) q = q.eq('category', storeState.category);
    if (storeState.tech) q = q.ilike('tech', '%' + storeState.tech + '%');
    if (storeState.style) q = q.ilike('style_tags', '%' + storeState.style + '%');
    if (storeState.freeOnly) q = q.eq('is_free', true);
    else if (storeState.maxPrice < 200) q = q.lte('price', storeState.maxPrice);
    if (storeState.search) {
      var s = '%' + storeState.search.replace(/%/g, '\\%') + '%';
      q = q.or('title.ilike.' + s + ',short_desc.ilike.' + s);
    }
    switch (storeState.sort) {
      case 'price-asc': q = q.order('price', { ascending: true }); break;
      case 'price-desc': q = q.order('price', { ascending: false }); break;
      case 'rating': q = q.order('rating', { ascending: false }); break;
      case 'sales': q = q.order('sales_count', { ascending: false }); break;
      default: q = q.order('created_at', { ascending: false });
    }
    var from = (storeState.page - 1) * storeState.pageSize;
    var to = from + storeState.pageSize - 1;
    return q.range(from, to);
  }

  function initStore() {
    var grid = document.getElementById('storeGrid');
    if (!grid) return;

    var cats = ['ui-kits','dashboards','landing-pages','ecommerce','portfolios','mobile-apps'];
    var techs = ['HTML','CSS','JavaScript','React','Figma','Vue','Next.js'];
    var styles = ['minimal','dark','bold','pastel','editorial','glassmorphism'];

    var catChips = document.getElementById('categoryChips');
    var techChips = document.getElementById('techChips');
    var styleChips = document.getElementById('styleChips');
    var priceRange = document.getElementById('priceRange');
    var priceValue = document.getElementById('priceValue');
    var freeOnly = document.getElementById('freeOnly');
    var sortSelect = document.getElementById('sortSelect');
    var searchInput = document.getElementById('storeSearch');
    var resultsCount = document.getElementById('resultsCount');
    var emptyEl = document.getElementById('storeEmpty');
    var pagEl = document.getElementById('storePagination');
    var clearBtn = document.getElementById('clearFilters');
    var clearBtnEmpty = document.getElementById('clearFiltersEmpty');

    if (catChips) {
      catChips.innerHTML = '<button class="chip is-active" data-cat="">All</button>' +
        cats.map(function (c) { return '<button class="chip" data-cat="' + c + '">' + c.replace(/-/g,' ') + '</button>'; }).join('');
      qsa('button', catChips).forEach(function (b) {
        b.addEventListener('click', function () {
          qsa('button', catChips).forEach(function (x) { x.classList.remove('is-active'); });
          b.classList.add('is-active');
          storeState.category = b.getAttribute('data-cat');
          storeState.page = 1; runStore();
        });
      });
    }
    if (techChips) {
      techChips.innerHTML = techs.map(function (t) { return '<button class="chip" data-tech="' + t + '">' + t + '</button>'; }).join('');
      qsa('button', techChips).forEach(function (b) {
        b.addEventListener('click', function () {
          var val = b.getAttribute('data-tech');
          var active = b.classList.contains('is-active');
          qsa('button', techChips).forEach(function (x) { x.classList.remove('is-active'); });
          if (!active) { b.classList.add('is-active'); storeState.tech = val; }
          else storeState.tech = '';
          storeState.page = 1; runStore();
        });
      });
    }
    if (styleChips) {
      styleChips.innerHTML = styles.map(function (t) { return '<button class="chip" data-style="' + t + '">' + t + '</button>'; }).join('');
      qsa('button', styleChips).forEach(function (b) {
        b.addEventListener('click', function () {
          var val = b.getAttribute('data-style');
          var active = b.classList.contains('is-active');
          qsa('button', styleChips).forEach(function (x) { x.classList.remove('is-active'); });
          if (!active) { b.classList.add('is-active'); storeState.style = val; }
          else storeState.style = '';
          storeState.page = 1; runStore();
        });
      });
    }
    if (priceRange) {
      priceRange.addEventListener('input', function () {
        storeState.maxPrice = Number(priceRange.value);
        if (priceValue) priceValue.textContent = money(storeState.maxPrice);
      });
      priceRange.addEventListener('change', function () { storeState.page = 1; runStore(); });
    }
    if (freeOnly) {
      freeOnly.addEventListener('change', function () {
        storeState.freeOnly = freeOnly.checked;
        storeState.page = 1; runStore();
      });
    }
    if (sortSelect) {
      sortSelect.addEventListener('change', function () {
        storeState.sort = sortSelect.value;
        storeState.page = 1; runStore();
      });
    }
    if (searchInput) {
      searchInput.addEventListener('input', window.debounce(function () {
        storeState.search = searchInput.value.trim();
        storeState.page = 1; runStore();
      }, 260));
    }
    function resetAll() {
      storeState = { page: 1, pageSize: 9, category: '', tech: '', style: '', maxPrice: 200, freeOnly: false, search: '', sort: 'newest', total: 0 };
      if (priceRange) priceRange.value = 200;
      if (priceValue) priceValue.textContent = money(200);
      if (freeOnly) freeOnly.checked = false;
      if (sortSelect) sortSelect.value = 'newest';
      if (searchInput) searchInput.value = '';
      if (catChips) { qsa('button', catChips).forEach(function (x, i) { x.classList.toggle('is-active', i === 0); }); }
      if (techChips) qsa('button', techChips).forEach(function (x) { x.classList.remove('is-active'); });
      if (styleChips) qsa('button', styleChips).forEach(function (x) { x.classList.remove('is-active'); });
      runStore();
    }
    if (clearBtn) clearBtn.addEventListener('click', resetAll);
    if (clearBtnEmpty) clearBtnEmpty.addEventListener('click', resetAll);

    // Mobile filters toggle
    var filtersToggle = document.getElementById('filtersToggle');
    var filtersPanel = document.querySelector('.store-filters');
    if (filtersToggle && filtersPanel) {
      filtersToggle.addEventListener('click', function () { filtersPanel.classList.toggle('is-open'); });
    }

    var url = new URL(window.location.href);
    var qp = url.searchParams.get('q');
    if (qp && searchInput) { searchInput.value = qp; storeState.search = qp; }

    runStore();
  }

  function runStore() {
    var grid = document.getElementById('storeGrid');
    var emptyEl = document.getElementById('storeEmpty');
    var pagEl = document.getElementById('storePagination');
    var resultsCount = document.getElementById('resultsCount');
    if (!grid) return;

    var q = storeQuery();
    if (!q) return;
    // Skeleton
    grid.innerHTML = '';
    for (var i = 0; i < 6; i++) {
      var sk = document.createElement('div');
      sk.className = 'card skeleton-card';
      sk.setAttribute('aria-hidden', 'true');
      grid.appendChild(sk);
    }

    q.then(function (res) {
      var rows = (res && res.data) || [];
      storeState.total = (res && res.count) || rows.length;
      if (resultsCount) {
        resultsCount.textContent = rows.length + ' of ' + storeState.total + ' product' + (storeState.total === 1 ? '' : 's');
      }
      renderGrid(grid, rows, emptyEl);
      renderPagination(pagEl, storeState.total, storeState.page, storeState.pageSize);
    }).catch(function () {
      grid.innerHTML = '';
      if (emptyEl) emptyEl.hidden = false;
    });
  }

  function renderPagination(container, total, page, size) {
    if (!container) return;
    var pages = Math.max(1, Math.ceil(total / size));
    if (pages <= 1) { container.innerHTML = ''; return; }
    var html = '';
    for (var i = 1; i <= pages; i++) {
      html += '<button type="button" class="' + (i === page ? 'is-active' : '') + '" data-page="' + i + '">' + i + '</button>';
    }
    container.innerHTML = html;
    qsa('button', container).forEach(function (b) {
      b.addEventListener('click', function () {
        storeState.page = Number(b.getAttribute('data-page'));
        runStore();
        var top = container.getBoundingClientRect().top + window.scrollY - 100;
        window.scrollTo({ top: top, behavior: 'smooth' });
      });
    });
  }

  /* ============ Reviews ============ */

  function reviewCardHtml(r, showProduct) {
    var name = r.name || 'Anonymous';
    var initial = String(name).trim().charAt(0).toUpperCase() || 'A';
    var date = r.created_at ? new Date(r.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '';
    var productName = (r.products && r.products.title) || r.product_title || '';
    return '' +
      '<article class="review-card">' +
        '<div class="review-card-head">' +
          '<span class="review-avatar" aria-hidden="true">' + esc(initial) + '</span>' +
          '<div>' +
            '<div class="review-name">' + esc(name) + '</div>' +
            '<div class="review-date">' + esc(date) + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="review-stars" aria-label="' + (r.rating || 0) + ' out of 5 stars">' + starsHtml(r.rating) + '</div>' +
        (showProduct && productName ? '<div class="review-product">' + esc(productName) + '</div>' : '') +
        '<p class="review-comment">' + esc(r.comment || '') + '</p>' +
      '</article>';
  }

  function loadReviewList(opts) {
    var target = opts.target;
    var empty = opts.empty;
    var client = sb();
    if (!target || !client) return;
    var query = client.from('reviews')
      .select('id,name,rating,comment,created_at,product_id,products(title)')
      .eq('status', 'approved')
      .order('created_at', { ascending: false });
    if (opts.productId) query = query.eq('product_id', opts.productId);
    if (opts.limit) query = query.limit(opts.limit);

    query.then(function (res) {
      var rows = (res && res.data) || [];
      if (!rows.length) {
        target.innerHTML = '';
        if (empty) empty.hidden = false;
        return;
      }
      target.innerHTML = rows.map(function (r) { return reviewCardHtml(r, opts.showProduct); }).join('');
      if (empty) empty.hidden = true;
      if (window.mittelyMain && window.mittelyMain.initReviewClamps) {
        window.mittelyMain.initReviewClamps(target);
      }
    });
  }

  /* ============ Realtime review stream ============ */

  function subscribeReviews(onInsert) {
    var client = sb();
    if (!client) return null;
    try {
      return client.channel('mittely-reviews-live')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reviews', filter: 'status=eq.approved' },
          function (payload) { onInsert(payload && payload.new); })
        .subscribe();
    } catch (e) { return null; }
  }

  /* ============ Home page reviews + realtime ============ */

  function initHomeReviews() {
    var target = document.getElementById('homeReviews');
    if (!target) return;
    var empty = null;
    loadReviewList({ target: target, empty: empty, limit: 3, showProduct: true });
    subscribeReviews(function (row) {
      // Prepend live review.
      var wrapper = document.createElement('div');
      wrapper.innerHTML = reviewCardHtml(row, true);
      var card = wrapper.firstElementChild;
      if (!card) return;
      target.insertBefore(card, target.firstChild);
      while (target.children.length > 3) target.removeChild(target.lastChild);
      if (window.mittelyMain && window.mittelyMain.initReviewClamps) {
        window.mittelyMain.initReviewClamps(target);
      }
      toast('New review just landed', 'success');
    });
  }

  /* ============ Blog teaser (home) ============ */

  function initHomeBlog() {
    var target = document.getElementById('homeBlog');
    if (!target) return;
    var client = sb();
    if (!client) return;
    client.from('blog_posts')
      .select('id,title,slug,excerpt,cover_image,tags,created_at')
      .eq('status', 'published')
      .order('created_at', { ascending: false }).limit(3)
      .then(function (res) {
        var rows = (res && res.data) || [];
        if (!rows.length) {
          target.innerHTML = '<div class="empty-state"><i class="fa-regular fa-newspaper" aria-hidden="true"></i><h3>No articles yet</h3><p>We&rsquo;re writing. Check back soon.</p></div>';
          return;
        }
        target.innerHTML = rows.map(function (p) {
          return '' +
            '<article class="card">' +
              '<div class="card-media">' +
                (p.cover_image ? '<img src="' + esc(p.cover_image) + '" alt="' + esc(p.title) + ' cover" loading="lazy" decoding="async" width="600" height="450">' : '<div class="skeleton-block" aria-hidden="true"></div>') +
                '<div class="card-scrim" aria-hidden="true"></div>' +
                '<a href="blog.html?slug=' + encodeURIComponent(p.slug) + '" class="card-save-pill"><i class="fa-solid fa-arrow-right" aria-hidden="true"></i> Read</a>' +
              '</div>' +
              '<div class="card-body">' +
                '<h3 class="card-title"><a href="blog.html?slug=' + encodeURIComponent(p.slug) + '">' + esc(p.title) + '</a></h3>' +
                '<p class="muted" style="margin:0;font-size:.92em">' + esc(p.excerpt || '') + '</p>' +
              '</div>' +
            '</article>';
        }).join('');
        initCardReveal(target);
      });
  }

  /* ============ Product detail page ============ */

  var currentProduct = null;
  var currentLicense = 'standard';

  function getParam(name) {
    return new URL(window.location.href).searchParams.get(name);
  }

  function initProductPage() {
    var titleEl = document.getElementById('productTitle');
    if (!titleEl) return;
    var slug = getParam('slug');
    if (!slug) { showNotFound(); return; }

    var client = sb();
    if (!client) return;

    client.from('products').select(PRODUCT_COLS + ',long_desc,gallery,demo_url,preview_embed_url,whats_included,version,changelog,download_path,designer_email')
      .eq('slug', slug).maybeSingle()
      .then(function (res) {
        if (res.error || !res.data || res.data.is_published === false) { showNotFound(); return; }
        currentProduct = res.data;
        renderProduct(currentProduct);
      })
      .catch(function () { showNotFound(); });
  }

  function showNotFound() {
    var detail = document.getElementById('productDetail');
    var blocks = document.querySelector('.product-info-blocks');
    var reviews = document.querySelector('.reviews-section');
    var related = document.getElementById('relatedGrid') && document.getElementById('relatedGrid').closest('.section');
    var notFound = document.getElementById('productNotFound');
    if (detail) detail.hidden = true;
    if (blocks) blocks.hidden = true;
    if (reviews) reviews.hidden = true;
    if (related) related.hidden = true;
    if (notFound) notFound.hidden = false;
    var meta = document.querySelector('meta[name="robots"]');
    if (meta) meta.setAttribute('content', 'noindex, nofollow');
  }

  function renderProduct(p) {
    // Title + crumb
    document.title = p.title + ' — MITTELY';
    var md = document.querySelector('meta[name="description"]');
    if (md) md.setAttribute('content', (p.short_desc || p.title).slice(0, 158));
    var link = document.querySelector('link[rel="canonical"]');
    if (link) link.setAttribute('href', 'https://mittely.com/product.html?slug=' + encodeURIComponent(p.slug));

    var crumb = document.getElementById('productCrumb');
    if (crumb) crumb.textContent = p.title;

    var badges = document.getElementById('productBadges');
    if (badges) {
      var badgesHtml = '';
      if (p.badge === 'BESTSELLER') badgesHtml += '<span class="badge badge-best"><i class="fa-solid fa-star" aria-hidden="true"></i> Bestseller</span>';
      if (p.badge === 'NEW') badgesHtml += '<span class="badge badge-new"><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i> New</span>';
      if (p.is_hot_sale) badgesHtml += '<span class="badge badge-hot"><i class="fa-solid fa-star" aria-hidden="true"></i> Hot Sale</span>';
      if (p.is_black_friday) badgesHtml += '<span class="badge badge-bf"><i class="fa-solid fa-heart" aria-hidden="true"></i> <span class="sr-only">Black Friday deal</span></span>';
      if (p.is_free) badgesHtml += '<span class="badge badge-free"><i class="fa-solid fa-gift" aria-hidden="true"></i> Free</span>';
      badges.innerHTML = badgesHtml;
    }

    document.getElementById('productTitle').textContent = p.title;
    var shortEl = document.getElementById('productShort');
    if (shortEl) shortEl.textContent = p.short_desc || '';

    var ratingRow = document.getElementById('productRatingRow');
    if (ratingRow) {
      var r = Number(p.rating || 0), rc = Number(p.reviews_count || 0);
      ratingRow.innerHTML = rc > 0
        ? '<span class="review-stars">' + starsHtml(r) + '</span><span>' + r.toFixed(1) + ' · ' + rc + ' review' + (rc === 1 ? '' : 's') + '</span>'
        : '<span class="muted">No reviews yet</span>';
    }

    renderGallery(p);
    renderPrice(p);
    renderLicenses(p);
    renderWhatsIncluded(p);
    renderLongDesc(p);
    renderChangelog(p);
    renderDemo(p);
    renderSideMeta(p);

    // Buttons
    var addBtn = document.getElementById('addToCartBtn');
    var buyBtn = document.getElementById('buyNowBtn');
    var wishBtn = document.getElementById('wishlistBtn');

    if (addBtn) addBtn.addEventListener('click', function () {
      if (!currentProduct) return;
      window.mittelyCart.add(currentProduct, currentLicense);
      toast('Added to cart.', 'success');
    });
    if (buyBtn) buyBtn.addEventListener('click', function () {
      if (!currentProduct) return;
      if (currentProduct.is_free) {
        downloadFree(currentProduct);
        return;
      }
      var email = (window.mittely && window.mittely.currentEmail && window.mittely.currentEmail());
      if (!email) { window.mittelyAuth.openModal('buy'); return; }
      window.mittelyCart.add(currentProduct, currentLicense);
      window.location.href = 'checkout.html';
    });
    if (wishBtn) {
      wishBtn.setAttribute('data-wishlist', p.id);
      bindCardActions(document);
      decorateWishlistStates(document);
    }

    // Reviews list + form
    loadReviewList({ target: document.getElementById('productReviews'), empty: document.getElementById('productReviewsEmpty'), productId: p.id });
    subscribeReviews(function (row) {
      if (row && row.product_id === p.id && row.status === 'approved') {
        var t = document.getElementById('productReviews');
        if (t) {
          var wrapper = document.createElement('div');
          wrapper.innerHTML = reviewCardHtml(row, false);
          var card = wrapper.firstElementChild;
          if (card) t.insertBefore(card, t.firstChild);
          if (window.mittelyMain && window.mittelyMain.initReviewClamps) window.mittelyMain.initReviewClamps(t);
        }
        toast('New review just landed', 'success');
      }
    });
    bindReviewForm(p);

    // Related
    var related = document.getElementById('relatedGrid');
    if (related) {
      sb().from('products').select(PRODUCT_COLS)
        .eq('is_published', true).eq('category', p.category).neq('id', p.id)
        .limit(3).then(function (res) { renderGrid(related, res.data || []); });
    }

    // Recently viewed
    pushRecentlyViewed(p);
    renderRecentlyViewed();

    injectProductJsonLd(p, document.getElementById('productReviews') ? getApprovedCount(p) : 0);
  }

  function renderGallery(p) {
    var gallery = document.getElementById('productGallery');
    var thumbs = document.getElementById('productThumbs');
    if (!gallery) return;
    var images = [];
    if (p.image_url) images.push(p.image_url);
    if (Array.isArray(p.gallery)) {
      p.gallery.forEach(function (g) { if (g) images.push(g); });
    }
    if (!images.length) images.push('https://images.unsplash.com/photo-1559028012-481c04fa702d?w=900&q=80');

    gallery.innerHTML = '<img src="' + esc(images[0]) + '" alt="' + esc(p.title) + ' main preview" width="900" height="675" fetchpriority="high" decoding="async">';
    if (thumbs) {
      thumbs.innerHTML = images.map(function (src, i) {
        return '<button type="button" class="' + (i === 0 ? 'is-active' : '') + '" data-idx="' + i + '" aria-label="Show image ' + (i+1) + '"><img src="' + esc(src) + '" alt="" loading="lazy" decoding="async"></button>';
      }).join('');
      qsa('button', thumbs).forEach(function (b) {
        b.addEventListener('click', function () {
          qsa('button', thumbs).forEach(function (x) { x.classList.remove('is-active'); });
          b.classList.add('is-active');
          var src = images[Number(b.getAttribute('data-idx'))];
          gallery.innerHTML = '<img src="' + esc(src) + '" alt="' + esc(p.title) + ' preview" width="900" height="675" decoding="async">';
        });
      });
    }
  }

  function renderPrice(p) {
    var cur = document.getElementById('productPrice');
    var strike = document.getElementById('productPriceStrike');
    var save = document.getElementById('productPriceSave');
    if (!cur) return;
    var lic = window.mittelyCart.LICENSE_MULTIPLIER[currentLicense] || 1;
    if (p.is_free) {
      cur.textContent = 'Free';
      strike.hidden = true; save.hidden = true;
      return;
    }
    var base = Number(p.price);
    var sale = (p.sale_price != null && Number(p.sale_price) > 0) ? Number(p.sale_price) : null;
    var effective = (sale != null && sale < base) ? sale : base;
    cur.textContent = money(effective * lic);
    if (sale != null && sale < base) {
      strike.hidden = false; strike.textContent = money(base * lic);
      save.hidden = false; save.textContent = 'Save ' + Math.round((1 - sale / base) * 100) + '%';
    } else { strike.hidden = true; save.hidden = true; }
  }

  function renderLicenses(p) {
    var wrap = document.getElementById('licenseSelector');
    if (!wrap || p.is_free) { if (wrap) wrap.innerHTML = ''; return; }
    var std = 'Use in one end product, personal or commercial. Not for resale or redistribution.';
    var ext = 'Use in one end product sold to one client, or unlimited personal projects. Not for resale as-is.';
    var options = [
      { key: 'standard', name: 'Standard', mult: 1.0, terms: std },
      { key: 'extended', name: 'Extended', mult: 3.0, terms: ext }
    ];
    wrap.innerHTML = options.map(function (o) {
      var active = o.key === currentLicense ? ' is-selected' : '';
      var price = money(Number(p.price) * o.mult);
      return '' +
        '<label class="license-option' + active + '">' +
          '<input type="radio" name="license" value="' + o.key + '"' + (active ? ' checked' : '') + '>' +
          '<span class="license-radio" aria-hidden="true"></span>' +
          '<span class="license-info">' +
            '<span class="license-name">' + o.name + '</span>' +
            '<span class="license-terms">' + esc(o.terms) + '</span>' +
          '</span>' +
          '<span class="license-price">' + price + '</span>' +
        '</label>';
    }).join('');
    qsa('input[name="license"]', wrap).forEach(function (inp) {
      inp.addEventListener('change', function () {
        currentLicense = inp.value;
        qsa('.license-option', wrap).forEach(function (el) { el.classList.remove('is-selected'); });
        inp.closest('.license-option').classList.add('is-selected');
        renderPrice(p);
        renderLicenses(p);
      });
    });
  }

  function renderWhatsIncluded(p) {
    var el = document.getElementById('whatsIncluded');
    if (!el) return;
    var items = Array.isArray(p.whats_included) ? p.whats_included : [];
    if (!items.length) { el.innerHTML = '<li>Source files</li><li>Documentation</li>'; return; }
    el.innerHTML = items.map(function (i) { return '<li>' + esc(typeof i === 'string' ? i : (i.text || i.label || '')) + '</li>'; }).join('');
  }

  function renderLongDesc(p) {
    var el = document.getElementById('longDesc');
    if (!el) return;
    el.innerHTML = sanitizeHtml(p.long_desc || p.short_desc || '');
  }

  function renderChangelog(p) {
    var block = document.getElementById('changelogBlock');
    var vEl = document.getElementById('productVersion');
    var cEl = document.getElementById('productChangelog');
    if (vEl) vEl.textContent = p.version || '1.0';
    if (cEl) cEl.innerHTML = sanitizeHtml(p.changelog || '');
    if (block) block.hidden = !(p.version || p.changelog);
  }

  function renderDemo(p) {
    var demoBlock = document.getElementById('productDemoBlock');
    var demoLink = document.getElementById('liveDemoLink');
    var embedBlock = document.getElementById('embedBlock');
    var iframe = document.getElementById('previewIframe');
    if (p.demo_url && demoLink && demoBlock) {
      demoBlock.hidden = false;
      demoLink.href = p.demo_url;
    } else if (demoBlock) demoBlock.hidden = true;

    if (p.preview_embed_url && iframe && embedBlock) {
      iframe.src = p.preview_embed_url;
      embedBlock.hidden = false;
    }
  }

  function renderSideMeta(p) {
    var el = document.getElementById('productSideMeta');
    if (!el) return;
    var rows = [
      ['Category', (p.category || '').replace(/-/g, ' ')],
      ['Version', p.version || '1.0'],
      ['Tech', p.tech || '—'],
      ['Style', p.style_tags || '—'],
      ['Sales', String(p.sales_count || 0)],
      ['Downloads', String(p.download_count || 0)]
    ];
    el.innerHTML = rows.map(function (r) {
      return '<div><dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd></div>';
    }).join('');
  }

  /* Minimal allowlist sanitizer for blog/product long content. */
  function sanitizeHtml(html) {
    if (!html) return '';
    var tmp = document.createElement('div');
    tmp.innerHTML = String(html);
    var allowed = {
      P: [], H2: [], H3: [], H4: [], UL: [], OL: [], LI: [], A: ['href'], STRONG: [], EM: [],
      BLOCKQUOTE: [], CODE: [], PRE: [], IMG: ['src', 'alt'], BR: []
    };
    (function walk(node) {
      var children = Array.prototype.slice.call(node.childNodes || []);
      children.forEach(function (child) {
        if (child.nodeType === 1) {
          if (!allowed[child.tagName]) {
            var text = document.createTextNode(child.textContent || '');
            child.parentNode.replaceChild(text, child);
            return;
          }
          Array.prototype.slice.call(child.attributes).forEach(function (attr) {
            if (allowed[child.tagName].indexOf(attr.name) === -1) child.removeAttribute(attr.name);
          });
          walk(child);
        }
      });
    })(tmp);
    return tmp.innerHTML;
  }

  /* ============ Review form (product page) ============ */

  var reviewRating = 0;

  function bindStarInput() {
    var wrap = document.getElementById('starInput');
    if (!wrap || wrap.dataset.bound === '1') return;
    wrap.dataset.bound = '1';
    qsa('.star-btn', wrap).forEach(function (b) {
      b.addEventListener('click', function () {
        reviewRating = Number(b.getAttribute('data-value'));
        qsa('.star-btn', wrap).forEach(function (x) {
          var v = Number(x.getAttribute('data-value'));
          x.classList.toggle('is-active', v <= reviewRating);
          var i = x.querySelector('i');
          if (i) i.className = v <= reviewRating ? 'fa-solid fa-star' : 'fa-regular fa-star';
        });
      });
    });
  }

  function bindReviewForm(p) {
    bindStarInput();
    var form = document.getElementById('reviewForm');
    if (!form || form.dataset.bound === '1') return;
    form.dataset.bound = '1';
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = (window.mittely && window.mittely.currentEmail && window.mittely.currentEmail());
      if (!email) { window.mittelyAuth.openModal('review'); return; }

      var comment = document.getElementById('reviewComment');
      var err = document.getElementById('reviewError');
      var ok = document.getElementById('reviewSuccess');
      var btn = document.getElementById('reviewSubmitBtn');
      if (err) err.hidden = true;
      if (ok) ok.hidden = true;
      if (!reviewRating) { if (err) { err.textContent = 'Please choose a rating.'; err.hidden = false; } return; }
      if (!comment || !comment.value.trim()) { if (err) { err.textContent = 'Please add a comment.'; err.hidden = false; } return; }

      var user = (window.mittelyAuth && window.mittelyAuth.getUser && window.mittelyAuth.getUser());
      var name = (user && user.user_metadata && (user.user_metadata.full_name || user.user_metadata.name)) || email;
      var productId = p ? p.id : (form.dataset.productId || null);
      if (!productId) { if (err) { err.textContent = 'Product missing.'; err.hidden = false; } return; }

      btn.classList.add('is-loading');
      sb().from('reviews').insert({
        product_id: productId,
        name: name,
        email: email,
        rating: reviewRating,
        comment: comment.value.trim(),
        status: 'pending'
      }).then(function (res) {
        btn.classList.remove('is-loading');
        if (res.error) { if (err) { err.textContent = res.error.message || 'Could not submit.'; err.hidden = false; } return; }
        if (ok) ok.hidden = false;
        comment.value = '';
        reviewRating = 0;
        var wrap = document.getElementById('starInput');
        if (wrap) qsa('.star-btn', wrap).forEach(function (x) { x.classList.remove('is-active'); var i = x.querySelector('i'); if (i) i.className = 'fa-regular fa-star'; });
      });
    });
  }

  /* ============ Reviews page ============ */

  function initReviewsPage() {
    var grid = document.getElementById('reviewsGrid');
    if (!grid) return;
    var empty = document.getElementById('reviewsEmpty');
    var filterChips = document.getElementById('reviewFilterChips');
    var searchInput = document.getElementById('reviewSearch');
    var productSelect = document.getElementById('reviewProduct');
    var state = { rating: 'all', search: '' };

    if (productSelect) {
      sb().from('products').select('id,title').eq('is_published', true).order('title')
        .then(function (res) {
          var rows = (res && res.data) || [];
          productSelect.innerHTML = '<option value="">Choose a product…</option>' +
            rows.map(function (p) { return '<option value="' + esc(p.id) + '">' + esc(p.title) + '</option>'; }).join('');
        });
    }

    function render() {
      grid.innerHTML = '';
      for (var i = 0; i < 4; i++) { var s = document.createElement('div'); s.className = 'card skeleton-card'; s.setAttribute('aria-hidden','true'); grid.appendChild(s); }

      var q = sb().from('reviews')
        .select('id,name,rating,comment,created_at,products(title)')
        .eq('status', 'approved')
        .order('created_at', { ascending: false });
      if (state.rating !== 'all') q = q.eq('rating', Number(state.rating));
      if (state.search) q = q.ilike('comment', '%' + state.search + '%');

      q.then(function (res) {
        var rows = (res && res.data) || [];
        if (!rows.length) {
          grid.innerHTML = '';
          if (empty) empty.hidden = false;
          return;
        }
        grid.innerHTML = rows.map(function (r) { return reviewCardHtml(r, true); }).join('');
        if (empty) empty.hidden = true;
        if (window.mittelyMain && window.mittelyMain.initReviewClamps) window.mittelyMain.initReviewClamps(grid);
      });
    }

    if (filterChips) {
      qsa('button', filterChips).forEach(function (b) {
        b.addEventListener('click', function () {
          qsa('button', filterChips).forEach(function (x) { x.classList.remove('is-active'); });
          b.classList.add('is-active');
          state.rating = b.getAttribute('data-rating');
          render();
        });
      });
    }
    if (searchInput) searchInput.addEventListener('input', window.debounce(function () {
      state.search = searchInput.value.trim(); render();
    }, 260));

    render();
    subscribeReviews(function (row) {
      if (!row || !row.status === 'approved') return;
      toast('New review just landed', 'success');
      render();
    });

    // Reviews form
    bindStarInput();
    var form = document.getElementById('reviewForm');
    if (form) form.dataset.productId = '';

    if (productSelect) {
      productSelect.addEventListener('change', function () {
        if (form) form.dataset.productId = productSelect.value;
      });
    }

    if (form && form.dataset.bound !== '1') {
      form.dataset.bound = '1';
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var email = (window.mittely && window.mittely.currentEmail && window.mittely.currentEmail());
        if (!email) { window.mittelyAuth.openModal('review'); return; }
        var err = document.getElementById('reviewError');
        var ok = document.getElementById('reviewSuccess');
        var btn = document.getElementById('reviewSubmitBtn');
        var productId = productSelect ? productSelect.value : '';
        var comment = document.getElementById('reviewComment');
        if (err) err.hidden = true;
        if (ok) ok.hidden = true;
        if (!productId) { if (err) { err.textContent = 'Please choose a product.'; err.hidden = false; } return; }
        if (!reviewRating) { if (err) { err.textContent = 'Please choose a rating.'; err.hidden = false; } return; }
        if (!comment || !comment.value.trim()) { if (err) { err.textContent = 'Please add a comment.'; err.hidden = false; } return; }
        var user = (window.mittelyAuth && window.mittelyAuth.getUser && window.mittelyAuth.getUser());
        var name = (user && user.user_metadata && (user.user_metadata.full_name || user.user_metadata.name)) || email;
        btn.classList.add('is-loading');
        sb().from('reviews').insert({
          product_id: productId, name: name, email: email,
          rating: reviewRating, comment: comment.value.trim(), status: 'pending'
        }).then(function (res) {
          btn.classList.remove('is-loading');
          if (res.error) { if (err) { err.textContent = res.error.message || 'Could not submit.'; err.hidden = false; } return; }
          if (ok) ok.hidden = false;
          comment.value = '';
        });
      });
    }
  }

  /* ============ Recently viewed ============ */

  var RECENT_KEY = 'mittely_recent';

  function pushRecentlyViewed(p) {
    try {
      var arr = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
      arr = arr.filter(function (x) { return x.slug !== p.slug; });
      arr.unshift({ slug: p.slug, title: p.title, image_url: p.image_url || '', price: p.price, is_free: !!p.is_free });
      arr = arr.slice(0, 8);
      localStorage.setItem(RECENT_KEY, JSON.stringify(arr));
    } catch (e) {}
  }

  function renderRecentlyViewed() {
    var el = document.getElementById('recentStrip');
    if (!el) return;
    var arr = [];
    try { arr = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch (e) {}
    if (!arr.length) { el.innerHTML = '<p class="muted" style="margin:0;font-size:.85em">Nothing yet.</p>'; return; }
    el.innerHTML = arr.map(function (p) {
      return '<a href="product.html?slug=' + encodeURIComponent(p.slug) + '" title="' + esc(p.title) + '"><img src="' + esc(p.image_url || 'https://images.unsplash.com/photo-1559028012-481c04fa702d?w=200&q=60') + '" alt="' + esc(p.title) + '" loading="lazy" decoding="async"></a>';
    }).join('');
  }

  /* ============ JSON-LD ============ */

  function injectProductJsonLd(p, reviewCount) {
    var el = document.getElementById('mittelyProductJsonLd');
    if (!el) {
      el = document.createElement('script');
      el.type = 'application/ld+json';
      el.id = 'mittelyProductJsonLd';
      document.head.appendChild(el);
    }
    var images = [];
    if (p.image_url) images.push(p.image_url);
    if (Array.isArray(p.gallery)) p.gallery.forEach(function (g) { if (g) images.push(g); });
    var price = (p.sale_price != null && Number(p.sale_price) > 0) ? Number(p.sale_price) : Number(p.price);
    var data = {
      "@context": "https://schema.org",
      "@type": "Product",
      "name": p.title,
      "image": images.length ? images : ['https://mittely.com/assets/img/og-default.jpg'],
      "description": p.short_desc || p.title,
      "sku": p.slug,
      "brand": { "@type": "Brand", "name": "MITTELY" },
      "offers": {
        "@type": "Offer",
        "price": price.toFixed(2),
        "priceCurrency": "USD",
        "availability": "https://schema.org/InStock",
        "url": "https://mittely.com/product.html?slug=" + encodeURIComponent(p.slug)
      }
    };
    if (reviewCount > 0 && Number(p.rating) > 0) {
      data.aggregateRating = {
        "@type": "AggregateRating",
        "ratingValue": Number(p.rating).toFixed(1),
        "reviewCount": reviewCount
      };
    }
    el.textContent = JSON.stringify(data);
  }

  function getApprovedCount(p) { return Number(p.reviews_count || 0); }

  /* ============ Freebie download ============ */

  function downloadFree(product) {
    var email = (window.mittely && window.mittely.currentEmail && window.mittely.currentEmail());
    if (!email) { window.mittelyAuth.openModal('freebie'); return; }
    var btn = document.activeElement;
    if (btn && btn.classList) btn.classList.add('is-loading');
    sb().functions.invoke('create-download-url', { body: { product_id: product.id } })
      .then(function (res) {
        if (btn && btn.classList) btn.classList.remove('is-loading');
        var url = res && res.data && res.data.url;
        if (!url) { toast('Could not create download link.', 'error'); return; }
        window.location.href = url;
      })
      .catch(function () {
        if (btn && btn.classList) btn.classList.remove('is-loading');
        toast('Could not create download link.', 'error');
      });
  }

  /* ============ Freebies grid ============ */

  function bindFreebiesDownload() {
    qsa('[data-download-free]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-download-free');
        var slug = b.getAttribute('data-slug');
        var product = { id: id, slug: slug };
        downloadFree(product);
      });
    });
  }

  /* ============ Home stats counters ============ */

  function initHomeStats() {
    var blocks = qsa('[data-stat]');
    if (!blocks.length) return;
    sb().rpc('get_site_stats').then(function (res) {
      var data = (res && res.data) || {};
      var map = {
        products: Number(data.products || 0),
        downloads: Number(data.downloads || 0),
        reviews: Number(data.reviews || 0),
        designers: Number(data.designers || 0)
      };
      blocks.forEach(function (el) {
        var key = el.getAttribute('data-stat');
        var target = map[key] || 0;
        animateCount(el, target);
      });
    }).catch(function () {});
  }

  function animateCount(el, target) {
    var start = 0, dur = 1100;
    var t0 = performance.now();
    function frame(now) {
      var p = Math.min(1, (now - t0) / dur);
      var v = Math.floor(start + (target - start) * p);
      el.textContent = v >= 1000 ? (v / 1000).toFixed(1).replace('.0','') + 'k' : String(v);
      if (p < 1) requestAnimationFrame(frame);
      else el.textContent = target >= 1000 ? (target / 1000).toFixed(1).replace('.0','') + 'k' : String(target);
    }
    requestAnimationFrame(frame);
  }

  /* ============ Entry ============ */

  function onReady(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  onReady(function () {
    loadFeatured();
    loadHotSale();
    loadBlackFriday();
    loadFreebies();
    initStore();
    initHomeReviews();
    initHomeBlog();
    initHomeStats();
    initProductPage();
    initReviewsPage();
    bindFreebiesDownload();
    bindCardActions(document);
    decorateWishlistStates(document);

    document.addEventListener('mittely:fx-ready', function () {
      // Re-render prices on store cards when FX rate changes.
      qsa('[data-price]').forEach(function (el) {
        var usd = Number(el.getAttribute('data-price'));
        el.textContent = money(usd);
      });
    });
    document.addEventListener('mittely:currency-changed', function () {
      qsa('[data-price]').forEach(function (el) {
        var usd = Number(el.getAttribute('data-price'));
        el.textContent = money(usd);
      });
    });
  });

  window.mittelyProducts = {
    cardHtml: productCardHtml,
    reviewCardHtml: reviewCardHtml,
    renderGrid: renderGrid,
    subscribeReviews: subscribeReviews,
    sanitizeHtml: sanitizeHtml,
    downloadFree: downloadFree,
    toggleWishlist: toggleWishlist
  };
})();