/* MITTELY — blog.js
   Single-file blog: LISTING mode (no ?slug) and ARTICLE mode (?slug=...).
   Handles fetch, tag filter, live search, pagination, views increment,
   related posts, share, runtime canonical/OG rewrite, and JSON-LD injection. */
(function () {
  'use strict';

  var PAGE_SIZE = 6;

  function sb() { return window.mittely && window.mittely.sb && window.mittely.sb(); }
  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) { return window.escapeHtml ? window.escapeHtml(s) : String(s == null ? '' : s); }
  function toast(m, k) { if (window.toast) window.toast(m, k); }
  function param(name) { return new URL(window.location.href).searchParams.get(name); }

  /* ============ Listing ============ */

  var listState = { page: 1, tag: '', search: '', total: 0 };

  function blogCardHtml(p) {
    var url = 'blog.html?slug=' + encodeURIComponent(p.slug);
    return '' +
      '<article class="card">' +
        '<div class="card-media">' +
          (p.cover_image
            ? '<img src="' + esc(p.cover_image) + '" alt="' + esc(p.title) + ' cover" loading="lazy" decoding="async" width="600" height="450">'
            : '<div class="skeleton-block" aria-hidden="true"></div>') +
          '<div class="card-scrim" aria-hidden="true"></div>' +
          '<a href="' + url + '" class="card-save-pill"><i class="fa-solid fa-arrow-right" aria-hidden="true"></i> Read</a>' +
        '</div>' +
        '<div class="card-body">' +
          '<h3 class="card-title"><a href="' + url + '">' + esc(p.title) + '</a></h3>' +
          '<p class="muted" style="margin:0;font-size:.92em">' + esc(p.excerpt || '') + '</p>' +
        '</div>' +
      '</article>';
  }

  function buildListQuery() {
    var client = sb();
    if (!client) return null;
    var q = client.from('blog_posts')
      .select('id,title,slug,excerpt,cover_image,tags,author_name,created_at,views_count', { count: 'exact' })
      .eq('status', 'published')
      .order('created_at', { ascending: false });
    if (listState.tag) q = q.ilike('tags', '%' + listState.tag + '%');
    if (listState.search) q = q.or('title.ilike.%' + listState.search + '%,excerpt.ilike.%' + listState.search + '%');
    var from = (listState.page - 1) * PAGE_SIZE;
    var to = from + PAGE_SIZE - 1;
    return q.range(from, to);
  }

  function renderList() {
    var grid = document.getElementById('blogGrid');
    var empty = document.getElementById('blogEmpty');
    var pagEl = document.getElementById('blogPagination');
    if (!grid) return;
    grid.innerHTML = '';
    for (var i = 0; i < PAGE_SIZE; i++) {
      var s = document.createElement('div');
      s.className = 'card skeleton-card';
      s.setAttribute('aria-hidden', 'true');
      grid.appendChild(s);
    }
    var q = buildListQuery();
    if (!q) return;
    q.then(function (res) {
      var rows = (res && res.data) || [];
      listState.total = (res && res.count) || rows.length;
      if (!rows.length) {
        grid.innerHTML = '';
        if (empty) empty.hidden = false;
        if (pagEl) pagEl.innerHTML = '';
        return;
      }
      grid.innerHTML = rows.map(blogCardHtml).join('');
      if (empty) empty.hidden = true;
      renderPagination(pagEl);
      injectListingJsonLd(rows);
      injectBreadcrumbs();
    }).catch(function () {
      grid.innerHTML = '';
      if (empty) empty.hidden = false;
    });
  }

  function renderPagination(container) {
    if (!container) return;
    var pages = Math.max(1, Math.ceil(listState.total / PAGE_SIZE));
    if (pages <= 1) { container.innerHTML = ''; return; }
    var html = '';
    for (var i = 1; i <= pages; i++) {
      html += '<button type="button" class="' + (i === listState.page ? 'is-active' : '') + '" data-page="' + i + '">' + i + '</button>';
    }
    container.innerHTML = html;
    qsa('button', container).forEach(function (b) {
      b.addEventListener('click', function () {
        listState.page = Number(b.getAttribute('data-page'));
        renderList();
        window.scrollTo({ top: container.getBoundingClientRect().top + window.scrollY - 120, behavior: 'smooth' });
      });
    });
  }

  function loadTags() {
    var chips = document.getElementById('blogTags');
    if (!chips) return;
    var client = sb();
    if (!client) return;
    client.from('blog_posts').select('tags').eq('status', 'published')
      .then(function (res) {
        var rows = (res && res.data) || [];
        var set = {};
        rows.forEach(function (r) {
          String(r.tags || '').split(',').forEach(function (t) {
            var tag = t.trim();
            if (tag) set[tag] = true;
          });
        });
        var tags = Object.keys(set).sort();
        var html = '<button class="chip is-active" data-tag="">All</button>' +
          tags.map(function (t) { return '<button class="chip" data-tag="' + esc(t) + '">' + esc(t) + '</button>'; }).join('');
        chips.innerHTML = html;
        qsa('button', chips).forEach(function (b) {
          b.addEventListener('click', function () {
            qsa('button', chips).forEach(function (x) { x.classList.remove('is-active'); });
            b.classList.add('is-active');
            listState.tag = b.getAttribute('data-tag');
            listState.page = 1;
            renderList();
          });
        });
      });
  }

  /* ============ Article ============ */

  function initArticle(slug) {
    var client = sb();
    if (!client) { showArticleNotFound(); return; }
    client.from('blog_posts')
      .select('*')
      .eq('slug', slug)
      .eq('status', 'published')
      .maybeSingle()
      .then(function (res) {
        if (res.error || !res.data) { showArticleNotFound(); return; }
        renderArticle(res.data);
        client.rpc('increment_blog_views', { p_id: res.data.id }).then(function () {});
        loadRelated(res.data);
      })
      .catch(function () { showArticleNotFound(); });
  }

  function renderArticle(p) {
    // Hide listing view, show article.
    var listingHead = document.getElementById('blogListing');
    var listing = document.getElementById('blogListingSection');
    var article = document.getElementById('articleView');
    if (listingHead) listingHead.hidden = true;
    if (listing) listing.hidden = true;
    if (article) article.hidden = false;

    document.title = (p.meta_title || p.title) + ' | MITTELY';
    var md = document.querySelector('meta[name="description"]');
    if (md) md.setAttribute('content', (p.meta_description || p.excerpt || p.title).slice(0, 158));
    var link = document.querySelector('link[rel="canonical"]');
    if (link) link.setAttribute('href', 'https://mittely.com/blog.html?slug=' + encodeURIComponent(p.slug));
    var robots = document.querySelector('meta[name="robots"]');
    if (robots) robots.setAttribute('content', 'index, follow');

    var ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute('content', p.meta_title || p.title);
    var ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc) ogDesc.setAttribute('content', p.meta_description || p.excerpt || p.title);
    var ogUrl = document.querySelector('meta[property="og:url"]');
    if (ogUrl) ogUrl.setAttribute('content', 'https://mittely.com/blog.html?slug=' + encodeURIComponent(p.slug));
    var ogImg = document.querySelector('meta[property="og:image"]');
    if (ogImg && p.cover_image) ogImg.setAttribute('content', p.cover_image);
    var twTitle = document.querySelector('meta[name="twitter:title"]');
    if (twTitle) twTitle.setAttribute('content', p.meta_title || p.title);
    var twDesc = document.querySelector('meta[name="twitter:description"]');
    if (twDesc) twDesc.setAttribute('content', p.meta_description || p.excerpt || p.title);
    var twImg = document.querySelector('meta[name="twitter:image"]');
    if (twImg && p.cover_image) twImg.setAttribute('content', p.cover_image);

    var cover = document.getElementById('articleCover');
    if (cover) {
      cover.src = p.cover_image || 'https://images.unsplash.com/photo-1522542550221-31fd19575a2d?w=1200&q=80';
      cover.alt = p.title + ' cover image';
    }
    document.getElementById('articleTitle').textContent = p.title;
    var crumb = document.getElementById('articleCrumb');
    if (crumb) crumb.textContent = p.title;

    var tagWrap = document.getElementById('articleTags');
    if (tagWrap) {
      var tags = String(p.tags || '').split(',').map(function (t) { return t.trim(); }).filter(Boolean);
      tagWrap.innerHTML = tags.map(function (t) {
        return '<a class="chip" href="blog.html?tag=' + encodeURIComponent(t) + '">' + esc(t) + '</a>';
      }).join('');
    }

    var author = p.author_name || 'MITTELY';
    var authorAvatar = document.getElementById('articleAuthorAvatar');
    if (authorAvatar) {
      authorAvatar.src = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(author) + '&background=C6F13C&color=1A1F1A';
      authorAvatar.alt = author;
    }
    var authorName = document.getElementById('articleAuthorName');
    if (authorName) authorName.textContent = author;

    var date = document.getElementById('articleDate');
    var publishedAt = p.created_at ? new Date(p.created_at) : new Date();
    if (date) {
      date.textContent = publishedAt.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
      date.setAttribute('datetime', publishedAt.toISOString());
    }

    var words = String(p.content || '').split(/\s+/).length;
    var reading = Math.max(1, Math.round(words / 220));
    var rt = document.getElementById('articleReadingTime');
    if (rt) rt.textContent = reading + ' min read';

    var views = document.getElementById('articleViews');
    if (views) views.textContent = String(Number(p.views_count || 0) + 1);

    var content = document.getElementById('articleContent');
    if (content) {
      var sanitized = window.mittelyProducts && window.mittelyProducts.sanitizeHtml
        ? window.mittelyProducts.sanitizeHtml(p.content || '')
        : '';
      content.innerHTML = sanitized || '<p>' + esc(p.excerpt || '') + '</p>';
    }

    // Share row
    var shareUrl = 'https://mittely.com/blog.html?slug=' + encodeURIComponent(p.slug);
    var shareTitle = p.meta_title || p.title;
    var shareX = document.getElementById('shareX');
    var shareLi = document.getElementById('shareLinkedIn');
    var shareCopy = document.getElementById('shareCopy');
    if (shareX) shareX.href = 'https://twitter.com/intent/tweet?url=' + encodeURIComponent(shareUrl) + '&text=' + encodeURIComponent(shareTitle);
    if (shareLi) shareLi.href = 'https://www.linkedin.com/sharing/share-offsite/?url=' + encodeURIComponent(shareUrl);
    if (shareCopy) {
      shareCopy.addEventListener('click', function () {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(shareUrl).then(function () { toast('Link copied.', 'success'); });
        } else {
          toast('Copy failed.', 'error');
        }
      });
    }

    injectArticleJsonLd(p);
    injectArticleBreadcrumbs(p);
  }

  function loadRelated(p) {
    var client = sb();
    var section = document.getElementById('relatedSection');
    var grid = document.getElementById('relatedPosts');
    if (!client || !grid) return;
    var firstTag = String(p.tags || '').split(',')[0].trim();
    var q = client.from('blog_posts')
      .select('id,title,slug,excerpt,cover_image,tags,created_at')
      .eq('status', 'published')
      .neq('id', p.id)
      .order('created_at', { ascending: false })
      .limit(3);
    if (firstTag) q = q.ilike('tags', '%' + firstTag + '%');
    q.then(function (res) {
      var rows = (res && res.data) || [];
      if (!rows.length) return;
      grid.innerHTML = rows.map(blogCardHtml).join('');
      if (section) section.hidden = false;
    });
  }

  function showArticleNotFound() {
    var listingHead = document.getElementById('blogListing');
    var listing = document.getElementById('blogListingSection');
    var article = document.getElementById('articleView');
    var notFound = document.getElementById('articleNotFound');
    if (listingHead) listingHead.hidden = true;
    if (listing) listing.hidden = true;
    if (article) article.hidden = true;
    if (notFound) notFound.hidden = false;
    var robots = document.querySelector('meta[name="robots"]');
    if (robots) robots.setAttribute('content', 'noindex, nofollow');
    document.title = 'Article not found — MITTELY';
  }

  /* ============ JSON-LD ============ */

  function injectListingJsonLd(rows) {
    var el = document.getElementById('mittelyBlogListingJsonLd');
    if (!el) {
      el = document.createElement('script');
      el.type = 'application/ld+json';
      el.id = 'mittelyBlogListingJsonLd';
      document.head.appendChild(el);
    }
    var data = {
      "@context": "https://schema.org",
      "@type": "ItemList",
      "itemListElement": rows.map(function (p, i) {
        return {
          "@type": "ListItem",
          "position": i + 1,
          "url": "https://mittely.com/blog.html?slug=" + encodeURIComponent(p.slug),
          "name": p.title
        };
      })
    };
    el.textContent = JSON.stringify(data);
    var articleEl = document.getElementById('mittelyBlogArticleJsonLd');
    if (articleEl) articleEl.remove();
  }

  function injectArticleJsonLd(p) {
    var el = document.getElementById('mittelyBlogArticleJsonLd');
    if (!el) {
      el = document.createElement('script');
      el.type = 'application/ld+json';
      el.id = 'mittelyBlogArticleJsonLd';
      document.head.appendChild(el);
    }
    var data = {
      "@context": "https://schema.org",
      "@type": "Article",
      "headline": p.meta_title || p.title,
      "image": [p.cover_image || 'https://mittely.com/assets/img/og-default.jpg'],
      "datePublished": p.created_at || new Date().toISOString(),
      "dateModified": p.updated_at || p.created_at || new Date().toISOString(),
      "author": {
        "@type": "Person",
        "name": p.author_name || 'MITTELY'
      },
      "publisher": {
        "@type": "Organization",
        "name": "MITTELY",
        "logo": {
          "@type": "ImageObject",
          "url": "https://mittely.com/assets/img/logo.png"
        }
      },
      "mainEntityOfPage": "https://mittely.com/blog.html?slug=" + encodeURIComponent(p.slug)
    };
    el.textContent = JSON.stringify(data);
    var listingEl = document.getElementById('mittelyBlogListingJsonLd');
    if (listingEl) listingEl.remove();
  }

  function injectBreadcrumbs() {
    var el = document.getElementById('mittelyBlogBreadcrumbJsonLd');
    if (!el) {
      el = document.createElement('script');
      el.type = 'application/ld+json';
      el.id = 'mittelyBlogBreadcrumbJsonLd';
      document.head.appendChild(el);
    }
    el.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://mittely.com/" },
        { "@type": "ListItem", "position": 2, "name": "Blog", "item": "https://mittely.com/blog.html" }
      ]
    });
  }

  function injectArticleBreadcrumbs(p) {
    var el = document.getElementById('mittelyBlogBreadcrumbJsonLd');
    if (!el) {
      el = document.createElement('script');
      el.type = 'application/ld+json';
      el.id = 'mittelyBlogBreadcrumbJsonLd';
      document.head.appendChild(el);
    }
    el.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://mittely.com/" },
        { "@type": "ListItem", "position": 2, "name": "Blog", "item": "https://mittely.com/blog.html" },
        { "@type": "ListItem", "position": 3, "name": p.title, "item": "https://mittely.com/blog.html?slug=" + encodeURIComponent(p.slug) }
      ]
    });
  }

  /* ============ Entry ============ */

  function onReady(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  onReady(function () {
    var slug = param('slug');
    if (slug) {
      initArticle(slug);
    } else {
      var tag = param('tag');
      if (tag) listState.tag = tag;
      loadTags();
      var search = document.getElementById('blogSearch');
      if (search) {
        search.addEventListener('input', window.debounce(function () {
          listState.search = search.value.trim();
          listState.page = 1;
          renderList();
        }, 260));
      }
      renderList();
    }
  });
})();