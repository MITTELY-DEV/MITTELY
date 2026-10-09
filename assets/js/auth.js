/* MITTELY — auth.js
   Google-only auth with a branded modal. Handles: modal open/close with all states,
   signInWithOAuth, OAuth return error handling, intended destination resume,
   navbar render (signed-out button vs signed-in avatar + dropdown),
   admin visibility via is_admin_rpc, signOut, and post-login activity logging. */
(function () {
  'use strict';

  var MODAL_ID = 'signInModal';
  var REDIRECT_KEY = 'mittely_auth_redirect';
  var INTENT_KEY = 'mittely_auth_intent';
  var ADMIN_EMAIL = (window.MITTELY_CONFIG && window.MITTELY_CONFIG.ADMIN_EMAIL) || '';

  var state = {
    session: null,
    user: null,
    isAdmin: false,
    busy: false
  };

  function sb() { return window.mittely && window.mittely.sb && window.mittely.sb(); }

  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  /* ============ Modal ============ */

  function getModal() { return document.getElementById(MODAL_ID); }

  function setState(mode, message) {
    var modal = getModal();
    if (!modal) return;
    var btn = document.getElementById('googleSignInBtn');
    var err = document.getElementById('signInError');

    if (err) {
      if (message) {
        err.textContent = message;
        err.hidden = false;
      } else {
        err.hidden = true;
        err.textContent = '';
      }
    }

    if (btn) {
      if (mode === 'loading') {
        btn.classList.add('is-loading');
        btn.disabled = true;
        btn.setAttribute('aria-busy', 'true');
        var span = btn.querySelector('span') || btn;
        // Preserve icon + label structure.
        btn.dataset.originalHtml = btn.dataset.originalHtml || btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin" aria-hidden="true"></i> Connecting to Google…';
      } else if (mode === 'error') {
        btn.classList.remove('is-loading');
        btn.disabled = false;
        btn.removeAttribute('aria-busy');
        if (btn.dataset.originalHtml) btn.innerHTML = btn.dataset.originalHtml;
        // Append a "Try again" line inside error paragraph (handled below).
        if (err) {
          err.innerHTML = (message || 'Something went wrong.') + ' <button type="button" class="link-arrow" id="signInTryAgain">Try again</button>';
          err.hidden = false;
          var tryBtn = document.getElementById('signInTryAgain');
          if (tryBtn) tryBtn.addEventListener('click', function () { startGoogleSignIn(); });
        }
      } else {
        btn.classList.remove('is-loading');
        btn.disabled = false;
        btn.removeAttribute('aria-busy');
        if (btn.dataset.originalHtml) btn.innerHTML = btn.dataset.originalHtml;
      }
    }

    // Non-dismissible during redirect.
    var closeBtn = document.getElementById('signInClose');
    if (closeBtn) closeBtn.disabled = (mode === 'loading');
  }

  function openModal(intent, message) {
    var modal = getModal();
    if (!modal) return;
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    setState('idle');
    if (message) setState('error', message);
    if (intent) {
      try { sessionStorage.setItem(INTENT_KEY, intent); } catch (e) {}
    }
    // Focus trap: focus on the Google button.
    setTimeout(function () {
      var btn = document.getElementById('googleSignInBtn');
      if (btn) btn.focus();
    }, 60);
  }

  function closeModal() {
    var modal = getModal();
    if (!modal) return;
    if (modal.classList.contains('is-open') && document.getElementById('signInClose') && document.getElementById('signInClose').disabled) return;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    setState('idle');
  }

  function bindModal() {
    var modal = getModal();
    if (!modal || modal.dataset.bound === '1') return;
    modal.dataset.bound = '1';

    var closeBtn = document.getElementById('signInClose');
    if (closeBtn) closeBtn.addEventListener('click', closeModal);

    modal.addEventListener('click', function (e) {
      if (e.target === modal) closeModal();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (!modal.classList.contains('is-open')) return;
      closeModal();
    });

    // Simple focus trap.
    modal.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab') return;
      var focusables = qsa('button:not([disabled]), a[href], input, textarea, select, [tabindex]:not([tabindex="-1"])', modal)
        .filter(function (el) { return el.offsetParent !== null; });
      if (!focusables.length) return;
      var first = focusables[0];
      var last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });

    var googleBtn = document.getElementById('googleSignInBtn');
    if (googleBtn) googleBtn.addEventListener('click', startGoogleSignIn);

    // Global triggers.
    var navBtn = document.getElementById('signInNavBtn');
    if (navBtn) navBtn.addEventListener('click', function () { openModal('navbar'); });

    var dashBtn = document.getElementById('dashboardSignInBtn');
    if (dashBtn) dashBtn.addEventListener('click', function () { openModal('dashboard'); });

    var checkoutBtn = document.getElementById('checkoutSignInBtn');
    if (checkoutBtn) checkoutBtn.addEventListener('click', function () { openModal('checkout'); });

    var adminBtn = document.getElementById('adminSignInBtn');
    if (adminBtn) adminBtn.addEventListener('click', function () { openModal('admin'); });
  }

  /* ============ Google sign-in ============ */

  function startGoogleSignIn() {
    var client = sb();
    if (!client || state.busy) return;
    state.busy = true;
    setState('loading');

    var here = window.location.pathname + window.location.search + window.location.hash;
    var intent = 'auth';
    try { intent = sessionStorage.getItem(INTENT_KEY) || 'auth'; } catch (e) {}
    try { sessionStorage.setItem(REDIRECT_KEY, here); } catch (e) {}

    client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + window.location.pathname + window.location.search
      }
    }).then(function (res) {
      if (res && res.error) {
        state.busy = false;
        setState('error', res.error.message || 'Google sign-in failed. Please try again.');
      }
      // On success the browser redirects; the modal stays in loading state.
    }).catch(function (err) {
      state.busy = false;
      setState('error', (err && err.message) || 'Google sign-in failed. Please try again.');
    });
  }

  /* ============ Post-login activity ============ */

  function logActivity(event, meta) {
    var client = sb();
    if (!client) return;
    var email = state.user && state.user.email;
    if (!email) return;
    client.rpc('log_activity', {
      p_email: email.toLowerCase(),
      p_event: event,
      p_meta: meta || {}
    }).then(function () {}).catch(function () {});
  }

  /* ============ Navbar render ============ */

  function renderNavbar() {
    var slot = document.getElementById('authNavSlot');
    if (!slot) return;

    if (!state.user) {
      slot.innerHTML = '<button class="btn btn-outline btn-sm" id="signInNavBtn">Sign in</button>';
      var btn = document.getElementById('signInNavBtn');
      if (btn) btn.addEventListener('click', function () { openModal('navbar'); });
      return;
    }

    var name = (state.user.user_metadata && (state.user.user_metadata.full_name || state.user.user_metadata.name)) || state.user.email || 'Account';
    var avatar = (state.user.user_metadata && state.user.user_metadata.avatar_url) || '';
    var initial = String(name).trim().charAt(0).toUpperCase() || 'M';

    var html = '<div class="user-chip-nav-wrap" style="position:relative">' +
      '<button class="user-chip-nav" id="userMenuBtn" aria-haspopup="true" aria-expanded="false">' +
      (avatar
        ? '<img src="' + window.escapeHtml(avatar) + '" alt="" width="28" height="28" loading="lazy" decoding="async">'
        : '<span class="brand-mark" aria-hidden="true">' + window.escapeHtml(initial) + '</span>') +
      '<span>' + window.escapeHtml(name) + '</span>' +
      '<i class="fa-solid fa-chevron-down" aria-hidden="true"></i>' +
      '</button>' +
      '<div class="user-dropdown" id="userDropdown" role="menu">' +
      '<a href="dashboard.html" role="menuitem"><i class="fa-solid fa-gauge-high" aria-hidden="true"></i> Dashboard</a>' +
      '<a href="dashboard.html#wallet" role="menuitem"><i class="fa-solid fa-wallet" aria-hidden="true"></i> Wallet</a>' +
      (state.isAdmin ? '<a href="admin.html" role="menuitem"><i class="fa-solid fa-user-shield" aria-hidden="true"></i> Admin</a>' : '') +
      '<button type="button" role="menuitem" id="signOutBtn"><i class="fa-solid fa-arrow-right-from-bracket" aria-hidden="true"></i> Sign out</button>' +
      '</div>' +
      '</div>';

    slot.innerHTML = html;

    var menuBtn = document.getElementById('userMenuBtn');
    var dropdown = document.getElementById('userDropdown');

    function closeDropdown() {
      if (!dropdown) return;
      dropdown.classList.remove('is-open');
      if (menuBtn) menuBtn.setAttribute('aria-expanded', 'false');
    }
    function toggleDropdown() {
      if (!dropdown) return;
      var open = dropdown.classList.toggle('is-open');
      if (menuBtn) menuBtn.setAttribute('aria-expanded', String(open));
    }
    if (menuBtn) {
      menuBtn.addEventListener('click', function (e) { e.stopPropagation(); toggleDropdown(); });
    }
    document.addEventListener('click', function () { closeDropdown(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDropdown(); });

    var outBtn = document.getElementById('signOutBtn');
    if (outBtn) outBtn.addEventListener('click', function () { signOut(); });
  }

  /* ============ Session bootstrap ============ */

  function checkAdmin() {
    var client = sb();
    if (!client) return Promise.resolve(false);
    // Local shortcut for the owner to avoid a network round-trip.
    var email = state.user && state.user.email && state.user.email.toLowerCase();
    if (ADMIN_EMAIL && email === ADMIN_EMAIL.toLowerCase()) { state.isAdmin = true; return Promise.resolve(true); }
    return client.rpc('is_admin_rpc').then(function (res) {
      state.isAdmin = !!(res && !res.error && res.data === true);
      return state.isAdmin;
    }).catch(function () {
      state.isAdmin = false;
      return false;
    });
  }

  function handleSession(session) {
    state.session = session || null;
    state.user = (session && session.user) || null;
    if (!state.user) {
      state.isAdmin = false;
      renderNavbar();
      return Promise.resolve();
    }
    return checkAdmin().then(function () { renderNavbar(); });
  }

  function handleOAuthReturn() {
    // Supabase appends error / error_description on OAuth failure.
    var url = new URL(window.location.href);
    var err = url.searchParams.get('error');
    var desc = url.searchParams.get('error_description');
    if (!err) return false;

    // Clean the URL.
    url.searchParams.delete('error');
    url.searchParams.delete('error_description');
    url.searchParams.delete('state');
    url.searchParams.delete('code');
    window.history.replaceState({}, document.title, url.pathname + url.search + url.hash);

    setTimeout(function () { openModal('oauth', desc || 'Sign-in was cancelled or failed. Please try again.'); }, 250);
    return true;
  }

  function resumeRedirect() {
    var target = null;
    try { target = sessionStorage.getItem(REDIRECT_KEY); } catch (e) {}
    try { sessionStorage.removeItem(REDIRECT_KEY); } catch (e) {}
    if (!target) return;
    var here = window.location.pathname + window.location.search + window.location.hash;
    if (target === here) return;
    // Only resume when we're back on the site root or an allowed page.
    window.location.replace(target);
  }

  function signOut() {
    var client = sb();
    if (!client) return;
    client.auth.signOut().then(function () {
      state.user = null;
      state.session = null;
      state.isAdmin = false;
      renderNavbar();
      if (window.toast) window.toast('Signed out.', 'success');
    }).catch(function () {});
  }

  /* ============ Public API ============ */

  function onReady(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  onReady(function () {
    bindModal();

    var client = sb();
    if (!client) { renderNavbar(); return; }

    handleOAuthReturn();

    client.auth.getSession().then(function (res) {
      var session = res && res.data && res.data.session;
      return handleSession(session);
    }).then(function () {
      // Resume intended destination if we just arrived with a session and a stored redirect.
      var url = new URL(window.location.href);
      if (url.searchParams.get('code') || url.searchParams.get('state')) {
        logActivity('sign_in', { from: 'oauth_return' });
        resumeRedirect();
      }
    }).catch(function () { renderNavbar(); });

    client.auth.onAuthStateChange(function (event, session) {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
        handleSession(session);
        if (event === 'SIGNED_IN' && session && session.user) {
          logActivity('sign_in', { from: 'state_change' });
        }
      }
    });

    // Global wishlist etc triggers call into openModal.
    qsa('[data-requires-auth]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        if (state.user) return;
        e.preventDefault();
        openModal(el.getAttribute('data-intent') || 'generic');
      });
    });
  });

  window.mittelyAuth = {
    openModal: openModal,
    openSignIn: openModal,
    closeModal: closeModal,
    getSession: function () { return state.session; },
    getUser: function () { return state.user; },
    isAdmin: function () { return state.isAdmin; },
    signOut: signOut,
    logActivity: logActivity
  };
})();