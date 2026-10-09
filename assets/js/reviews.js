/* ============================================================
   MITTELY — reviews.js
   Reviews page: fetches all approved reviews, renders summary
   bars, list, and handles submission via sign-in-gated form.
   ============================================================ */

(function () {
  'use strict';

  var utils = (window.MITTELY && window.MITTELY.utils) || {};
  var esc = utils.escapeHtml || function (s) { return String(s == null ? '' : s); };

  var currentRating = 5;

  /* --------------------------------------------------------
     Render summary
     -------------------------------------------------------- */
  function renderSummary(list) {
    var summaryValue = document.getElementById('summary-rating');
    var summaryCount = document.getElementById('summary-count');
    var bars = document.getElementById('rating-bars');
    if (!summaryValue || !bars) return;

    var count = list.length;
    if (!count) {
      if (summaryValue) summaryValue.textContent = '—';
      if (summaryCount) summaryCount.textContent = 'No approved reviews yet';
      if (bars) bars.innerHTML = '';
      return;
    }

    var sum = list.reduce(function (acc, r) { return acc + (Number(r.rating) || 0); }, 0);
    var avg = sum / count;
    if (summaryValue) summaryValue.textContent = avg.toFixed(1);
    if (summaryCount) summaryCount.textContent = 'Based on ' + count + ' approved review' + (count === 1 ? '' : 's');

    var buckets = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    list.forEach(function (r) {
      var k = Math.max(1, Math.min(5, Number(r.rating) || 5));
      buckets[k] = (buckets[k] || 0) + 1;
    });

    bars.innerHTML = [5, 4, 3, 2, 1].map(function (star) {
      var n = buckets[star] || 0;
      var pct = count ? Math.round((n / count) * 100) : 0;
      return '' +
        '<div class="rating-bar-row">' +
          '<span class="rating-bar-label">' + star + ' ★</span>' +
          '<div class="rating-bar-track"><div class="rating-bar-fill" style="width:' + pct + '%"></div></div>' +
          '<span class="rating-bar-count">' + n + '</span>' +
        '</div>';
    }).join('');
  }

  /* --------------------------------------------------------
     Render list
     -------------------------------------------------------- */
  function renderList(list) {
    var wrap = document.getElementById('reviews-masonry');
    var empty = document.getElementById('reviews-empty');
    if (!wrap) return;

    if (!list.length) {
      wrap.innerHTML = '';
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;

    wrap.innerHTML = list.map(function (r) {
      var initials = initialsFrom(r.name || r.email);
      var stars = '★'.repeat(Math.max(1, Math.min(5, Number(r.rating) || 5)));
      return '' +
        '<article class="review-card reveal">' +
          '<div class="review-stars" aria-label="' + (Number(r.rating) || 5) + ' out of 5 stars">' + stars + '</div>' +
          '<p class="review-text">' + esc(r.comment || '') + '</p>' +
          '<div class="review-author">' +
            '<span class="review-avatar">' + esc(initials) + '</span>' +
            '<div>' +
              '<div class="review-author-name">' + esc(r.name || 'Anonymous') + '</div>' +
              '<div class="review-author-role">' + esc(r.product_title || 'Verified customer') + '</div>' +
            '</div>' +
          '</div>' +
        '</article>';
    }).join('');

    document.dispatchEvent(new CustomEvent('mittely:content-updated'));
  }

  function initialsFrom(s) {
    s = String(s || '').trim();
    if (!s) return 'M';
    var parts = s.split(/[\s@._-]+/).filter(Boolean);
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
  }

  /* --------------------------------------------------------
     Load reviews
     -------------------------------------------------------- */
  function loadReviews() {
    if (!window.sb) return;

    window.sb
      .from('reviews')
      .select('id,name,email,rating,comment,created_at,products(title)')
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(50)
      .then(function (res) {
        var list = (res && !res.error && res.data) ? res.data : [];
        list = list.map(function (r) {
          return {
            name: r.name,
            email: r.email,
            rating: r.rating,
            comment: r.comment,
            product_title: r.products && r.products.title ? r.products.title : ''
          };
        });
        renderSummary(list);
        renderList(list);
      });
  }

  /* --------------------------------------------------------
     Star picker
     -------------------------------------------------------- */
  function bindStarPicker() {
    var picker = document.getElementById('star-picker');
    var hidden = document.getElementById('review-rating-value');
    if (!picker) return;

    picker.addEventListener('click', function (e) {
      var btn = e.target.closest('.star-btn');
      if (!btn) return;
      currentRating = parseInt(btn.getAttribute('data-value'), 10) || 5;
      if (hidden) hidden.value = String(currentRating);

      picker.querySelectorAll('.star-btn').forEach(function (b) {
        var v = parseInt(b.getAttribute('data-value'), 10) || 0;
        b.classList.toggle('active', v <= currentRating);
      });
    });

    // Initial state
    picker.querySelectorAll('.star-btn').forEach(function (b) {
      var v = parseInt(b.getAttribute('data-value'), 10) || 0;
      b.classList.toggle('active', v <= currentRating);
    });
  }

  /* --------------------------------------------------------
     Product select options
     -------------------------------------------------------- */
  function loadProductOptions() {
    var select = document.getElementById('review-product');
    if (!select || !window.sb) return;

    window.sb
      .from('products')
      .select('id,title,slug')
      .eq('is_published', true)
      .order('title', { ascending: true })
      .then(function (res) {
        var items = (res && !res.error && res.data) ? res.data : [];
        select.innerHTML = '<option value="">Select a product...</option>' +
          items.map(function (p) {
            return '<option value="' + esc(p.id) + '">' + esc(p.title) + '</option>';
          }).join('');
      });
  }

  /* --------------------------------------------------------
     Submit gating
     -------------------------------------------------------- */
  function bindSubmitGating() {
    var signInBtn = document.getElementById('submit-review-btn');
    var form = document.getElementById('review-form');
    if (!signInBtn || !form) return;

    function revealForm() {
      signInBtn.hidden = true;
      form.hidden = false;
    }

    signInBtn.addEventListener('click', function () {
      if (window.MITTELY && window.MITTELY.auth && window.MITTELY.auth.getUser()) {
        revealForm();
      } else {
        window.toast && window.toast('Sign in to submit a review.', 'info');
        if (window.MITTELY && window.MITTELY.auth) window.MITTELY.auth.open();
      }
    });

    // Auto-reveal if already signed in
    document.addEventListener('mittely:auth-changed', function (e) {
      if (e.detail && e.detail.session && e.detail.session.user) {
        revealForm();
      } else {
        signInBtn.hidden = false;
        form.hidden = true;
      }
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      submitReview(form);
    });
  }

  function submitReview(form) {
    if (!window.sb) return;

    var user = window.MITTELY.auth.getUser();
    if (!user) {
      window.toast && window.toast('Sign in to submit a review.', 'info');
      window.MITTELY.auth.open();
      return;
    }

    var productId = (document.getElementById('review-product') || {}).value;
    var comment = (document.getElementById('review-comment') || {}).value;
    var rating = currentRating;

    if (!productId || !comment || !comment.trim()) {
      window.toast && window.toast('Please select a product and add a comment.', 'error');
      return;
    }

    var submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Submitting…'; }

    var meta = user.user_metadata || {};
    var payload = {
      product_id: productId,
      name: meta.full_name || meta.name || user.email.split('@')[0],
      email: user.email,
      rating: rating,
      comment: comment.trim(),
      status: 'pending'
    };

    window.sb.from('reviews').insert(payload).then(function (res) {
      if (res.error) {
        window.toast && window.toast('Could not submit review. Please try again.', 'error');
      } else {
        window.toast && window.toast('Thanks! Your review is pending moderation.', 'success');
        form.reset();
        currentRating = 5;
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Submit review'; }
      }
    }).catch(function () {
      window.toast && window.toast('Something went wrong. Please try again.', 'error');
    }).then(function () {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Submit review'; }
    });
  }

  /* --------------------------------------------------------
     Boot
     -------------------------------------------------------- */
  function init() {
    bindStarPicker();
    bindSubmitGating();
    loadProductOptions();
    loadReviews();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();