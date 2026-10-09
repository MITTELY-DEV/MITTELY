/* MITTELY — theme.js
   Syncs the theme toggle, swaps the sun/moon FA icon, persists the choice. */
(function () {
  'use strict';

  var STORAGE_KEY = 'mittely-theme';

  function currentTheme() {
    return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  }

  function iconFor(theme) {
    return theme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
  }

  function syncButtons() {
    var theme = currentTheme();
    var iconClass = iconFor(theme);
    ['themeToggle', 'adminThemeToggle'].forEach(function (id) {
      var btn = document.getElementById(id);
      if (!btn) return;
      var i = btn.querySelector('i');
      if (i) i.className = iconClass;
      btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
    });
  }

  function apply(theme) {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(STORAGE_KEY, theme); } catch (e) {}
    syncButtons();
  }

  function toggle() {
    apply(currentTheme() === 'dark' ? 'light' : 'dark');
  }

  function onReady(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  onReady(function () {
    syncButtons();
    ['themeToggle', 'adminThemeToggle'].forEach(function (id) {
      var btn = document.getElementById(id);
      if (btn) btn.addEventListener('click', toggle);
    });

    // React to OS-level changes only if the user hasn't chosen explicitly.
    if (window.matchMedia) {
      var mql = window.matchMedia('(prefers-color-scheme: dark)');
      var handler = function (e) {
        if (localStorage.getItem(STORAGE_KEY)) return;
        apply(e.matches ? 'dark' : 'light');
      };
      if (mql.addEventListener) mql.addEventListener('change', handler);
      else if (mql.addListener) mql.addListener(handler);
    }
  });

  window.mittelyTheme = { toggle: toggle, apply: apply, current: currentTheme };
})();