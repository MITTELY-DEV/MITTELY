/* ============================================
   MITTELY — main.js
   Shared utilities, navbar, drawer, search,
   toasts, reveal, back-to-top, FAQ, particles,
   newsletter, social footer renderer
   ============================================ */
(function () {
  'use strict';

  if (!window.MITTELY) window.MITTELY = {};

  /* ---------- Utilities ---------- */

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function debounce(fn, wait) {
    var t;
    return function () {
      var ctx = this, args = arguments;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, wait || 250);
    };
  }

  function toast(message, type) {
    type = type || 'info';
    var container = document.getElementById('toastContainer');
    if (!container) return;
    var icons = {
      success: 'fa-circle-check',
      error: 'fa-circle-exclamation',
      info: 'fa-circle-info',
      warning: 'fa-triangle-exclamation'
    };
    var icon = icons[type] || icons.info;
    var el = document.createElement('div');
    el.className = 'toast ' + type;
    el.innerHTML = '<i class="fa-solid ' + icon + '"></i><span>' + escapeHtml(message) + '</span>';
    container.appendChild(el);
    setTimeout(function () {
      el.classList.add('removing');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 280);
    }, 3200);
  }

  function formatMoney(usdAmount, currency) {
    var cfg = window.MITTELY.config || {};
    var cur = currency || (window.MITTELY.currency && window.MITTELY.currency.getCurrent
      ? window.MITTELY.currency.getCurrent()
      : 'USD');
    var n = Number(usdAmount) || 0;
    var value = n;
    if (cur === 'GHS' && window.MITTELY.currency && window.MITTELY.currency.convert) {
      value = window.MITTELY.currency.convert(n);
    }
    try {
      return new Intl.NumberFormat(cur === 'GHS' ? 'en-GH' : 'en-US', {
        style: 'currency',
        currency: cur,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(value);
    } catch (e) {
      return (cur === 'GHS' ? 'GH₵ ' : '$') + value.toFixed(2);
    }
  }

  function setLoading(btn, isLoading, label) {
    if (!btn) return;
    if (isLoading) {
      btn.classList.add('is-loading');
      btn.disabled = true;
      if (label) btn.dataset.originalLabel = btn.innerHTML, btn.innerHTML = label;
    } else {
      btn.classList.remove('is-loading');
      btn.disabled = false;
      if (btn.dataset.originalLabel) {
        btn.innerHTML = btn.dataset.originalLabel;
        delete btn.dataset.originalLabel;
      }
    }
  }

  /* ---------- Theme ---------- */

  function getTheme() {
    return document.documentElement.dataset.theme || 'light';
  }

  /* ---------- Reveal on scroll ---------- */

  function initReveal() {
    var els = document.querySelectorAll('.reveal, .reveal-stagger');
    if (!els.length) return;
    if (!('IntersectionObserver' in window)) {
      els.forEach(function (el) { el.classList.add('visible'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    els.forEach(function (el) { io.observe(el); });
  }

  /* ---------- Scroll progress + back-to-top ---------- */

  function initScrollUi() {
    var progress = document.getElementById('scrollProgress');
    var backToTop = document.getElementById('backToTop');

    function onScroll() {
      var doc = document.documentElement;
      var scrollTop = window.scrollY || doc.scrollTop || 0;
      var height = doc.scrollHeight - window.innerHeight;
      var pct = height > 0 ? (scrollTop / height) * 100 : 0;
      if (progress) progress.style.width = pct + '%';
      if (backToTop) {
        if (scrollTop > 400) backToTop.classList.add('visible');
        else backToTop.classList.remove('visible');
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    if (backToTop) {
      backToTop.addEventListener('click', function () {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }
  }

  /* ---------- Mobile drawer ---------- */

  function initDrawer() {
    var hamburger = document.getElementById('hamburgerBtn');
    var drawer = document.getElementById('navDrawer');
    var closeBtn = document.getElementById('drawerClose');
    if (!hamburger || !drawer) return;

    function open() {
      drawer.classList.add('open');
      hamburger.setAttribute('aria-expanded', 'true');
      document.body.classList.add('drawer-open');
    }
    function close() {
      drawer.classList.remove('open');
      hamburger.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('drawer-open');
    }
    hamburger.addEventListener('click', function () {
      if (drawer.classList.contains('open')) close(); else open();
    });
    if (closeBtn) closeBtn.addEventListener('click', close);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && drawer.classList.contains('open')) close();
    });
    drawer.addEventListener('click', function (e) {
      if (e.target === drawer) close();
    });
  }

  /* ---------- Search overlay (⌘K) ---------- */

  function initSearch() {
    var openBtn = document.getElementById('searchOpenBtn');
    var overlay = document.getElementById('searchOverlay');
    var input = document.getElementById('searchInput');
    var closeBtn = document.getElementById('searchClose');
    var results = document.getElementById('searchResults');
    if (!overlay) return;

    function open() {
      overlay.classList.add('open');
      setTimeout(function () { if (input) input.focus(); }, 50);
    }
    function close() {
      overlay.classList.remove('open');
      if (results) results.innerHTML = '';
      if (input) input.value = '';
    }

    if (openBtn) openBtn.addEventListener('click', open);
    if (closeBtn) closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    document.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (overlay.classList.contains('open')) close(); else open();
      }
      if (e.key === 'Escape' && overlay.classList.contains('open')) close();
    });

    if (input) {
      var runSearch = debounce(async function () {
        var q = input.value.trim();
        if (!results) return;
        if (!q) { results.innerHTML = ''; return; }
        if (!window.MITTELY.supabase) {
          results.innerHTML = '<div class="search-result-item"><span class="sr-title">Search unavailable</span></div>';
          return;
        }
        results.innerHTML = '<div class="search-result-item"><span class="sr-title">Searching…</span></div>';
        try {
          var [prodRes, blogRes] = await Promise.all([
            window.MITTELY.supabase
              .from('products')
              .select('id, title, slug, price, image_url, is_published')
              .eq('is_published', true)
              .ilike('title', '%' + q + '%')
              .limit(5),
            window.MITTELY.supabase
              .from('blog_posts')
              .select('id, title, slug, cover_image, status')
              .eq('status', 'published')
              .ilike('title', '%' + q + '%')
              .limit(3)
          ]);
          var products = (prodRes && prodRes.data) || [];
          var posts = (blogRes && blogRes.data) || [];
          if (!products.length && !posts.length) {
            results.innerHTML = '<div class="search-result-item"><span class="sr-title">No results found</span></div>';
            return;
          }
          var html = '';
          products.forEach(function (p) {
            html += '<a href="product.html?slug=' + encodeURIComponent(p.slug) + '" class="search-result-item">' +
              '<img src="' + escapeHtml(p.image_url || '') + '" alt="" loading="lazy">' +
              '<div class="sr-info"><div class="sr-title">' + escapeHtml(p.title) + '</div>' +
              '<div class="sr-meta">' + formatMoney(p.price) + '</div></div></a>';
          });
          posts.forEach(function (b) {
            html += '<a href="blog.html?slug=' + encodeURIComponent(b.slug) + '" class="search-result-item">' +
              '<img src="' + escapeHtml(b.cover_image || '') + '" alt="" loading="lazy">' +
              '<div class="sr-info"><div class="sr-title">' + escapeHtml(b.title) + '</div>' +
              '<div class="sr-meta">Blog article</div></div></a>';
          });
          results.innerHTML = html;
        } catch (err) {
          results.innerHTML = '<div class="search-result-item"><span class="sr-title">Search failed</span></div>';
        }
      }, 220);
      input.addEventListener('input', runSearch);
    }
  }

  /* ---------- Announcement bar ---------- */

  async function initAnnouncement() {
    var bar = document.getElementById('announcementBar');
    var textEl = document.getElementById('announcementText');
    if (!bar || !textEl) return;
    var dismissed = localStorage.getItem('mittely_announcement_dismissed');
    try {
      if (!window.MITTELY.supabase) return;
      var res = await window.MITTELY.supabase.from('settings').select('svalue').eq('skey', 'announcement_bar').maybeSingle();
      var text = res && res.data && res.data.svalue ? res.data.svalue : '';
      if (!text || dismissed === text) { bar.style.display = 'none'; return; }
      textEl.textContent = text;
      bar.style.display = 'block';
      var close = bar.querySelector('.announcement-close');
      if (close) {
        close.addEventListener('click', function () {
          bar.style.display = 'none';
          localStorage.setItem('mittely_announcement_dismissed', text);
        });
      }
    } catch (e) {
      bar.style.display = 'none';
    }
  }

  /* ---------- Hero stats ---------- */

  function animateCount(el, target) {
    if (!el) return;
    var start = 0;
    var dur = 900;
    var t0 = performance.now();
    function tick(now) {
      var p = Math.min((now - t0) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      var val = Math.floor(start + (target - start) * eased);
      el.textContent = val.toLocaleString();
      if (p < 1) requestAnimationFrame(tick);
      else el.textContent = Number(target).toLocaleString();
    }
    requestAnimationFrame(tick);
  }

  async function initHeroStats() {
    var wrap = document.getElementById('heroStats');
    if (!wrap || !window.MITTELY.supabase) return;
    try {
      var res = await window.MITTELY.supabase.rpc('get_site_stats');
      var data = (res && res.data) || {};
      if (Array.isArray(data) && data.length) data = data[0];
      var els = {
        products: wrap.querySelector('[data-stat="products"]'),
        orders: wrap.querySelector('[data-stat="orders"]'),
        downloads: wrap.querySelector('[data-stat="downloads"]')
      };
      animateCount(els.products, data.products_count || data.products || 0);
      animateCount(els.orders, data.orders_count || data.orders || 0);
      animateCount(els.downloads, data.downloads_count || data.downloads || 0);
    } catch (e) {
      var fallback = { products: wrap.querySelector('[data-stat="products"]'), orders: wrap.querySelector('[data-stat="orders"]'), downloads: wrap.querySelector('[data-stat="downloads"]') };
      animateCount(fallback.products, 12);
      animateCount(fallback.orders, 0);
      animateCount(fallback.downloads, 0);
    }
  }

  /* ---------- Marquee ---------- */

  function initMarquee() {
    /* CSS-driven, nothing to do here (kept for API completeness) */
  }

  /* ---------- Newsletter ---------- */

  function initNewsletter() {
    var form = document.getElementById('newsletterForm');
    if (!form) return;
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var input = document.getElementById('newsletterEmail');
      var btn = form.querySelector('button[type="submit"]');
      if (!input) return;
      var email = input.value.trim();
      if (!email || email.indexOf('@') === -1) {
        toast('Enter a valid email address', 'error');
        return;
      }
      setLoading(btn, true);
      try {
        if (!window.MITTELY.supabase) throw new Error('Service unavailable');
        var res = await window.MITTELY.supabase.functions.invoke('newsletter-subscribe', {
          body: { email: email }
        });
        if (res && res.error) throw res.error;
        toast('Subscribed. Welcome to MITTELY.', 'success');
        form.reset();
      } catch (err) {
        toast('Subscription failed. Try again.', 'error');
      } finally {
        setLoading(btn, false);
      }
    });
  }

  /* ---------- Countdown (Hot Sale) ---------- */

  function initCountdown() {
    var section = document.getElementById('hotSaleSection');
    if (!section) return;
    var els = {
      days: document.getElementById('cdDays'),
      hours: document.getElementById('cdHours'),
      mins: document.getElementById('cdMins'),
      secs: document.getElementById('cdSecs')
    };
    if (!els.days) return;

    async function load() {
      try {
        if (!window.MITTELY.supabase) return;
        var res = await window.MITTELY.supabase
          .from('settings')
          .select('skey, svalue')
          .in('skey', ['hot_sale_mode', 'hot_sale_ends_at']);
        var data = (res && res.data) || [];
        var map = {};
        data.forEach(function (row) { map[row.skey] = row.svalue; });
        if (map.hot_sale_mode !== 'on' || !map.hot_sale_ends_at) {
          section.style.display = 'none';
          return;
        }
        var end = new Date(map.hot_sale_ends_at).getTime();
        if (!end || end <= Date.now()) { section.style.display = 'none'; return; }
        section.style.display = 'block';
        tick(end);
      } catch (e) {
        section.style.display = 'none';
      }
    }

    function pad(n) { return String(n).padStart(2, '0'); }
    function tick(end) {
      var diff = end - Date.now();
      if (diff <= 0) { section.style.display = 'none'; return; }
      var d = Math.floor(diff / 86400000);
      var h = Math.floor((diff % 86400000) / 3600000);
      var m = Math.floor((diff % 3600000) / 60000);
      var s = Math.floor((diff % 60000) / 1000);
      if (els.days) els.days.textContent = pad(d);
      if (els.hours) els.hours.textContent = pad(h);
      if (els.mins) els.mins.textContent = pad(m);
      if (els.secs) els.secs.textContent = pad(s);
      setTimeout(function () { tick(end); }, 1000);
    }

    load();
  }

  /* ---------- Black Friday banner + particles ---------- */

  function initBFBanner() {
    var section = document.getElementById('bfSection');
    if (!section) return;

    async function load() {
      try {
        if (!window.MITTELY.supabase) return;
        var res = await window.MITTELY.supabase
          .from('settings').select('svalue').eq('skey', 'black_friday_mode').maybeSingle();
        var mode = res && res.data ? res.data.svalue : '';
        if (mode !== 'on') { section.style.display = 'none'; return; }
        section.style.display = 'block';
        startParticles();
      } catch (e) {
        section.style.display = 'none';
      }
    }

    function startParticles() {
      var canvas = document.getElementById('bfParticles');
      if (!canvas) return;
      var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduce) return;
      var ctx = canvas.getContext('2d');
      var particles = [];
      var count = 40;
      var paused = false;

      function resize() {
        var rect = canvas.parentElement.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
      }
      resize();
      window.addEventListener('resize', debounce(resize, 200));

      for (var i = 0; i < count; i++) {
        particles.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          r: Math.random() * 1.8 + 0.6,
          vx: (Math.random() - 0.5) * 0.3,
          vy: (Math.random() - 0.5) * 0.3,
          a: Math.random() * 0.5 + 0.2
        });
      }

      function draw() {
        if (paused) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particles.forEach(function (p) {
          p.x += p.vx; p.y += p.vy;
          if (p.x < 0) p.x = canvas.width;
          if (p.x > canvas.width) p.x = 0;
          if (p.y < 0) p.y = canvas.height;
          if (p.y > canvas.height) p.y = 0;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(198,241,60,' + p.a + ')';
          ctx.fill();
        });
        requestAnimationFrame(draw);
      }
      document.addEventListener('visibilitychange', function () {
        paused = document.hidden;
        if (!paused) requestAnimationFrame(draw);
      });
      requestAnimationFrame(draw);
    }

    load();
  }

  /* ---------- FAQ accordion ---------- */

  function initFaqAccordion() {
    var items = document.querySelectorAll('.faq-item');
    if (!items.length) return;
    items.forEach(function (item) {
      var btn = item.querySelector('.faq-question');
      if (!btn) return;
      btn.addEventListener('click', function () {
        var open = item.classList.contains('open');
        item.classList.toggle('open', !open);
        btn.setAttribute('aria-expanded', String(!open));
      });
    });
  }

  /* ---------- FAQ JSON-LD ---------- */

  function injectFaqJsonLd() {
    var script = document.getElementById('faqJsonLd');
    if (!script) return;
    var items = document.querySelectorAll('.faq-item');
    if (!items.length) return;
    var mainEntity = [];
    items.forEach(function (item) {
      var q = item.querySelector('.faq-question span');
      var a = item.querySelector('.faq-answer p');
      if (q && a) {
        mainEntity.push({
          '@type': 'Question',
          name: q.textContent.trim(),
          acceptedAnswer: { '@type': 'Answer', text: a.textContent.trim() }
        });
      }
    });
    script.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: mainEntity
    });
  }

  /* ---------- Social footer ---------- */

  async function renderSocialFooter() {
    var wrap = document.getElementById('footerSocial');
    if (!wrap || !window.MITTELY.supabase) return;
    try {
      var keys = ['github_url', 'x_url', 'telegram_url', 'instagram_url', 'linkedin_url', 'youtube_url', 'discord_url'];
      var res = await window.MITTELY.supabase.from('settings').select('skey, svalue').in('skey', keys);
      var data = (res && res.data) || [];
      var map = {};
      data.forEach(function (row) { map[row.skey] = row.svalue; });
      var icons = {
        github_url: 'fa-github',
        x_url: 'fa-x-twitter',
        telegram_url: 'fa-telegram',
        instagram_url: 'fa-instagram',
        linkedin_url: 'fa-linkedin',
        youtube_url: 'fa-youtube',
        discord_url: 'fa-discord'
      };
      var html = '';
      Object.keys(icons).forEach(function (k) {
        var url = map[k];
        if (url) {
          html += '<a href="' + escapeHtml(url) + '" target="_blank" rel="noopener" aria-label="' + k + '"><i class="fa-brands ' + icons[k] + '"></i></a>';
        }
      });
      wrap.innerHTML = html;
    } catch (e) { /* silent */ }
  }

  /* ---------- Sell with us social ---------- */

  async function renderSellSocial() {
    var wrap = document.getElementById('sellSocial');
    var section = document.getElementById('sellConnect');
    if (!wrap || !window.MITTELY.supabase) return;
    try {
      var res = await window.MITTELY.supabase
        .from('settings').select('skey, svalue')
        .in('skey', ['telegram_url', 'github_url', 'x_url']);
      var data = (res && res.data) || [];
      var map = {};
      data.forEach(function (row) { map[row.skey] = row.svalue; });
      var html = '';
      if (map.telegram_url) html += '<a href="' + escapeHtml(map.telegram_url) + '" target="_blank" rel="noopener"><i class="fa-brands fa-telegram"></i> Telegram</a>';
      if (map.github_url) html += '<a href="' + escapeHtml(map.github_url) + '" target="_blank" rel="noopener"><i class="fa-brands fa-github"></i> GitHub</a>';
      if (map.x_url) html += '<a href="' + escapeHtml(map.x_url) + '" target="_blank" rel="noopener"><i class="fa-brands fa-x-twitter"></i> X</a>';
      if (html) {
        wrap.innerHTML = html;
        if (section) section.style.display = 'block';
      }
    } catch (e) { /* silent */ }
  }

  /* ---------- Sell form ---------- */

  function initSellForm() {
    var form = document.getElementById('sellForm');
    if (!form) return;

    function fieldError(id, msg) {
      var el = document.getElementById(id);
      if (!el) return;
      if (msg) { el.textContent = msg; el.style.display = 'block'; }
      else { el.textContent = ''; el.style.display = 'none'; }
    }

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var btn = document.getElementById('sellSubmitBtn');
      var name = document.getElementById('sellName');
      var email = document.getElementById('sellEmail');
      var title = document.getElementById('sellTitle');
      var category = document.getElementById('sellCategory');
      var description = document.getElementById('sellDescription');
      var demo = document.getElementById('sellDemo');
      var portfolio = document.getElementById('sellPortfolio');

      ['sellNameError','sellEmailError','sellTitleError','sellCategoryError','sellDescriptionError','sellDemoError','sellPortfolioError'].forEach(function (id) { fieldError(id, ''); });

      var ok = true;
      if (!name.value.trim()) { fieldError('sellNameError', 'Required'); ok = false; }
      if (!email.value.trim() || email.value.indexOf('@') === -1) { fieldError('sellEmailError', 'Valid email required'); ok = false; }
      if (!title.value.trim()) { fieldError('sellTitleError', 'Required'); ok = false; }
      if (!category.value) { fieldError('sellCategoryError', 'Select a category'); ok = false; }
      if (!description.value.trim() || description.value.trim().length < 20) { fieldError('sellDescriptionError', 'At least 20 characters'); ok = false; }
      if (!ok) { toast('Fix the highlighted fields', 'error'); return; }

      setLoading(btn, true);
      try {
        if (!window.MITTELY.supabase) throw new Error('Service unavailable');
        var payload = {
          designer_name: name.value.trim(),
          designer_email: email.value.trim(),
          product_title: title.value.trim(),
          category: category.value,
          description: description.value.trim(),
          demo_url: demo.value.trim() || null,
          portfolio_url: portfolio.value.trim() || null
        };
        var res = await window.MITTELY.supabase.from('submissions').insert(payload);
        if (res && res.error) throw res.error;
        form.style.display = 'none';
        var success = document.getElementById('sellSuccess');
        if (success) success.style.display = 'block';
        toast('Application received', 'success');
      } catch (err) {
        toast('Submission failed. Try again.', 'error');
      } finally {
        setLoading(btn, false);
      }
    });
  }

  /* ---------- Review read-more ---------- */

  function initReviewReadMore() {
    document.querySelectorAll('.review-more').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var body = btn.previousElementSibling;
        if (!body) return;
        var isClamped = body.classList.toggle('clamped');
        btn.textContent = isClamped ? 'Read more' : 'Show less';
      });
    });
  }

  /* ---------- Init all ---------- */

  function init() {
    initReveal();
    initScrollUi();
    initDrawer();
    initSearch();
    initFaqAccordion();
    initReviewReadMore();
    renderSocialFooter();
  }

  window.MITTELY.main = {
    escapeHtml: escapeHtml,
    debounce: debounce,
    toast: toast,
    formatMoney: formatMoney,
    setLoading: setLoading,
    getTheme: getTheme,
    initReveal: initReveal,
    initAnnouncement: initAnnouncement,
    initHeroStats: initHeroStats,
    initMarquee: initMarquee,
    initNewsletter: initNewsletter,
    initCountdown: initCountdown,
    initBFBanner: initBFBanner,
    initFaqAccordion: initFaqAccordion,
    injectFaqJsonLd: injectFaqJsonLd,
    renderSocialFooter: renderSocialFooter,
    renderSellSocial: renderSellSocial,
    initSellForm: initSellForm,
    initReviewReadMore: initReviewReadMore
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();