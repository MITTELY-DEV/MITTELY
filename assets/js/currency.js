/* MITTELY — currency.js
   Fetches live USD->GHS, caches in localStorage 6h, falls back to settings fx_fallback_rate.
   Exposes window.mittelyCurrency.{rate, refresh, format}. */
(function () {
  'use strict';

  var CACHE_KEY = 'mittely-fx';
  var TTL_MS = 6 * 60 * 60 * 1000;
  var ENDPOINT = 'https://open.er-api.com/v6/latest/USD';
  var DEFAULT_FALLBACK = 15.5;
  var FALLBACK_KEY = 'fx_fallback_rate';

  function readCache() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || !parsed.rate || !parsed.at) return null;
      return parsed;
    } catch (e) { return null; }
  }

  function writeCache(rate) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ rate: rate, at: Date.now() }));
    } catch (e) {}
  }

  function isFresh(cache) {
    return cache && (Date.now() - cache.at) < TTL_MS;
  }

  function fetchFallbackFromSettings() {
    var sb = window.mittely && window.mittely.sb && window.mittely.sb();
    if (!sb) return Promise.resolve(DEFAULT_FALLBACK);
    return sb.from('settings').select('svalue').eq('skey', FALLBACK_KEY).maybeSingle()
      .then(function (res) {
        var v = res && res.data && res.data.svalue;
        var num = parseFloat(v);
        return isFinite(num) && num > 0 ? num : DEFAULT_FALLBACK;
      })
      .catch(function () { return DEFAULT_FALLBACK; });
  }

  var state = {
    rate: DEFAULT_FALLBACK,
    source: 'default',
    loading: null
  };

  function refresh() {
    if (state.loading) return state.loading;

    var cached = readCache();
    if (isFresh(cached)) {
      state.rate = cached.rate;
      state.source = 'cache';
      emit();
      return Promise.resolve(state.rate);
    }

    state.loading = fetch(ENDPOINT, { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (json) {
        var rate = json && json.rates && json.rates.GHS;
        var num = parseFloat(rate);
        if (!isFinite(num) || num <= 0) throw new Error('bad rate');
        state.rate = num;
        state.source = 'live';
        writeCache(num);
        emit();
        return num;
      })
      .catch(function () {
        return fetchFallbackFromSettings().then(function (fallback) {
          state.rate = fallback;
          state.source = 'fallback';
          emit();
          return fallback;
        });
      })
      .finally(function () { state.loading = null; });

    return state.loading;
  }

  function emit() {
    document.dispatchEvent(new CustomEvent('mittely:fx-updated', {
      detail: { rate: state.rate, source: state.source }
    }));
  }

  function currentRate() {
    var cached = readCache();
    if (isFresh(cached)) return cached.rate;
    return state.rate || DEFAULT_FALLBACK;
  }

  function format(usd, currency) {
    var cur = currency || (localStorage.getItem('mittely-currency') || 'USD');
    var amount = Number(usd || 0);
    try {
      if (cur === 'GHS') {
        var value = amount * currentRate();
        return new Intl.NumberFormat('en-GH', {
          style: 'currency', currency: 'GHS',
          minimumFractionDigits: 2, maximumFractionDigits: 2
        }).format(value);
      }
      return new Intl.NumberFormat('en-US', {
        style: 'currency', currency: 'USD',
        minimumFractionDigits: 2, maximumFractionDigits: 2
      }).format(amount);
    } catch (e) {
      return (cur === 'GHS' ? 'GH₵ ' : '$') + amount.toFixed(2);
    }
  }

  function onReady(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  onReady(function () {
    refresh().then(function () {
      // Re-render prices across the page when rate changes.
      document.dispatchEvent(new CustomEvent('mittely:fx-ready', { detail: { rate: currentRate() } }));
    });
  });

  window.mittelyCurrency = {
    refresh: refresh,
    format: format,
    currentRate: currentRate,
    get rate() { return currentRate(); }
  };
})();