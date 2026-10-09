/* MITTELY — main.js
   Shared utilities: escapeHtml, toast, formatMoney, debounce, reveal,
   back-to-top, scroll progress, Cmd-K search overlay, social footer,
   BF particle engine, mobile drawer, announcement bar, review read-more. */
(function () {
  'use strict';

  /* ================= Utilities ================= */

  function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function debounce(fn, wait) {
    var t;
    return function () {
      var ctx = this, args = arguments;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, wait || 200);
    };
  }

  function formatMoney(usd, currency) {
    var cur = currency || (localStorage.getItem('mittely-currency') || 'USD');
    var amount = Number(usd || 0);
    try {
      if (cur === 'GHS') {
        var rate = (window.mittelyCurrency && window.mittelyCurrency.rate) || 15.5;
        return new Intl.NumberFormat('en-GH', {
          style: 'currency', currency: 'GHS',
          minimumFractionDigits: 2, maximumFractionDigits: 2
        }).format(amount * rate).replace('GH₵', 'GH₵ ');
      }
      return new Intl.NumberFormat('en-US', {
        style: 'currency', currency: 'USD',
        minimumFractionDigits: 2, maximumFractionDigits: 2
      }).format(amount);
    } catch (e) {
      return (cur === 'GHS' ? 'GH₵ ' : '$') + amount.toFixed(2);
    }
  }

  function toast(message, kind) {
    var container = document.getElementById('toastContainer');
    if (!container) return;
    var el = document.createElement('div');
    el.className = 'toast' + (kind ? ' is-' + kind : '');
    var icon = kind === 'error' ? 'fa-circle-exclamation'
      : kind === 'success' ? 'fa-circle-check'
      : 'fa-bell';
    el.innerHTML = '<i class="fa-solid ' + icon + '" aria-hidden="true"></i><span>' + escapeHtml(message) + '</span>';
    container.appendChild(el);
    setTimeout(function () {
      el.classList.add('is-out');
      setTimeout(function () { el.remove(); }, 400);
    }, 3600);
  }

  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function onReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else { fn(); }
  }

  /* ================= Reveal on scroll ================= */

  function initReveal() {
    var els = qsa('.reveal');
    if (!els.length) return;
    if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      els.forEach(function (el) { el.classList.add('is-in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry, i) {
        if (entry.isIntersecting) {
          var el = entry.target;
          var delay = Math.min(i * 60, 240);
          setTimeout(function () { el.classList.add('is-in'); }, delay);
          io.unobserve(el);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    els.forEach(function (el) { io.observe(el); });
  }

  /* ================= Back to top + scroll progress ================= */

  function initScrollUi() {
    var backBtn = document.getElementById('backToTop');
    var progress = document.getElementById('scrollProgress');
    function update() {
      var y = window.scrollY || document.documentElement.scrollTop;
      var max = Math.max(1, (document.documentElement.scrollHeight - window.innerHeight));
      var ratio = Math.min(1, Math.max(0, y / max));
      if (progress) progress.style.transform = 'scaleX(' + ratio + ')';
      if (backBtn) {
        if (y > 480) backBtn.classList.add('is-visible');
        else backBtn.classList.remove('is-visible');
      }
    }
    window.addEventListener('scroll', update, { passive: true });
    update();
    if (backBtn) {
      backBtn.addEventListener('click', function () {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }
  }

  /* ================= Mobile drawer ================= */

  function initMobileDrawer() {
    var btn = document.getElementById('hamburger');
    var drawer = document.getElementById('mobileDrawer');
    if (!btn || !drawer) return;
    function toggle(open) {
      var shouldOpen = typeof open === 'boolean' ? open : !drawer.classList.contains('is-open');
      drawer.classList.toggle('is-open', shouldOpen);
      btn.setAttribute('aria-expanded', String(shouldOpen));
      document.body.style.overflow = shouldOpen ? 'hidden' : '';
    }
    btn.addEventListener('click', function () { toggle(); });
    drawer.addEventListener('click', function (e) {
      if (e.target === drawer) toggle(false);
    });
    qsa('.mobile-drawer-inner a', drawer).forEach(function (a) {
      a.addEventListener('click', function () { toggle(false); });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') toggle(false);
    });
  }

  /* ================= Announcement bar ================= */

  function initAnnouncement(settings) {
    var bar = document.getElementById('announcementBar');
    var text = document.getElementById('announcementText');
    var close = document.getElementById('announcementClose');
    if (!bar || !text) return;
    var dismissed = sessionStorage.getItem('mittely_announcement_dismissed') === '1';
    var value = settings && settings.announcement_bar ? String(settings.announcement_bar) : '';
    if (!value || dismissed) { bar.hidden = true; return; }
    text.textContent = value;
    bar.hidden = false;
    if (close) {
      close.addEventListener('click', function () {
        sessionStorage.setItem('mittely_announcement_dismissed', '1');
        bar.hidden = true;
      });
    }
  }

  /* ================= Social footer ================= */

  var SOCIAL_MAP = [
    { key: 'github_url', icon: 'fa-brands fa-github', label: 'GitHub' },
    { key: 'x_url', icon: 'fa-brands fa-x-twitter', label: 'X (Twitter)' },
    { key: 'telegram_url', icon: 'fa-brands fa-telegram', label: 'Telegram' },
    { key: 'instagram_url', icon: 'fa-brands fa-instagram', label: 'Instagram' },
    { key: 'linkedin_url', icon: 'fa-brands fa-linkedin', label: 'LinkedIn' },
    { key: 'youtube_url', icon: 'fa-brands fa-youtube', label: 'YouTube' },
    { key: 'discord_url', icon: 'fa-brands fa-discord', label: 'Discord' }
  ];

  function renderSocial(target, settings) {
    if (!target) return;
    var html = '';
    SOCIAL_MAP.forEach(function (s) {
      var url = settings && settings[s.key];
      if (!url) return;
      html += '<a href="' + escapeHtml(url) + '" target="_blank" rel="noopener" aria-label="' + escapeHtml(s.label) + '">' +
        '<i class="' + s.icon + '" aria-hidden="true"></i>' +
        '<span class="sr-only">' + escapeHtml(s.label) + ' (opens in new tab)</span>' +
        '</a>';
    });
    target.innerHTML = html;
  }

  function applySocialSettings(settings) {
    renderSocial(document.getElementById('footerSocial'), settings);
    renderSocial(document.getElementById('sellContactSocial'), settings);
  }

  /* ================= Fetch settings (shared) ================= */

  var settingsCache = null;

  function getSettings() {
    if (settingsCache) return Promise.resolve(settingsCache);
    var sb = window.mittely && window.mittely.sb && window.mittely.sb();
    if (!sb) return Promise.resolve({});
    return sb.from('settings').select('skey,svalue').then(function (res) {
      if (res.error || !res.data) return {};
      var map = {};
      res.data.forEach(function (row) { map[row.skey] = row.svalue; });
      settingsCache = map;
      return map;
    }).catch(function () { return {}; });
  }

  /* ================= Cmd-K search overlay ================= */

  var searchCache = { products: [], posts: [] };

  function openSearch() {
    var overlay = document.getElementById('searchOverlay');
    var input = document.getElementById('searchInput');
    if (!overlay) return;
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    setTimeout(function () { input && input.focus(); }, 60);
    loadSearchData();
  }
  function closeSearch() {
    var overlay = document.getElementById('searchOverlay');
    if (!overlay) return;
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  function loadSearchData() {
    var sb = window.mittely && window.mittely.sb && window.mittely.sb();
    if (!sb) return;
    if (!searchCache.products.length) {
      sb.from('products')
        .select('id,title,slug,image_url,category,price,is_free')
        .eq('is_published', true)
        .limit(60)
        .then(function (res) { if (res.data) searchCache.products = res.data; });
    }
    if (!searchCache.posts.length) {
      sb.from('blog_posts')
        .select('id,title,slug,cover_image,excerpt')
        .eq('status', 'published')
        .limit(40)
        .then(function (res) { if (res.data) searchCache.posts = res.data; });
    }
  }

  function runSearch(q) {
    var results = document.getElementById('searchResults');
    if (!results) return;
    var query = String(q || '').trim().toLowerCase();
    if (!query) { results.innerHTML = ''; return; }
    var products = searchCache.products.filter(function (p) {
      return (p.title || '').toLowerCase().indexOf(query) !== -1 ||
        (p.category || '').toLowerCase().indexOf(query) !== -1;
    }).slice(0, 6);
    var posts = searchCache.posts.filter(function (p) {
      return (p.title || '').toLowerCase().indexOf(query) !== -1 ||
        (p.excerpt || '').toLowerCase().indexOf(query) !== -1;
    }).slice(0, 4);

    var html = '';
    products.forEach(function (p) {
      var price = p.is_free ? 'Free' : formatMoney(p.price);
      html += '<a class="search-result" href="product.html?slug=' + encodeURIComponent(p.slug) + '">' +
        (p.image_url ? '<img src="' + escapeHtml(p.image_url) + '" alt="" loading="lazy" decoding="async">' : '<span class="search-result-icon"><i class="fa-solid fa-box" aria-hidden="true"></i></span>') +
        '<div class="search-result-info"><div class="search-result-title">' + escapeHtml(p.title) + '</div>' +
        '<div class="search-result-meta">' + escapeHtml(p.category || '') + ' · ' + escapeHtml(price) + '</div></div></a>';
    });
    posts.forEach(function (p) {
      html += '<a class="search-result" href="blog.html?slug=' + encodeURIComponent(p.slug) + '">' +
        (p.cover_image ? '<img src="' + escapeHtml(p.cover_image) + '" alt="" loading="lazy" decoding="async">' : '<span class="search-result-icon"><i class="fa-solid fa-newspaper" aria-hidden="true"></i></span>') +
        '<div class="search-result-info"><div class="search-result-title">' + escapeHtml(p.title) + '</div>' +
        '<div class="search-result-meta">Article</div></div></a>';
    });
    if (!html) html = '<div class="search-empty"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><p>No matches for &ldquo;' + escapeHtml(query) + '&rdquo;</p></div>';
    results.innerHTML = html;
  }

  function initSearchOverlay() {
    var openBtn = document.getElementById('searchToggle');
    var overlay = document.getElementById('searchOverlay');
    var closeBtn = document.getElementById('searchClose');
    var input = document.getElementById('searchInput');
    if (openBtn) openBtn.addEventListener('click', openSearch);
    if (closeBtn) closeBtn.addEventListener('click', closeSearch);
    if (overlay) overlay.addEventListener('click', function (e) { if (e.target === overlay) closeSearch(); });
    if (input) input.addEventListener('input', debounce(function () { runSearch(input.value); }, 140));
    document.addEventListener('keydown', function (e) {
      var metaK = (e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K');
      if (metaK) { e.preventDefault(); openSearch(); }
      if (e.key === 'Escape' && overlay && overlay.classList.contains('is-open')) closeSearch();
    });
  }

  /* ================= Review read-more (mobile clamp) ================= */

  function initReviewClamps(root) {
    var scope = root || document;
    qsa('.review-card', scope).forEach(function (card) {
      if (card.dataset.clampBound === '1') return;
      card.dataset.clampBound = '1';
      var comment = qs('.review-comment', card);
      if (!comment) return;
      var isNarrow = window.matchMedia('(max-width: 640px)').matches;
      if (!isNarrow) return;
      card.classList.add('is-clamped');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'read-more-btn';
      btn.textContent = 'Read more';
      btn.addEventListener('click', function () {
        var expanded = card.classList.toggle('is-expanded');
        card.classList.toggle('is-clamped', !expanded);
        btn.textContent = expanded ? 'Show less' : 'Read more';
      });
      comment.insertAdjacentElement('afterend', btn);
    });
  }

  /* ================= Black Friday particles ================= */

  function initBFParticles(canvas) {
    if (!canvas) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    var particles = [];
    var w = 0, h = 0;
    var rafId = null;
    var running = true;

    function resize() {
      var rect = canvas.getBoundingClientRect();
      w = canvas.width = Math.max(1, Math.floor(rect.width * window.devicePixelRatio));
      h = canvas.height = Math.max(1, Math.floor(rect.height * window.devicePixelRatio));
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';
    }
    function seed() {
      particles = [];
      var count = 40;
      for (var i = 0; i < count; i++) {
        particles.push({
          x: Math.random() * w,
          y: Math.random() * h,
          r: (0.6 + Math.random() * 1.6) * window.devicePixelRatio,
          vx: (-0.15 + Math.random() * 0.3) * window.devicePixelRatio,
          vy: (-0.25 - Math.random() * 0.4) * window.devicePixelRatio,
          a: 0.3 + Math.random() * 0.5
        });
      }
    }
    function tick() {
      if (!running) return;
      ctx.clearRect(0, 0, w, h);
      for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        p.x += p.vx; p.y += p.vy;
        if (p.y < -10) { p.y = h + 10; p.x = Math.random() * w; }
        if (p.x < -10) p.x = w + 10;
        if (p.x > w + 10) p.x = -10;
        ctx.beginPath();
        ctx.fillStyle = 'rgba(198, 241, 60, ' + p.a + ')';
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      rafId = requestAnimationFrame(tick);
    }
    function start() { if (!rafId) { running = true; tick(); } }
    function stop() { running = false; if (rafId) { cancelAnimationFrame(rafId); rafId = null; } }

    resize();
    seed();
    start();
    window.addEventListener('resize', debounce(function () { resize(); seed(); }, 200));
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop();
      else { running = true; start(); }
    });
  }

  /* ================= Wishlist nav button ================= */

  function initWishlistNav() {
    var btns = [document.getElementById('wishlistNavBtn'), document.getElementById('mobileWishlist')];
    btns.forEach(function (b) {
      if (!b) return;
      b.addEventListener('click', function (e) {
        e.preventDefault();
        var email = window.mittely && window.mittely.currentEmail && window.mittely.currentEmail();
        if (!email) {
          if (window.mittelyAuth && window.mittelyAuth.openModal) window.mittelyAuth.openModal('wishlist');
          else if (window.mittelyAuth && window.mittelyAuth.openSignIn) window.mittelyAuth.openSignIn('wishlist');
          return;
        }
        window.location.href = 'dashboard.html#wishlist';
      });
    });
  }

  /* ================= Currency switcher UI ================= */

  function initCurrencySwitchers() {
    // Both navbar and footer switchers share the same behaviour.
    qsa('.currency-switcher').forEach(function (wrap) {
      var btn = qs('.currency-btn', wrap);
      if (!btn) return;
      // Build a menu if it doesn't exist yet.
      var menu = qs('.currency-menu', wrap);
      if (!menu) {
        menu = document.createElement('div');
        menu.className = 'currency-menu';
        menu.innerHTML = '<button type="button" data-cur="USD">USD — US Dollar</button>' +
          '<button type="button" data-cur="GHS">GHS — Ghana Cedi</button>';
        wrap.appendChild(menu);
      }
      function sync() {
        var cur = localStorage.getItem('mittely-currency') || 'USD';
        var label = qs('#currencyLabel', wrap) || wrap.querySelector('.currency-btn span');
        if (label) label.textContent = cur;
        qsa('button', menu).forEach(function (b) {
          b.classList.toggle('is-active', b.dataset.cur === cur);
        });
        // Sync the other switchers on the page too.
        qsa('.currency-btn span').forEach(function (s) { s.textContent = cur; });
      }
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        wrap.classList.toggle('is-open');
      });
      document.addEventListener('click', function () { wrap.classList.remove('is-open'); });
      qsa('button', menu).forEach(function (b) {
        b.addEventListener('click', function () {
          var cur = b.dataset.cur;
          localStorage.setItem('mittely-currency', cur);
          sync();
          if (window.mittelyCurrency && window.mittelyCurrency.refresh) window.mittelyCurrency.refresh();
          document.dispatchEvent(new CustomEvent('mittely:currency-changed', { detail: { currency: cur } }));
        });
      });
      sync();
    });
  }

  /* ================= Export ================= */

  window.mittelyMain = {
    escapeHtml: escapeHtml,
    toast: toast,
    formatMoney: formatMoney,
    debounce: debounce,
    qs: qs,
    qsa: qsa,
    onReady: onReady,
    getSettings: getSettings,
    applySocialSettings: applySocialSettings,
    initBFParticles: initBFParticles,
    initReviewClamps: initReviewClamps
  };

  // Also expose globally for ease of use.
  window.escapeHtml = escapeHtml;
  window.toast = toast;
  window.formatMoney = formatMoney;
  window.debounce = debounce;

  /* ================= Bootstrap ================= */

  onReady(function () {
    initReveal();
    initScrollUi();
    initMobileDrawer();
    initSearchOverlay();
    initWishlistNav();
    initCurrencySwitchers();
    initReviewClamps();

    var yearEl = document.getElementById('footerYear');
    if (yearEl) yearEl.textContent = String(new Date().getFullYear());

    // Fetch settings and apply social + announcement + BF mode.
    getSettings().then(function (settings) {
      applySocialSettings(settings);

      initAnnouncement(settings);

      // Black Friday particle engine only when enabled and canvas present.
      if (settings.black_friday_mode === 'on') {
        var canvas = document.getElementById('bfCanvas');
        if (canvas) initBFParticles(canvas);
      }
    });
  });
})();