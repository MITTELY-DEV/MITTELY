/* ============================================
   MITTELY — auth.js
   Single source of truth for auth:
   - getSession, isAdmin, requireAuth, signOut
   - sign-in modal (idle/loading/error states)
   - signInWithOAuth → Google
   - navbar rendering (signed-out button OR avatar + dropdown)
   - OAuth redirect resume + activity logging
   ============================================ */
(function () {
  'use strict';

  if (!window.MITTELY) window.MITTELY = {};

  var REDIRECT_KEY = 'mittely_auth_redirect';
  var adminCache = null; /* null = unknown, true/false after check */

  /* ---------- Session ---------- */

  async function getSession() {
    if (!window.MITTELY.supabase) return null;
    try {
      var res = await window.MITTELY.supabase.auth.getSession();
      return res && res.data ? res.data.session : null;
    } catch (e) {
      return null;
    }
  }

  async function isAdmin() {
    if (adminCache !== null) return adminCache;
    var session = await getSession();
    if (!session || !session.user) { adminCache = false; return false; }
    try {
      var res = await window.MITTELY.supabase.rpc('is_admin_rpc');
      adminCache = !!(res && res.data === true);
    } catch (e) {
      adminCache = false;
    }
    return adminCache;
  }

  async function requireAuth() {
    var session = await getSession();
    if (session && session.user) return session;
    openSignInModal();
    return null;
  }

  async function signOut() {
    try {
      if (window.MITTELY.supabase) await window.MITTELY.supabase.auth.signOut();
    } catch (e) { /* ignore */ }
    adminCache = null;
    closeDropdowns();
    renderAuthArea(null);
    if (window.MITTELY.main) window.MITTELY.main.toast('Signed out', 'info');
    document.dispatchEvent(new CustomEvent('mittely:auth-changed', { detail: { session: null } }));
  }

  /* ---------- Redirect storage ---------- */

  function storeRedirect(dest) {
    try { sessionStorage.setItem(REDIRECT_KEY, dest || location.href); } catch (e) {}
  }

  function consumeRedirect() {
    try {
      var v = sessionStorage.getItem(REDIRECT_KEY);
      sessionStorage.removeItem(REDIRECT_KEY);
      return v || null;
    } catch (e) { return null; }
  }

  /* ---------- Activity logging ---------- */

  async function logActivity(event, meta) {
    if (!window.MITTELY.supabase) return;
    var session = await getSession();
    var email = session && session.user ? session.user.email : null;
    if (!email) return;
    try {
      await window.MITTELY.supabase.rpc('log_activity', {
        p_email: email,
        p_event: event,
        p_meta: meta || {}
      });
    } catch (e) { /* silent */ }
  }

  /* ---------- Sign-in modal ---------- */

  function getModal() { return document.getElementById('signInModal'); }
  function getErrorEl() { return document.getElementById('signInError'); }

  function openSignInModal() {
    var modal = getModal();
    if (!modal) return;
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    var err = getErrorEl();
    if (err) { err.style.display = 'none'; err.textContent = ''; }
    var btn = document.getElementById('googleSignInBtn');
    if (btn) resetGoogleBtn(btn);
    bindModalOnce();
  }

  function closeSignInModal() {
    var modal = getModal();
    if (!modal) return;
    modal.style.display = 'none';
    document.body.style.overflow = '';
  }

  function bindModalOnce() {
    var modal = getModal();
    if (!modal || modal.dataset.bound === '1') return;
    modal.dataset.bound = '1';

    var close = document.getElementById('signInModalClose');
    if (close) close.addEventListener('click', closeSignInModal);
    modal.addEventListener('click', function (e) {
      if (e.target === modal) closeSignInModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal.style.display === 'flex') closeSignInModal();
    });

    var googleBtn = document.getElementById('googleSignInBtn');
    if (googleBtn) googleBtn.addEventListener('click', signInWithGoogle);
  }

  function resetGoogleBtn(btn) {
    if (!btn) return;
    btn.disabled = false;
    btn.classList.remove('is-loading');
    btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.5 6.5 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.5 6.5 29.5 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.5l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"/></svg> Continue with Google';
  }

  function showModalError(msg) {
    var err = getErrorEl();
    if (!err) return;
    err.innerHTML = window.MITTELY.main
      ? window.MITTELY.main.escapeHtml(msg) + ' <button class="link-btn" id="tryAgainBtn" style="margin-left:8px;">Try again</button>'
      : msg;
    err.style.display = 'block';
    var tryAgain = document.getElementById('tryAgainBtn');
    if (tryAgain) {
      tryAgain.addEventListener('click', function () {
        err.style.display = 'none';
        var btn = document.getElementById('googleSignInBtn');
        resetGoogleBtn(btn);
      });
    }
  }

  async function signInWithGoogle() {
    if (!window.MITTELY.supabase) {
      showModalError('Authentication service unavailable.');
      return;
    }
    var btn = document.getElementById('googleSignInBtn');
    if (btn) {
      btn.disabled = true;
      btn.classList.add('is-loading');
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Connecting to Google…';
    }
    storeRedirect(location.href);
    try {
      var res = await window.MITTELY.supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: location.href }
      });
      if (res && res.error) throw res.error;
    } catch (err) {
      if (btn) resetGoogleBtn(btn);
      showModalError((err && err.message) || 'Sign-in failed. Please try again.');
    }
  }

  /* ---------- OAuth callback handling ---------- */

  async function handleOAuthReturn() {
    if (!window.MITTELY.supabase) return;

    var url = new URL(location.href);
    var errParam = url.searchParams.get('error');
    var errDesc = url.searchParams.get('error_description');
    if (errParam) {
      url.searchParams.delete('error');
      url.searchParams.delete('error_description');
      history.replaceState({}, '', url.pathname + url.search + url.hash);
      openSignInModal();
      showModalError(errDesc || 'Sign-in was cancelled or failed.');
      return;
    }

    var session = await getSession();
    if (!session || !session.user) return;

    var wasSignup = session.user.created_at &&
      (Date.now() - new Date(session.user.created_at).getTime()) < 60000;
    logActivity(wasSignup ? 'signup' : 'sign_in');

    var dest = consumeRedirect();
    if (dest && dest !== location.href && dest.indexOf('http') === 0) {
      location.replace(dest);
    } else {
      renderAuthArea(session);
    }
    document.dispatchEvent(new CustomEvent('mittely:auth-changed', { detail: { session: session } }));
  }

  /* ---------- Navbar rendering ---------- */

  function closeDropdowns() {
    document.querySelectorAll('.auth-dropdown.open').forEach(function (d) { d.classList.remove('open'); });
  }

  function buildSignedOut() {
    var btn = document.createElement('button');
    btn.className = 'btn btn-primary';
    btn.type = 'button';
    btn.innerHTML = 'Sign in';
    btn.addEventListener('click', openSignInModal);
    return btn;
  }

  async function buildSignedIn(session) {
    if (!session || !session.user) return buildSignedOut();
    var user = session.user;
    var meta = user.user_metadata || {};
    var name = meta.full_name || meta.name || (user.email ? user.email.split('@')[0] : 'User');
    var avatar = meta.avatar_url || meta.picture || '';

    var wrap = document.createElement('div');
    wrap.className = 'auth-user';
    wrap.setAttribute('tabindex', '0');
    wrap.setAttribute('role', 'button');
    wrap.setAttribute('aria-haspopup', 'menu');

    var avatarHtml = avatar
      ? '<img class="auth-avatar" src="' + window.MITTELY.main.escapeHtml(avatar) + '" alt="" referrerpolicy="no-referrer">'
      : '<span class="auth-avatar" style="display:inline-flex;align-items:center;justify-content:center;font-weight:700;color:var(--highlight);">' +
        window.MITTELY.main.escapeHtml(name.charAt(0).toUpperCase()) + '</span>';

    wrap.innerHTML = avatarHtml + '<span class="auth-name">' + window.MITTELY.main.escapeHtml(name) + '</span>';

    var dropdown = document.createElement('div');
    dropdown.className = 'auth-dropdown';
    dropdown.setAttribute('role', 'menu');

    var dd = '';
    dd += '<a href="dashboard.html" role="menuitem"><i class="fa-solid fa-gauge"></i> Dashboard</a>';
    var admin = await isAdmin();
    if (admin) {
      dd += '<a href="admin.html" role="menuitem"><i class="fa-solid fa-shield-halved"></i> Admin</a>';
    }
    dd += '<button type="button" role="menuitem" id="authSignOutBtn"><i class="fa-solid fa-arrow-right-from-bracket"></i> Sign out</button>';
    dropdown.innerHTML = dd;

    wrap.appendChild(dropdown);

    function toggle(e) {
      if (e) e.stopPropagation();
      var isOpen = dropdown.classList.contains('open');
      closeDropdowns();
      if (!isOpen) dropdown.classList.add('open');
    }
    wrap.addEventListener('click', toggle);
    wrap.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(e); }
    });

    document.addEventListener('click', function (e) {
      if (!wrap.contains(e.target)) dropdown.classList.remove('open');
    });

    var signOutBtn = dropdown.querySelector('#authSignOutBtn');
    if (signOutBtn) {
      signOutBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        signOut();
      });
    }

    return wrap;
  }

  async function renderAuthArea(session) {
    if (session === undefined) session = await getSession();
    var targets = [
      document.getElementById('authNavArea'),
      document.getElementById('drawerAuthArea')
    ].filter(Boolean);

    for (var i = 0; i < targets.length; i++) {
      var area = targets[i];
      area.innerHTML = '';
      if (session && session.user) {
        var node = await buildSignedIn(session);
        area.appendChild(node);
      } else {
        area.appendChild(buildSignedOut());
      }
    }
  }

  /* ---------- Init ---------- */

  async function init() {
    bindModalOnce();

    if (window.MITTELY.supabase) {
      try {
        window.MITTELY.supabase.auth.onAuthStateChange(function (_event, session) {
          adminCache = null;
          renderAuthArea(session);
        });
      } catch (e) { /* silent */ }
    }

    await handleOAuthReturn();
    var session = await getSession();
    await renderAuthArea(session);

    document.addEventListener('mittely:auth-changed', function () {
      adminCache = null;
    });
  }

  window.MITTELY.auth = {
    getSession: getSession,
    isAdmin: isAdmin,
    requireAuth: requireAuth,
    signOut: signOut,
    openSignInModal: openSignInModal,
    closeSignInModal: closeSignInModal,
    logActivity: logActivity,
    renderAuthArea: renderAuthArea
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();