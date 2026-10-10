/* ============================================
   MITTELY — blog.js
   Handles both blog.html modes:
   - LISTING (?slug absent): grid, tag filter,
     search, pagination, skeletons
   - ARTICLE (?slug present): cover hero,
     meta, sanitized content, share, related,
     view increment, JSON-LD Article
   ============================================ */
(function () {
  'use strict';

  if (!window.MITTELY) window.MITTELY = {};

  var PAGE_SIZE = 9;
  var esc = function (s) { return window.MITTELY.main ? window.MITTELY.main.escapeHtml(s) : String(s || ''); };
  var toast = function (m, t) { if (window.MITTELY.main) window.MITTELY.main.toast(m, t); };

  var state = {
    page: 1,
    search: '',
    tag: ''
  };

  /* ---------- Sanitize article HTML ---------- */

  function sanitizeHtml(html) {
    if (!html) return '';
    /* Strip <script> and <style>, event handlers, and javascript: URLs. */
    var out = String(html);
    out = out.replace(/<\s*script[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, '');
    out = out.replace(/<\s*style[^>]*>[\s\S]*?<\s*\/\s*style\s*>/gi, '');
    out = out.replace(/ on[a-z]+\s*=\s*"[^"]*"/gi, '');
    out = out.replace(/ on[a-z]+\s*=\s*'[^']*'/gi, '');
    out = out.replace(/javascript:/gi, '');
    return out;
  }

  function blogCardHtml(post) {
    var href = 'blog.html?slug=' + encodeURIComponent(post.slug || '');
    var cover = post.cover_image || '';
    var date = post.created_at ? new Date(post.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '';
    var excerpt = post.excerpt || '';
    return '' +
      '<article class="blog-card">' +
        '<div class="card-media">' +
          '<img src="' + esc(cover) + '" alt="' + esc(post.title) + '" loading="lazy" decoding="async">' +
          '<div class="card-scrim"></div>' +
          '<a href="' + href + '" class="card-save-pill"><i class="fa-solid fa-book-open"></i> Read article</a>' +
        '</div>' +
        '<div class="card-body">' +
          '<a href="' + href + '" class="card-title">' + esc(post.title) + '</a>' +
          '<p class="card-desc">' + esc(excerpt) + '</p>' +
          '<div class="card-meta"><span class="card-rating">' + esc(date) + '</span>' +
          '<span class="card-rating"><i class="fa-solid fa-eye"></i> ' + (post.views_count || 0) + '</span></div>' +
        '</div>' +
      '</article>';
  }

  function skeletonGrid(n) {
    var out = '';
    for (var i = 0; i < (n || 6); i++) out += '<div class="skeleton-card"></div>';
    return out;
  }

  /* ---------- LISTING MODE ---------- */

  async function renderListing() {
    var grid = document.getElementById('blogGrid');
    var emptyEl = document.getElementById('blogEmpty');
    var pag = document.getElementById('blogPagination');
    if (!grid || !window.MITTELY.supabase) return;

    grid.innerHTML = skeletonGrid(3);
    if (emptyEl) emptyEl.style.display = 'none';

    try {
      var q = window.MITTELY.supabase
        .from('blog_posts')
        .select('id, title, slug, excerpt, cover_image, tags, views_count, created_at, status', { count: 'exact' })
        .eq('status', 'published');

      if (state.search) q = q.ilike('title', '%' + state.search + '%');
      if (state.tag) q = q.ilike('tags', '%' + state.tag + '%');
      q = q.order('created_at', { ascending: false });

      var from = (state.page - 1) * PAGE_SIZE;
      q = q.range(from, from + PAGE_SIZE - 1);
      var res = await q;
      var data = (res && res.data) || [];
      var count = (res && res.count) || 0;

      if (!data.length) {
        grid.innerHTML = '';
        if (emptyEl) emptyEl.style.display = 'flex';
        if (pag) pag.innerHTML = '';
        return;
      }

      grid.innerHTML = data.map(blogCardHtml).join('');
      renderPagination(count);
      injectListingJsonLd(data);
    } catch (e) {
      grid.innerHTML = '';
      if (emptyEl) emptyEl.style.display = 'flex';
    }
  }

  function renderPagination(total) {
    var pag = document.getElementById('blogPagination');
    if (!pag) return;
    var pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (pages <= 1) { pag.innerHTML = ''; return; }
    var html = '';
    for (var i = 1; i <= pages; i++) {
      html += '<button class="chip' + (i === state.page ? ' active' : '') + '" data-page="' + i + '">' + i + '</button>';
    }
    pag.innerHTML = html;
  }

  function bindListingPagination() {
    var pag = document.getElementById('blogPagination');
    if (!pag || pag.dataset.bound === '1') return;
    pag.dataset.bound = '1';
    pag.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-page]');
      if (!btn) return;
      var p = parseInt(btn.getAttribute('data-page'), 10);
      if (!p || p === state.page) return;
      state.page = p;
      renderListing();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  async function loadTagChips() {
    var wrap = document.getElementById('blogTagFilter');
    if (!wrap || !window.MITTELY.supabase) return;
    try {
      var res = await window.MITTELY.supabase
        .from('blog_posts').select('tags').eq('status', 'published');
      var rows = (res && res.data) || [];
      var set = {};
      rows.forEach(function (r) {
        if (!r.tags) return;
        String(r.tags).split(',').forEach(function (t) {
          var v = t.trim();
          if (v) set[v.toLowerCase()] = v;
        });
      });
      var keys = Object.keys(set);
      var html = '<button class="chip active" data-tag="">All</button>';
      keys.forEach(function (k) {
        html += '<button class="chip" data-tag="' + esc(set[k]) + '">' + esc(set[k]) + '</button>';
      });
      wrap.innerHTML = html;
    } catch (e) { /* silent */ }
  }

  function injectListingJsonLd(items) {
    var script = document.getElementById('blogJsonLd');
    if (!script) return;
    script.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      itemListElement: items.map(function (p, i) {
        return {
          '@type': 'ListItem',
          position: i + 1,
          url: 'https://mittely.com/blog.html?slug=' + encodeURIComponent(p.slug || ''),
          name: p.title
        };
      })
    });
  }

  function initListing() {
    var listing = document.getElementById('blogListingMode');
    var article = document.getElementById('blogArticleMode');
    var notFound = document.getElementById('blogNotFound');
    if (listing) listing.style.display = 'block';
    if (article) article.style.display = 'none';
    if (notFound) notFound.style.display = 'none';

    var search = document.getElementById('blogSearch');
    var tagsWrap = document.getElementById('blogTagFilter');

    if (search) {
      var deb = window.MITTELY.main.debounce(function () {
        state.search = search.value.trim();
        state.page = 1;
        renderListing();
      }, 250);
      search.addEventListener('input', deb);
    }

    if (tagsWrap) {
      tagsWrap.addEventListener('click', function (e) {
        var chip = e.target.closest('.chip');
        if (!chip) return;
        tagsWrap.querySelectorAll('.chip').forEach(function (c) { c.classList.remove('active'); });
        chip.classList.add('active');
        state.tag = chip.getAttribute('data-tag') || '';
        state.page = 1;
        renderListing();
      });
    }

    bindListingPagination();
    loadTagChips();
    renderListing();
  }

  /* ---------- ARTICLE MODE ---------- */

  async function renderArticle(slug) {
    var listing = document.getElementById('blogListingMode');
    var article = document.getElementById('blogArticleMode');
    var notFound = document.getElementById('blogNotFound');
    if (listing) listing.style.display = 'none';

    if (!slug || !window.MITTELY.supabase) {
      if (notFound) notFound.style.display = 'block';
      return;
    }

    try {
      var res = await window.MITTELY.supabase
        .from('blog_posts').select('*').eq('slug', slug).eq('status', 'published').maybeSingle();
      var post = res && res.data;
      if (!post) {
        if (notFound) notFound.style.display = 'block';
        document.title = 'Article not found — MITTELY';
        return;
      }

      if (article) article.style.display = 'block';

      /* Title + meta */
      document.title = (post.meta_title || post.title) + ' — MITTELY';
      var descMeta = document.querySelector('meta[name="description"]');
      if (descMeta && (post.meta_description || post.excerpt)) {
        descMeta.setAttribute('content', post.meta_description || post.excerpt);
      }
      var canonical = document.querySelector('link[rel="canonical"]');
      if (canonical) canonical.href = 'https://mittely.com/blog.html?slug=' + encodeURIComponent(post.slug);
      var ogUrl = document.querySelector('meta[property="og:url"]');
      if (ogUrl) ogUrl.setAttribute('content', 'https://mittely.com/blog.html?slug=' + encodeURIComponent(post.slug));
      var ogType = document.querySelector('meta[property="og:type"]');
      if (ogType) ogType.setAttribute('content', 'article');
      var ogTitle = document.querySelector('meta[property="og:title"]');
      if (ogTitle) ogTitle.setAttribute('content', post.meta_title || post.title);
      var ogDesc = document.querySelector('meta[property="og:description"]');
      if (ogDesc) ogDesc.setAttribute('content', post.meta_description || post.excerpt || '');

      /* Hero */
      var cover = document.getElementById('articleCover');
      if (cover) {
        cover.src = post.cover_image || '';
        cover.alt = post.title || '';
      }
      var titleEl = document.getElementById('articleTitle');
      if (titleEl) titleEl.textContent = post.title || '';

      var metaEl = document.getElementById('articleMeta');
      if (metaEl) {
        var date = post.created_at ? new Date(post.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
        metaEl.innerHTML =
          '<span><i class="fa-solid fa-user"></i> ' + esc(post.author_name || 'MITTELY') + '</span>' +
          '<span><i class="fa-solid fa-calendar"></i> ' + esc(date) + '</span>' +
          '<span><i class="fa-solid fa-clock"></i> ' + Math.max(1, Math.round((post.content || '').split(/\s+/).length / 220)) + ' min read</span>' +
          '<span><i class="fa-solid fa-eye"></i> ' + (post.views_count || 0) + ' views</span>';
      }

      var contentEl = document.getElementById('articleContent');
      if (contentEl) contentEl.innerHTML = sanitizeHtml(post.content || '');

      var tagsEl = document.getElementById('articleTags');
      if (tagsEl) {
        var tags = post.tags ? String(post.tags).split(',').map(function (t) { return t.trim(); }).filter(Boolean) : [];
        tagsEl.innerHTML = tags.map(function (t) { return '<span class="chip">' + esc(t) + '</span>'; }).join('');
      }

      var bcCurrent = document.getElementById('articleBreadcrumbCurrent');
      if (bcCurrent) bcCurrent.textContent = post.title || 'Article';

      /* Share row */
      var shareUrl = encodeURIComponent('https://mittely.com/blog.html?slug=' + post.slug);
      var shareText = encodeURIComponent(post.title || '');
      var shareX = document.getElementById('shareX');
      var shareLinkedIn = document.getElementById('shareLinkedIn');
      var shareEmail = document.getElementById('shareEmail');
      var shareCopy = document.getElementById('shareCopy');
      var settingsRes = await window.MITTELY.supabase
        .from('settings').select('skey, svalue').in('skey', ['x_url', 'linkedin_url']);
      var settingsMap = {};
      ((settingsRes && settingsRes.data) || []).forEach(function (r) { settingsMap[r.skey] = r.svalue; });
      if (shareX) shareX.href = 'https://twitter.com/intent/tweet?text=' + shareText + '&url=' + shareUrl;
      if (shareLinkedIn) shareLinkedIn.href = 'https://www.linkedin.com/sharing/share-offsite/?url=' + shareUrl;
      if (shareEmail) shareEmail.href = 'mailto:?subject=' + shareText + '&body=' + shareUrl;
      if (shareCopy) {
        shareCopy.addEventListener('click', function () {
          var url = 'https://mittely.com/blog.html?slug=' + post.slug;
          if (navigator.clipboard) {
            navigator.clipboard.writeText(url).then(function () { toast('Link copied', 'success'); })
              .catch(function () { toast('Copy failed', 'error'); });
          } else {
            toast('Copy not supported', 'error');
          }
        });
      }

      /* View increment */
      try { await window.MITTELY.supabase.rpc('increment_blog_views', { post_id: post.id }); } catch (e) { /* silent */ }

      /* JSON-LD Article + Breadcrumb */
      injectArticleJsonLd(post);

      /* Related posts */
      loadRelatedPosts(post);
    } catch (e) {
      if (notFound) notFound.style.display = 'block';
    }
  }

  function injectArticleJsonLd(post) {
    var script = document.getElementById('blogJsonLd');
    if (!script) return;
    var url = 'https://mittely.com/blog.html?slug=' + encodeURIComponent(post.slug || '');
    var data = [
      {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: post.title,
        description: post.excerpt || post.meta_description || '',
        image: post.cover_image || '',
        datePublished: post.created_at,
        dateModified: post.updated_at || post.created_at,
        author: { '@type': 'Person', name: post.author_name || 'MITTELY' },
        publisher: { '@type': 'Organization', name: 'MITTELY' },
        mainEntityOfPage: { '@type': 'WebPage', '@id': url }
      },
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://mittely.com/' },
          { '@type': 'ListItem', position: 2, name: 'Blog', item: 'https://mittely.com/blog.html' },
          { '@type': 'ListItem', position: 3, name: post.title, item: url }
        ]
      }
    ];
    script.textContent = JSON.stringify(data);
  }

  async function loadRelatedPosts(post) {
    var section = document.getElementById('relatedPostsSection');
    var grid = document.getElementById('relatedPostsGrid');
    if (!section || !grid) return;
    try {
      var q = window.MITTELY.supabase
        .from('blog_posts')
        .select('id, title, slug, excerpt, cover_image, views_count, created_at')
        .eq('status', 'published')
        .neq('id', post.id)
        .limit(3);
      var res = await q;
      var data = (res && res.data) || [];
      if (!data.length) { section.style.display = 'none'; return; }
      section.style.display = 'block';
      grid.innerHTML = data.map(blogCardHtml).join('');
    } catch (e) {
      section.style.display = 'none';
    }
  }

  /* ---------- Init ---------- */

  function init() {
    var slug = new URL(location.href).searchParams.get('slug');
    if (slug) renderArticle(slug);
    else initListing();
  }

  window.MITTELY.blog = {
    init: init,
    sanitizeHtml: sanitizeHtml,
    blogCardHtml: blogCardHtml
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();