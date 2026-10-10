/* ============================================
   MITTELY — Supabase client singleton
   Exposes window.MITTELY.supabase (single instance)
   ============================================ */
(function () {
  'use strict';

  if (!window.MITTELY) window.MITTELY = {};

  var cfg = window.MITTELY_CONFIG || {};
  var url = cfg.SUPABASE_URL;
  var key = cfg.SUPABASE_ANON_KEY;

  if (!url || !key || url.indexOf('YOUR_PROJECT_REF') !== -1) {
    console.warn('[MITTELY] Supabase config missing. Set SUPABASE_URL and SUPABASE_ANON_KEY in config.js.');
  }

  var client = null;
  try {
    if (window.supabase && typeof window.supabase.createClient === 'function') {
      client = window.supabase.createClient(url, key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      });
    } else {
      console.warn('[MITTELY] supabase-js not loaded.');
    }
  } catch (err) {
    console.error('[MITTELY] Failed to init Supabase client:', err);
  }

  window.MITTELY.supabase = client;
  window.MITTELY.config = cfg;
})();