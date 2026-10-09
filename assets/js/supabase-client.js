/* MITTELY — Supabase client bootstrap.
   Exposes window.mittelyClient (supabase-js v2) plus a tiny helper.
   Requires: @supabase/supabase-js v2 and config.js loaded first. */
(function () {
  'use strict';

  var cfg = window.MITTELY_CONFIG;
  if (!cfg || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) {
    console.error('[MITTELY] Missing MITTELY_CONFIG. Check config.js.');
    window.mittelyClient = null;
    return;
  }

  if (typeof window.supabase === 'undefined' || !window.supabase.createClient) {
    console.error('[MITTELY] supabase-js v2 not loaded.');
    window.mittelyClient = null;
    return;
  }

  try {
    window.mittelyClient = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce'
      },
      global: {
        headers: { 'x-application-name': 'mittely-web' }
      }
    });
  } catch (err) {
    console.error('[MITTELY] Failed to create Supabase client.', err);
    window.mittelyClient = null;
  }

  /* Convenience helpers used across the app. */
  window.mittely = window.mittely || {};

  window.mittely.sb = function () {
    return window.mittelyClient;
  };

  window.mittely.isReady = function () {
    return !!window.mittelyClient;
  };

  window.mittely.currentEmail = function () {
    var sb = window.mittelyClient;
    if (!sb) return null;
    try {
      /* Prefer the cached session to avoid async in sync helpers. */
      var raw = null;
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf('sb-') === 0 && k.indexOf('-auth-token') !== -1) {
          raw = localStorage.getItem(k);
          break;
        }
      }
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      var session = parsed && (parsed.session || parsed.currentSession || parsed);
      var user = session && session.user;
      return user && user.email ? String(user.email).toLowerCase() : null;
    } catch (e) {
      return null;
    }
  };

  /* Safe identifier used in DOM ids. */
  window.mittely.slugify = function (s) {
    return String(s || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
  };
})();