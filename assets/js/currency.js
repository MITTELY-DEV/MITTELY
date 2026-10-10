/* ============================================
   MITTELY — currency.js
   Live USD→GHS rate, localStorage cache (6h TTL),
   fallback to settings.fx_fallback_rate, switcher,
   convert() + formatMoney delegation.
   ============================================ */
(function () {
  'use strict';

  if (!window.MITTELY) window.MITTELY = {};

  var STORAGE_KEY = 'mittely-currency';
  var RATE_KEY = 'mittely_fx_rate';
  var TTL = 6 * 60 * 60 * 1000; /* 6 hours */
  var API_URL = 'https://open.er-api.com/v6/latest/USD';
  var FALLBACK_DEFAULT = 15.50;

  var state = {
    current: 'USD',
    rate: FALLBACK_DEFAULT,
    rateLoaded: false
  };

  /* ---------- Storage helpers ---------- */

  function readRateCache() {
    try {
      var raw = localStorage.getItem(RATE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || !parsed.rate || !parsed.ts) return null;
      if (Date.now() - parsed.ts > TTL) return null;
      return parsed.rate;
    } catch (e) { return null; }
  }

  function writeRateCache(rate) {
    try {
      localStorage.setItem(RATE_KEY, JSON.stringify({ rate: rate, ts: Date.now() }));
    } catch (e) {}
  }

  function readCurrent() {
    try {
      var c = localStorage.getItem(STORAGE_KEY);
      if (c === 'GHS' || c === 'USD') return c;
    } catch (e) {}
    return 'USD';
  }

  function writeCurrent(c) {
    try { localStorage.setItem(STORAGE_KEY, c); } catch (e) {}
  }

  /* ---------- Rate loading ---------- */

  async function loadFallbackRate() {
    try {
      if (!window.MITTELY.supabase) return FALLBACK_DEFAULT;
      var res = await window.MITTELY.supabase
        .from('settings').select('svalue').eq('skey', 'fx_fallback_rate').maybeSingle();
      var val = res && res.data && res.data.svalue ? parseFloat(res.data.svalue) : NaN;
      return isFinite(val) && val > 0 ? val : FALLBACK_DEFAULT;
    } catch (e) {
      return FALLBACK_DEFAULT;
    }
  }

  async function fetchLiveRate() {
    try {
      var res = await fetch(API_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error('Bad response');
      var data = await res.json();
      var rate = data && data.rates && data.rates.GHS ? parseFloat(data.rates.GHS) : NaN;
      if (!isFinite(rate) || rate <= 0) throw new Error('Bad rate');
      return rate;
    } catch (e) {
      return null;
    }
  }

  async function ensureRate() {
    if (state.rateLoaded) return state.rate;

    var cached = readRateCache();
    if (cached) {
      state.rate = cached;
      state.rateLoaded = true;
      return state.rate;
    }

    var live = await fetchLiveRate();
    if (live) {
      state.rate = live;
      state.rateLoaded = true;
      writeRateCache(live);
      return state.rate;
    }

    var fb = await loadFallbackRate();
    state.rate = fb;
    state.rateLoaded = true;
    writeRateCache(fb);
    return state.rate;
  }

  /* ---------- Public API ---------- */

  function getCurrent() { return state.current; }

  function getRate() { return state.rate; }

  function convert(usd) {
    var n = Number(usd) || 0;
    if (state.current === 'GHS') return n * state.rate;
    return n;
  }

  /* Delegates to main.formatMoney if available, otherwise handles itself */
  function formatMoney(usd) {
    if (window.MITTELY.main && typeof window.MITTELY.main.formatMoney === 'function') {
      return window.MITTELY.main.formatMoney(usd, state.current);
    }
    var n = convert(usd);
    try {
      return new Intl.NumberFormat(state.current === 'GHS' ? 'en-GH' : 'en-US', {
        style: 'currency',
        currency: state.current,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(n);
    } catch (e) {
      return (state.current === 'GHS' ? 'GH₵ ' : '$') + n.toFixed(2);
    }
  }

  function setCurrency(code) {
    if (code !== 'USD' && code !== 'GHS') return;
    state.current = code;
    writeCurrent(code);
    renderSwitchers();
    refreshPrices();
    document.dispatchEvent(new CustomEvent('mittely:currency-changed', { detail: { currency: code } }));
  }

  function refreshPrices() {
    document.querySelectorAll('[data-price-usd]').forEach(function (el) {
      var usd = parseFloat(el.getAttribute('data-price-usd'));
      if (isFinite(usd)) el.textContent = formatMoney(usd);
    });
  }

  function renderSwitchers() {
    document.querySelectorAll('.currency-switcher').forEach(function (wrap) {
      wrap.querySelectorAll('.currency-btn').forEach(function (btn) {
        var cur = btn.getAttribute('data-currency');
        btn.classList.toggle('active', cur === state.current);
      });
    });
  }

  function bindSwitchers() {
    document.querySelectorAll('.currency-switcher').forEach(function (wrap) {
      if (wrap.dataset.bound === '1') return;
      wrap.dataset.bound = '1';
      wrap.querySelectorAll('.currency-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var cur = btn.getAttribute('data-currency');
          if (cur) setCurrency(cur);
        });
      });
    });
  }

  /* ---------- Init ---------- */

  async function init() {
    state.current = readCurrent();
    renderSwitchers();
    bindSwitchers();
    document.addEventListener('mittely:currency-changed', function () {
      renderSwitchers();
    });
    await ensureRate();
    refreshPrices();
  }

  window.MITTELY.currency = {
    getCurrent: getCurrent,
    getRate: getRate,
    convert: convert,
    formatMoney: formatMoney,
    setCurrency: setCurrency,
    refreshPrices: refreshPrices,
    ensureRate: ensureRate,
    init: init
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();