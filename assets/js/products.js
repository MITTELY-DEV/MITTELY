/* ============================================
   MITTELY — products.js
   Store, freebies, product detail, reviews,
   wishlist, related, recently viewed, JSON-LD.
   ============================================ */
(function () {
  'use strict';

  if (!window.MITTELY) window.MITTELY = {};

  var PAGE_SIZE = 9;
  var storeState = {
    page: 1,
    search: '',
    category: '',
    price: '',
    sort: 'newest',
    chip: 'all',
    total: 0
  };

  var currentProduct = null;
  var currentLicense = 'standard';
  var licensesCache = null;

  var esc = function (s) { return window.MITTELY.main ? window.MITTELY.main.escapeHtml(s) : String(s || ''); };
  var money = function (n) { return window.MITTELY.currency ? window.MITTELY.currency.formatMoney(n) : ('$' + Number(n).toFixed(2)); };
  var toast = function (m, t) { if (window.MITTELY.main) window.MITTELY.main.toast(m, t); };

  /* ---------- Helpers ---------- */

  function effectivePrice(p) {
    if (!p) return 0;
    if (p.sale_price != null && p.sale_price !== '' && Number(p.sale_price) > 0) return Number(p.sale_price);
    return Number(p.price) || 0;
  }

  function productCardHtml(p, opts) {
    opts = opts || {};
    var price = effectivePrice(p);
    var hasSale = p.sale_price != null && p.sale_price !== '' && Number(p.sale_price) < Number(p.price);
    var badges = '';
    if (p.is_black_friday) badges += '<span class="card-badge bf"><i class="fa-solid fa-heart"></i> Black Friday</span>';
    else if (hasSale || p.is_hot_sale) badges += '<span class="card-badge sale"><i class="fa-solid fa-star"></i> Sale</span>';
    else if (p.badge) badges += '<span class="card-badge ' + (p.badge === 'NEW' ? 'new' : '') + '">' + esc(p.badge) + '</span>';
    else if (p.is_free) badges += '<span class="card-badge new">Free</span>';

    var priceHtml = p.is_free
      ? '<span class="card-price">Free</span>'
      : '<span class="card-price">' + money(price) + '</span>' +
        (hasSale ? '<span class="card-price-old">' + money(p.price) + '</span>' : '');

    var rating = Number(p.rating) || 0;
    var ratingHtml = rating > 0
      ? '<span class="card-rating"><i class="fa-solid fa-star"></i> ' + rating.toFixed(1) + ' (' + (p.reviews_count || 0) + ')</span>'
      : '<span class="card-rating">No reviews</span>';

    var href = 'product.html?slug=' + encodeURIComponent(p.slug || '');
    return '' +
      '<article class="product-card" data-product-id="' + esc(p.id) + '">' +
        '<div class="card-media">' +
          badges +
          '<img src="' + esc(p.image_url || '') + '" alt="' + esc(p.title) + '" loading="lazy" decoding="async">' +
          '<div class="card-scrim"></div>' +
          '<button class="card-heart" data-action="wishlist" aria-label="Save to wishlist"><i class="fa-solid fa-heart"></i></button>' +
          '<a href="' + href + '" class="card-save-pill"><i class="fa-solid fa-eye"></i> Quick view</a>' +
        '</div>' +
        '<div class="card-body">' +
          '<a href="' + href + '" class="card-title">' + esc(p.title) + '</a>' +
          '<p class="card-desc">' + esc(p.short_desc || '') + '</p>' +
          '<div class="card-meta">' + priceHtml + ratingHtml + '</div>' +
        '</div>' +
      '</article>';
  }

  function skeletonGrid(n) {
    var out = '';
    for (var i = 0; i < (n || 6); i++) out += '<div class="skeleton-card"></div>';
    return out;
  }

  /* ---------- Wishlist ---------- */

  async function toggleWishlist(productId, btnEl) {
    if (!window.MITTELY.supabase) return;
    var session = await window.MITTELY.auth.getSession();
    if (!session || !session.user) {
      window.MITTELY.auth.openSignInModal();
      return;
    }
    var email = session.user.email;
    if (!email) return;
    try {
      var existing = await window.MITTELY.supabase
        .from('wishlist')
        .select('id')
        .eq('email', email)
        .eq('product_id', productId)
        .maybeSingle();
      if (existing && existing.data && existing.data.id) {
        await window.MITTELY.supabase.from('wishlist').delete().eq('id', existing.data.id);
        if (btnEl) { btnEl.classList.remove('active'); }
        toast('Removed from wishlist', 'info');
      } else {
        var ins = await window.MITTELY.supabase.from('wishlist').insert({ email: email, product_id: productId });
        if (ins && ins.error) throw ins.error;
        if (btnEl) { btnEl.classList.add('active', 'pop'); setTimeout(function () { btnEl.classList.remove('pop'); }, 450); }
        toast('Saved to wishlist', 'success');
      }
    } catch (e) {
      toast('Wishlist update failed', 'error');
    }
  }

  async function markWishlisted(container) {
    if (!container || !window.MITTELY.supabase) return;
    var session = await window.MITTELY.auth.getSession();
    if (!session || !session.user) return;
    try {
      var res = await window.MITTELY.supabase
        .from('wishlist').select('product_id').eq('email', session.user.email);
      var ids = {};
      ((res && res.data) || []).forEach(function (r) { ids[r.product_id] = true; });
      container.querySelectorAll('.product-card').forEach(function (card) {
        var pid = card.getAttribute('data-product-id');
        if (ids[pid]) {
          var h = card.querySelector('.card-heart');
          if (h) h.classList.add('active');
        }
      });
    } catch (e) { /* silent */ }
  }

  function bindWishlistDelegation(container) {
    if (!container || container.dataset.wishBound === '1') return;
    container.dataset.wishBound = '1';
    container.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-action="wishlist"]');
      if (!btn) return;
      e.preventDefault();
      var card = btn.closest('.product-card');
      var pid = card ? card.getAttribute('data-product-id') : null;
      if (pid) toggleWishlist(pid, btn);
    });
  }

  /* ---------- Featured (homepage) ---------- */

  async function loadFeatured() {
    var grid = document.getElementById('featuredGrid');
    if (!grid || !window.MITTELY.supabase) return;
    grid.innerHTML = skeletonGrid(3);
    try {
      var res = await window.MITTELY.supabase
        .from('products')
        .select('*')
        .eq('is_published', true)
        .eq('is_featured', true)
        .order('created_at', { ascending: false })
        .limit(6);
      var data = (res && res.data) || [];
      if (!data.length) {
        var fb = await window.MITTELY.supabase.from('products').select('*')
          .eq('is_published', true).order('created_at', { ascending: false }).limit(3);
        data = (fb && fb.data) || [];
      }
      if (!data.length) {
        grid.innerHTML = '<div class="empty-state"><i class="fa-solid fa-box-open"></i><h3>No products yet</h3><p>Check back soon.</p></div>';
        return;
      }
      grid.innerHTML = data.map(function (p) { return productCardHtml(p); }).join('');
      bindWishlistDelegation(grid);
      markWishlisted(grid);
    } catch (e) {
      grid.innerHTML = '<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><h3>Failed to load</h3></div>';
    }
  }

  /* ---------- Hot Sale / BF strips (homepage) ---------- */

  async function loadHotSale() {
    var section = document.getElementById('hotSaleSection');
    if (!section || !window.MITTELY.supabase) return;
    try {
      var res = await window.MITTELY.supabase
        .from('products').select('id, slug, title, price, sale_price, image_url')
        .eq('is_published', true).eq('is_hot_sale', true).limit(6);
      /* Section visibility handled by main.initCountdown; nothing to render here beyond existence */
      return (res && res.data) || [];
    } catch (e) { return []; }
  }

  async function loadBlackFriday() {
    var section = document.getElementById('bfSection');
    if (!section || !window.MITTELY.supabase) return;
    /* Visibility handled in main.initBFBanner */
    return true;
  }

  /* ---------- Store ---------- */

  function buildStoreQuery() {
    if (!window.MITTELY.supabase) return null;
    var q = window.MITTELY.supabase
      .from('products')
      .select('*', { count: 'exact' })
      .eq('is_published', true);

    if (storeState.search) q = q.ilike('title', '%' + storeState.search + '%');
    if (storeState.category) q = q.eq('category', storeState.category);
    if (storeState.chip === 'hot-sale') q = q.eq('is_hot_sale', true);
    if (storeState.chip === 'black-friday') q = q.eq('is_black_friday', true);
    if (storeState.chip === 'free') q = q.eq('is_free', true);

    if (storeState.price) {
      var parts = storeState.price.split('-');
      var lo = parseFloat(parts[0]) || 0;
      var hi = parseFloat(parts[1]) || 999999;
      q = q.gte('price', lo).lte('price', hi);
    }

    switch (storeState.sort) {
      case 'price-asc': q = q.order('price', { ascending: true }); break;
      case 'price-desc': q = q.order('price', { ascending: false }); break;
      case 'rating': q = q.order('rating', { ascending: false }); break;
      case 'bestselling': q = q.order('sales_count', { ascending: false }); break;
      default: q = q.order('created_at', { ascending: false });
    }

    var from = (storeState.page - 1) * PAGE_SIZE;
    q = q.range(from, from + PAGE_SIZE - 1);
    return q;
  }

  async function renderStore() {
    var grid = document.getElementById('storeGrid');
    var emptyEl = document.getElementById('storeEmpty');
    var pag = document.getElementById('storePagination');
    if (!grid) return;
    grid.innerHTML = skeletonGrid(6);
    if (emptyEl) emptyEl.style.display = 'none';

    try {
      var q = buildStoreQuery();
      if (!q) throw new Error('Service unavailable');
      var res = await q;
      var data = (res && res.data) || [];
      var count = (res && res.count) || 0;
      storeState.total = count;

      if (!data.length) {
        grid.innerHTML = '';
        if (emptyEl) emptyEl.style.display = 'flex';
        if (pag) pag.innerHTML = '';
        return;
      }
      grid.innerHTML = data.map(function (p) { return productCardHtml(p); }).join('');
      bindWishlistDelegation(grid);
      markWishlisted(grid);
      renderStorePagination(count);
      injectStoreJsonLd(data);
    } catch (e) {
      grid.innerHTML = '';
      if (emptyEl) emptyEl.style.display = 'flex';
    }
  }

  function renderStorePagination(total) {
    var pag = document.getElementById('storePagination');
    if (!pag) return;
    var pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (pages <= 1) { pag.innerHTML = ''; return; }
    var html = '';
    html += '<button class="chip" data-page="' + (storeState.page - 1) + '"' + (storeState.page <= 1 ? ' disabled' : '') + '><i class="fa-solid fa-chevron-left"></i></button>';
    for (var i = 1; i <= pages; i++) {
      html += '<button class="chip' + (i === storeState.page ? ' active' : '') + '" data-page="' + i + '">' + i + '</button>';
    }
    html += '<button class="chip" data-page="' + (storeState.page + 1) + '"' + (storeState.page >= pages ? ' disabled' : '') + '><i class="fa-solid fa-chevron-right"></i></button>';
    pag.innerHTML = html;
  }

  function bindStorePagination() {
    var pag = document.getElementById('storePagination');
    if (!pag || pag.dataset.bound === '1') return;
    pag.dataset.bound = '1';
    pag.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-page]');
      if (!btn || btn.disabled) return;
      var p = parseInt(btn.getAttribute('data-page'), 10);
      if (!p || p === storeState.page) return;
      storeState.page = p;
      renderStore();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  function injectStoreJsonLd(items) {
    var script = document.getElementById('storeItemListJsonLd');
    if (!script) return;
    script.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      itemListElement: items.map(function (p, i) {
        return {
          '@type': 'ListItem',
          position: i + 1,
          url: 'https://mittely.com/product.html?slug=' + encodeURIComponent(p.slug || ''),
          name: p.title
        };
      })
    });
  }

  async function initStore() {
    var search = document.getElementById('storeSearch');
    var category = document.getElementById('filterCategory');
    var price = document.getElementById('filterPrice');
    var sort = document.getElementById('sortBy');
    var chipsWrap = document.getElementById('storeChips');
    var clearBtn = document.getElementById('clearFiltersBtn');

    var urlQ = new URL(location.href).searchParams.get('q');
    if (urlQ) { storeState.search = urlQ; if (search) search.value = urlQ; }

    var debouncedSearch = window.MITTELY.main.debounce(function () {
      storeState.search = search.value.trim();
      storeState.page = 1;
      renderStore();
    }, 250);

    if (search) search.addEventListener('input', debouncedSearch);
    if (category) category.addEventListener('change', function () {
      storeState.category = category.value;
      storeState.page = 1;
      renderStore();
    });
    if (price) price.addEventListener('change', function () {
      storeState.price = price.value;
      storeState.page = 1;
      renderStore();
    });
    if (sort) sort.addEventListener('change', function () {
      storeState.sort = sort.value;
      storeState.page = 1;
      renderStore();
    });
    if (chipsWrap) {
      chipsWrap.addEventListener('click', function (e) {
        var chip = e.target.closest('.chip');
        if (!chip) return;
        chipsWrap.querySelectorAll('.chip').forEach(function (c) { c.classList.remove('active'); });
        chip.classList.add('active');
        storeState.chip = chip.getAttribute('data-chip') || 'all';
        storeState.page = 1;
        renderStore();
      });
    }
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        storeState = { page: 1, search: '', category: '', price: '', sort: 'newest', chip: 'all', total: 0 };
        if (search) search.value = '';
        if (category) category.value = '';
        if (price) price.value = '';
        if (sort) sort.value = 'newest';
        if (chipsWrap) chipsWrap.querySelectorAll('.chip').forEach(function (c, i) { c.classList.toggle('active', i === 0); });
        renderStore();
      });
    }

    bindStorePagination();
    await renderStore();
  }

  /* ---------- Freebies ---------- */

  async function initFreebies() {
    var grid = document.getElementById('freebiesGrid');
    var emptyEl = document.getElementById('freebiesEmpty');
    var search = document.getElementById('freebiesSearch');
    var category = document.getElementById('freebiesCategory');
    if (!grid) return;

    async function load() {
      grid.innerHTML = skeletonGrid(3);
      if (emptyEl) emptyEl.style.display = 'none';
      try {
        var q = window.MITTELY.supabase
          .from('products').select('*')
          .eq('is_published', true).eq('is_free', true);
        if (search && search.value.trim()) q = q.ilike('title', '%' + search.value.trim() + '%');
        if (category && category.value) q = q.eq('category', category.value);
        q = q.order('created_at', { ascending: false }).limit(24);
        var res = await q;
        var data = (res && res.data) || [];
        if (!data.length) {
          grid.innerHTML = '';
          if (emptyEl) emptyEl.style.display = 'flex';
          return;
        }
        grid.innerHTML = data.map(function (p) {
          return productCardHtml(Object.assign({}, p, { price: 0, is_free: true }));
        }).join('');
        bindWishlistDelegation(grid);
        markWishlisted(grid);
      } catch (e) {
        grid.innerHTML = '';
        if (emptyEl) emptyEl.style.display = 'flex';
      }
    }

    var debounced = window.MITTELY.main.debounce(load, 250);
    if (search) search.addEventListener('input', debounced);
    if (category) category.addEventListener('change', load);
    await load();
  }

  /* ---------- Product detail page ---------- */

  async function loadLicenses() {
    if (licensesCache) return licensesCache;
    try {
      var res = await window.MITTELY.supabase.from('licenses').select('*').order('price_multiplier', { ascending: true });
      licensesCache = (res && res.data) || [];
    } catch (e) {
      licensesCache = [
        { id: 'std', name: 'Standard', price_multiplier: 1.0, terms: 'Use in one end product, personal or commercial.' },
        { id: 'ext', name: 'Extended', price_multiplier: 3.0, terms: 'Use in one end product sold to one client.' }
      ];
    }
    if (!licensesCache.length) {
      licensesCache = [
        { id: 'std', name: 'Standard', price_multiplier: 1.0, terms: 'Use in one end product, personal or commercial.' },
        { id: 'ext', name: 'Extended', price_multiplier: 3.0, terms: 'Use in one end product sold to one client.' }
      ];
    }
    return licensesCache;
  }

  function getMultiplier(name) {
    if (!licensesCache) return name === 'extended' ? 3 : 1;
    var match = licensesCache.find(function (l) { return l.name.toLowerCase() === (name || 'standard').toLowerCase(); });
    return match ? Number(match.price_multiplier) || 1 : 1;
  }

  function licenseKeyFromName(name) {
    return name === 'Extended' ? 'extended' : 'standard';
  }

  function renderLicenseOptions(product) {
    var wrap = document.getElementById('licenseOptions');
    var terms = document.getElementById('licenseTerms');
    if (!wrap) return;
    var html = '';
    (licensesCache || []).forEach(function (l) {
      var key = licenseKeyFromName(l.name);
      var base = effectivePrice(product);
      var price = base * (Number(l.price_multiplier) || 1);
      html += '<button class="license-opt' + (key === currentLicense ? ' active' : '') + '" data-license="' + esc(key) + '" data-price="' + price.toFixed(2) + '">' +
        esc(l.name) + ' · <span data-price-usd="' + price.toFixed(2) + '">' + money(price) + '</span>' +
        '</button>';
    });
    wrap.innerHTML = html;
    var active = (licensesCache || []).find(function (l) { return licenseKeyFromName(l.name) === currentLicense; });
    if (active && terms) terms.textContent = active.terms || '';
  }

  function renderProductGallery(product) {
    var mainImg = document.getElementById('galleryMainImg');
    var thumbs = document.getElementById('galleryThumbs');
    if (!mainImg || !thumbs) return;
    var images = [];
    if (product.image_url) images.push(product.image_url);
    if (Array.isArray(product.gallery)) {
      product.gallery.forEach(function (g) { if (g && images.indexOf(g) === -1) images.push(g); });
    }
    if (!images.length) images.push('');
    mainImg.src = images[0];
    mainImg.alt = product.title || '';
    thumbs.innerHTML = images.map(function (src, i) {
      return '<div class="gallery-thumb' + (i === 0 ? ' active' : '') + '" data-index="' + i + '"><img src="' + esc(src) + '" alt="" loading="lazy"></div>';
    }).join('');
    thumbs.addEventListener('click', function (e) {
      var t = e.target.closest('.gallery-thumb');
      if (!t) return;
      var idx = parseInt(t.getAttribute('data-index'), 10);
      if (!isFinite(idx)) return;
      thumbs.querySelectorAll('.gallery-thumb').forEach(function (x) { x.classList.remove('active'); });
      t.classList.add('active');
      mainImg.src = images[idx];
    });
  }

  function renderProductBadges(product) {
    var wrap = document.getElementById('productBadges');
    if (!wrap) return;
    var html = '';
    if (product.is_black_friday) html += '<span class="card-badge bf"><i class="fa-solid fa-heart"></i> Black Friday</span>';
    if (product.is_hot_sale) html += '<span class="card-badge sale"><i class="fa-solid fa-star"></i> Hot Sale</span>';
    if (product.badge) html += '<span class="card-badge ' + (product.badge === 'NEW' ? 'new' : '') + '">' + esc(product.badge) + '</span>';
    if (product.is_free) html += '<span class="card-badge new">Free</span>';
    wrap.innerHTML = html;
  }

  function renderProductPrice(product) {
    var priceEl = document.getElementById('productPrice');
    var oldEl = document.getElementById('productPriceOld');
    var saveEl = document.getElementById('productSaveBadge');
    var base = effectivePrice(product);
    var mult = getMultiplier(currentLicense === 'extended' ? 'Extended' : 'Standard');
    var finalPrice = base * mult;
    var originalPrice = Number(product.price) * mult;

    if (priceEl) {
      priceEl.setAttribute('data-price-usd', finalPrice.toFixed(2));
      priceEl.textContent = product.is_free ? 'Free' : money(finalPrice);
    }
    if (oldEl) {
      if (product.sale_price && Number(product.sale_price) > 0 && Number(product.sale_price) < Number(product.price)) {
        oldEl.style.display = 'inline';
        oldEl.setAttribute('data-price-usd', originalPrice.toFixed(2));
        oldEl.textContent = money(originalPrice);
      } else {
        oldEl.style.display = 'none';
      }
    }
    if (saveEl) {
      if (product.sale_price && Number(product.sale_price) > 0 && Number(product.sale_price) < Number(product.price)) {
        var pct = Math.round((1 - Number(product.sale_price) / Number(product.price)) * 100);
        saveEl.style.display = 'inline-block';
        saveEl.textContent = 'Save ' + pct + '%';
      } else {
        saveEl.style.display = 'none';
      }
    }
  }

  function renderProductTabs(product) {
    var included = document.getElementById('includedList');
    if (included) {
      var items = Array.isArray(product.whats_included) ? product.whats_included : [];
      if (!items.length) included.innerHTML = '<li>Full source files as described</li>';
      else included.innerHTML = items.map(function (i) { return '<li>' + esc(i) + '</li>'; }).join('');
    }
    var longDesc = document.getElementById('longDesc');
    if (longDesc) longDesc.textContent = product.long_desc || product.short_desc || '';
    var changelog = document.getElementById('changelogContent');
    if (changelog) changelog.textContent = product.changelog || ('v' + (product.version || '1.0') + ' — Initial release.');
  }

  function renderProductMeta(product) {
    var meta = document.getElementById('productMeta');
    if (!meta) return;
    var rows = [];
    if (product.category) rows.push('<span><i class="fa-solid fa-tag"></i> Category: ' + esc(product.category) + '</span>');
    if (product.tech) rows.push('<span><i class="fa-solid fa-code"></i> Tech: ' + esc(product.tech) + '</span>');
    if (product.version) rows.push('<span><i class="fa-solid fa-code-branch"></i> Version: ' + esc(product.version) + '</span>');
    if (product.sales_count != null) rows.push('<span><i class="fa-solid fa-chart-line"></i> ' + esc(product.sales_count) + ' sales</span>');
    if (product.download_count != null) rows.push('<span><i class="fa-solid fa-download"></i> ' + esc(product.download_count) + ' downloads</span>');
    meta.innerHTML = rows.join('');
  }

  function renderProductEmbed(product) {
    var section = document.getElementById('productEmbedSection');
    var iframe = document.getElementById('previewEmbed');
    var external = document.getElementById('demoExternalLink');
    if (!product.preview_embed_url && !product.demo_url) { if (section) section.style.display = 'none'; return; }
    if (section) section.style.display = 'block';
    if (iframe && product.preview_embed_url) iframe.src = product.preview_embed_url;
    if (external && product.demo_url) external.href = product.demo_url;
  }

  function injectProductJsonLd(product) {
    var script = document.getElementById('productJsonLd');
    if (script && product) {
      var price = effectivePrice(product);
      var data = {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: product.title,
        description: product.short_desc || product.long_desc || '',
        image: product.image_url || '',
        offers: {
          '@type': 'Offer',
          priceCurrency: 'USD',
          price: price.toFixed(2),
          availability: 'https://schema.org/InStock',
          url: 'https://mittely.com/product.html?slug=' + encodeURIComponent(product.slug || '')
        }
      };
      if (Number(product.rating) > 0 && Number(product.reviews_count) > 0) {
        data.aggregateRating = {
          '@type': 'AggregateRating',
          ratingValue: Number(product.rating).toFixed(1),
          reviewCount: Number(product.reviews_count)
        };
      }
      script.textContent = JSON.stringify(data);
    }
    var bc = document.getElementById('productBreadcrumbJsonLd');
    if (bc && product) {
      bc.textContent = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://mittely.com/' },
          { '@type': 'ListItem', position: 2, name: 'Store', item: 'https://mittely.com/store.html' },
          { '@type': 'ListItem', position: 3, name: product.title, item: 'https://mittely.com/product.html?slug=' + encodeURIComponent(product.slug || '') }
        ]
      });
    }
  }

  async function loadRelated(product) {
    var grid = document.getElementById('relatedGrid');
    var section = document.getElementById('relatedSection');
    if (!grid || !product || !window.MITTELY.supabase) return;
    try {
      var res = await window.MITTELY.supabase
        .from('products').select('*')
        .eq('is_published', true)
        .eq('category', product.category)
        .neq('id', product.id)
        .limit(3);
      var data = (res && res.data) || [];
      if (!data.length) { if (section) section.style.display = 'none'; return; }
      if (section) section.style.display = 'block';
      grid.innerHTML = data.map(function (p) { return productCardHtml(p); }).join('');
      bindWishlistDelegation(grid);
      markWishlisted(grid);
    } catch (e) { if (section) section.style.display = 'none'; }
  }

  function renderRecentlyViewed(exceptId) {
    var grid = document.getElementById('recentlyViewedGrid');
    var section = document.getElementById('recentlyViewedSection');
    if (!grid) return;
    try {
      var raw = localStorage.getItem('mittely_recently_viewed');
      var list = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(list)) list = [];
      list = list.filter(function (p) { return p && p.id && p.id !== exceptId; });
      if (!list.length) { if (section) section.style.display = 'none'; return; }
      if (section) section.style.display = 'block';
      grid.innerHTML = list.slice(0, 3).map(function (p) { return productCardHtml(p); }).join('');
      bindWishlistDelegation(grid);
    } catch (e) { if (section) section.style.display = 'none'; }
  }

  function saveRecentlyViewed(product) {
    try {
      var raw = localStorage.getItem('mittely_recently_viewed');
      var list = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(list)) list = [];
      list = list.filter(function (p) { return p && p.id !== product.id; });
      list.unshift({
        id: product.id, slug: product.slug, title: product.title,
        price: product.price, sale_price: product.sale_price,
        image_url: product.image_url, short_desc: product.short_desc,
        rating: product.rating, reviews_count: product.reviews_count,
        category: product.category, badge: product.badge,
        is_free: product.is_free, is_hot_sale: product.is_hot_sale,
        is_black_friday: product.is_black_friday
      });
      list = list.slice(0, 8);
      localStorage.setItem('mittely_recently_viewed', JSON.stringify(list));
    } catch (e) {}
  }

  function bindProductTabs() {
    var nav = document.querySelector('.product-tabs .tab-nav');
    if (!nav || nav.dataset.bound === '1') return;
    nav.dataset.bound = '1';
    nav.addEventListener('click', function (e) {
      var btn = e.target.closest('.tab-btn');
      if (!btn) return;
      var tab = btn.getAttribute('data-tab');
      document.querySelectorAll('.product-tabs .tab-btn').forEach(function (b) { b.classList.toggle('active', b === btn); });
      document.querySelectorAll('.product-tabs .tab-panel').forEach(function (p) {
        p.classList.toggle('active', p.id === 'tab-' + tab);
      });
    });
  }

  function bindProductActions(product) {
    var addBtn = document.getElementById('addToCartBtn');
    var buyBtn = document.getElementById('buyNowBtn');
    var heartBtn = document.getElementById('wishlistToggleBtn');
    var licenseWrap = document.getElementById('licenseOptions');

    if (licenseWrap) {
      licenseWrap.addEventListener('click', function (e) {
        var opt = e.target.closest('.license-opt');
        if (!opt) return;
        currentLicense = opt.getAttribute('data-license') || 'standard';
        licenseWrap.querySelectorAll('.license-opt').forEach(function (o) { o.classList.toggle('active', o === opt); });
        var active = (licensesCache || []).find(function (l) { return licenseKeyFromName(l.name) === currentLicense; });
        var terms = document.getElementById('licenseTerms');
        if (active && terms) terms.textContent = active.terms || '';
        renderProductPrice(product);
      });
    }

    if (addBtn) {
      addBtn.addEventListener('click', async function () {
        var base = effectivePrice(product);
        var price = base * getMultiplier(currentLicense === 'extended' ? 'Extended' : 'Standard');
        window.MITTELY.cart.addItem({
          product_id: product.id,
          title: product.title,
          image_url: product.image_url,
          price: price,
          license: currentLicense,
          qty: 1
        });
        toast('Added to cart', 'success');
      });
    }

    if (buyBtn) {
      buyBtn.addEventListener('click', async function () {
        var base = effectivePrice(product);
        var price = base * getMultiplier(currentLicense === 'extended' ? 'Extended' : 'Standard');
        window.MITTELY.cart.addItem({
          product_id: product.id,
          title: product.title,
          image_url: product.image_url,
          price: price,
          license: currentLicense,
          qty: 1
        });
        location.href = 'checkout.html';
      });
    }

    if (heartBtn) {
      window.MITTELY.auth.getSession().then(function (session) {
        if (!session || !session.user) return;
        window.MITTELY.supabase
          .from('wishlist').select('id')
          .eq('email', session.user.email).eq('product_id', product.id)
          .maybeSingle().then(function (res) {
            if (res && res.data && res.data.id) heartBtn.classList.add('active');
          });
      });
      heartBtn.addEventListener('click', function () { toggleWishlist(product.id, heartBtn); });
    }
  }

  async function loadProductReviews(productId) {
    var grid = document.getElementById('productReviewsGrid');
    var emptyEl = document.getElementById('reviewsEmpty');
    if (!grid) return;
    try {
      var res = await window.MITTELY.supabase
        .from('reviews').select('*')
        .eq('product_id', productId).eq('status', 'approved')
        .order('created_at', { ascending: false }).limit(20);
      var data = (res && res.data) || [];
      if (!data.length) {
        grid.innerHTML = '';
        if (emptyEl) emptyEl.style.display = 'flex';
        return;
      }
      if (emptyEl) emptyEl.style.display = 'none';
      grid.innerHTML = data.map(reviewCardHtml).join('');
      window.MITTELY.main.initReviewReadMore();
    } catch (e) {
      grid.innerHTML = '';
      if (emptyEl) emptyEl.style.display = 'flex';
    }
  }

  function reviewCardHtml(r) {
    var stars = '';
    for (var i = 0; i < 5; i++) stars += '<i class="fa-solid fa-star' + (i < (r.rating || 0) ? '' : ' style="opacity:0.3"') + '"></i>';
    var initial = (r.name || 'U').charAt(0).toUpperCase();
    return '' +
      '<div class="review-card">' +
        '<div class="review-header">' +
          '<span class="review-avatar">' + esc(initial) + '</span>' +
          '<div><div class="review-name">' + esc(r.name) + '</div>' +
          '<div class="review-date">' + (r.created_at ? new Date(r.created_at).toLocaleDateString() : '') + '</div></div>' +
        '</div>' +
        '<div class="review-stars">' + stars + '</div>' +
        '<div class="review-body clamped">' + esc(r.comment || '') + '</div>' +
        '<button class="review-more">Read more</button>' +
      '</div>';
  }

  function bindReviewForm(product) {
    var form = document.getElementById('reviewForm');
    if (!form) return;
    var picker = document.getElementById('starPicker');
    var ratingInput = document.getElementById('reviewRating');
    if (picker && ratingInput) {
      picker.addEventListener('click', function (e) {
        var star = e.target.closest('i[data-value]');
        if (!star) return;
        var v = parseInt(star.getAttribute('data-value'), 10) || 0;
        ratingInput.value = String(v);
        picker.querySelectorAll('i').forEach(function (s) {
          s.classList.toggle('active', parseInt(s.getAttribute('data-value'), 10) <= v);
        });
      });
    }
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var session = await window.MITTELY.auth.getSession();
      if (!session || !session.user) {
        window.MITTELY.auth.openSignInModal();
        return;
      }
      var rating = parseInt(ratingInput ? ratingInput.value : '0', 10);
      var comment = document.getElementById('reviewComment');
      if (!rating || rating < 1) { toast('Pick a rating', 'error'); return; }
      if (!comment || comment.value.trim().length < 3) { toast('Write a comment', 'error'); return; }
      var btn = form.querySelector('button[type="submit"]');
      if (window.MITTELY.main) window.MITTELY.main.setLoading(btn, true);
      try {
        var payload = {
          product_id: product.id,
          name: session.user.user_metadata?.full_name || session.user.email,
          email: session.user.email,
          rating: rating,
          comment: comment.value.trim(),
          status: 'pending'
        };
        var res = await window.MITTELY.supabase.from('reviews').insert(payload);
        if (res && res.error) throw res.error;
        toast('Review submitted for approval', 'success');
        form.reset();
        if (picker) picker.querySelectorAll('i').forEach(function (s) { s.classList.remove('active'); });
        if (ratingInput) ratingInput.value = '0';
      } catch (err) {
        toast('Review failed. Try again.', 'error');
      } finally {
        if (window.MITTELY.main) window.MITTELY.main.setLoading(btn, false);
      }
    });
  }

  async function initProductPage() {
    var detailSection = document.getElementById('productDetail');
    var notFound = document.getElementById('productNotFound');
    var tabsSection = document.getElementById('productTabsSection');
    var reviewsSection = document.getElementById('reviewsSection');

    var slug = new URL(location.href).searchParams.get('slug');
    if (!slug || !window.MITTELY.supabase) {
      if (notFound) notFound.style.display = 'block';
      return;
    }
    try {
      var res = await window.MITTELY.supabase
        .from('products').select('*').eq('slug', slug).maybeSingle();
      var product = res && res.data;
      if (!product || !product.is_published) {
        if (notFound) notFound.style.display = 'block';
        document.title = 'Product not found — MITTELY';
        return;
      }
      currentProduct = product;

      /* meta */
      document.title = (product.title || 'Product') + ' — MITTELY';
      var bcCurrent = document.getElementById('breadcrumbCurrent');
      if (bcCurrent) bcCurrent.textContent = product.title || 'Product';

      if (detailSection) detailSection.style.display = 'block';
      if (tabsSection) tabsSection.style.display = 'block';
      if (reviewsSection) reviewsSection.style.display = 'block';

      renderProductGallery(product);
      renderProductBadges(product);
      var titleEl = document.getElementById('productTitle');
      if (titleEl) titleEl.textContent = product.title || '';
      var shortDesc = document.getElementById('productShortDesc');
      if (shortDesc) shortDesc.textContent = product.short_desc || '';
      var rating = document.getElementById('productRating');
      if (rating) {
        rating.innerHTML = '<i class="fa-solid fa-star"></i> ' + (Number(product.rating) || 0).toFixed(1) +
          ' · ' + (product.reviews_count || 0) + ' reviews';
      }

      await loadLicenses();
      currentLicense = 'standard';
      renderLicenseOptions(product);
      renderProductPrice(product);
      renderProductMeta(product);
      renderProductTabs(product);
      renderProductEmbed(product);
      injectProductJsonLd(product);
      bindProductTabs();
      bindProductActions(product);
      bindReviewForm(product);
      saveRecentlyViewed(product);
      renderRecentlyViewed(product.id);
      loadProductReviews(product.id);
      loadRelated(product);

      document.addEventListener('mittely:currency-changed', function () {
        renderProductPrice(product);
      });
    } catch (e) {
      if (notFound) notFound.style.display = 'block';
    }
  }

  /* ---------- Reviews page ---------- */

  async function initReviewsPage() {
    var list = document.getElementById('reviewsList');
    var emptyEl = document.getElementById('reviewsEmptyState');
    var pag = document.getElementById('reviewsPagination');
    var sort = document.getElementById('reviewSort');
    var productSelect = document.getElementById('reviewsPageProduct');
    var form = document.getElementById('reviewsPageForm');
    var picker = document.getElementById('reviewsPageStarPicker');
    var ratingInput = document.getElementById('reviewsPageRating');
    if (!list || !window.MITTELY.supabase) return;

    var page = 1;
    var PAGE = 9;

    async function load() {
      list.innerHTML = skeletonGrid(3);
      if (emptyEl) emptyEl.style.display = 'none';
      try {
        var q = window.MITTELY.supabase.from('reviews').select('*', { count: 'exact' }).eq('status', 'approved');
        var sortKey = sort ? sort.value : 'newest';
        if (sortKey === 'rating-desc') q = q.order('rating', { ascending: false });
        else if (sortKey === 'rating-asc') q = q.order('rating', { ascending: true });
        else q = q.order('created_at', { ascending: false });
        var from = (page - 1) * PAGE;
        q = q.range(from, from + PAGE - 1);
        var res = await q;
        var data = (res && res.data) || [];
        var count = (res && res.count) || 0;
        if (!data.length) {
          list.innerHTML = '';
          if (emptyEl) emptyEl.style.display = 'flex';
          if (pag) pag.innerHTML = '';
          return;
        }
        list.innerHTML = data.map(reviewCardHtml).join('');
        window.MITTELY.main.initReviewReadMore();
        renderPagination(count);
      } catch (e) {
        list.innerHTML = '';
        if (emptyEl) emptyEl.style.display = 'flex';
      }
    }

    function renderPagination(total) {
      if (!pag) return;
      var pages = Math.max(1, Math.ceil(total / PAGE));
      if (pages <= 1) { pag.innerHTML = ''; return; }
      var html = '';
      for (var i = 1; i <= pages; i++) html += '<button class="chip' + (i === page ? ' active' : '') + '" data-page="' + i + '">' + i + '</button>';
      pag.innerHTML = html;
      pag.onclick = function (e) {
        var btn = e.target.closest('[data-page]');
        if (!btn) return;
        page = parseInt(btn.getAttribute('data-page'), 10) || 1;
        load();
      };
    }

    if (sort) sort.addEventListener('change', function () { page = 1; load(); });

    /* populate product select */
    try {
      var pRes = await window.MITTELY.supabase
        .from('products').select('id, title').eq('is_published', true).order('title');
      var products = (pRes && pRes.data) || [];
      if (productSelect) {
        productSelect.innerHTML = '<option value="">Select a product...</option>' +
          products.map(function (p) { return '<option value="' + esc(p.id) + '">' + esc(p.title) + '</option>'; }).join('');
      }
    } catch (e) { /* silent */ }

    if (picker && ratingInput) {
      picker.addEventListener('click', function (e) {
        var star = e.target.closest('i[data-value]');
        if (!star) return;
        var v = parseInt(star.getAttribute('data-value'), 10) || 0;
        ratingInput.value = String(v);
        picker.querySelectorAll('i').forEach(function (s) {
          s.classList.toggle('active', parseInt(s.getAttribute('data-value'), 10) <= v);
        });
      });
    }

    if (form) {
      form.addEventListener('submit', async function (e) {
        e.preventDefault();
        var session = await window.MITTELY.auth.getSession();
        if (!session || !session.user) {
          window.MITTELY.auth.openSignInModal();
          return;
        }
        var productId = productSelect ? productSelect.value : '';
        var rating = parseInt(ratingInput ? ratingInput.value : '0', 10);
        var comment = document.getElementById('reviewsPageComment');
        if (!productId) { toast('Select a product', 'error'); return; }
        if (!rating) { toast('Pick a rating', 'error'); return; }
        if (!comment || comment.value.trim().length < 3) { toast('Write a comment', 'error'); return; }
        var btn = form.querySelector('button[type="submit"]');
        if (window.MITTELY.main) window.MITTELY.main.setLoading(btn, true);
        try {
          var res = await window.MITTELY.supabase.from('reviews').insert({
            product_id: productId,
            name: session.user.user_metadata?.full_name || session.user.email,
            email: session.user.email,
            rating: rating,
            comment: comment.value.trim(),
            status: 'pending'
          });
          if (res && res.error) throw res.error;
          toast('Review submitted for approval', 'success');
          form.reset();
          if (picker) picker.querySelectorAll('i').forEach(function (s) { s.classList.remove('active'); });
          if (ratingInput) ratingInput.value = '0';
        } catch (err) {
          toast('Review failed. Try again.', 'error');
        } finally {
          if (window.MITTELY.main) window.MITTELY.main.setLoading(btn, false);
        }
      });
    }

    /* Realtime */
    try {
      window.MITTELY.supabase.channel('mittely-reviews-page')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reviews', filter: 'status=eq.approved' }, function (payload) {
          if (payload && payload.new) {
            toast('New review just landed', 'info');
            load();
          }
        })
        .subscribe();
    } catch (e) { /* silent */ }

    await load();
  }

  /* ---------- Exports ---------- */

  window.MITTELY.products = {
    loadFeatured: loadFeatured,
    loadHotSale: loadHotSale,
    loadBlackFriday: loadBlackFriday,
    initStore: initStore,
    initFreebies: initFreebies,
    initProductPage: initProductPage,
    initReviewsPage: initReviewsPage,
    productCardHtml: productCardHtml,
    effectivePrice: effectivePrice
  };
})();