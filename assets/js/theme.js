/* ============================================
   MITTELY — theme.js
   Light/dark toggle with FA icon swap + persistence
   ============================================ */
(function () {
  'use strict';

  if (!window.MITTELY) window.MITTELY = {};

  var STORAGE_KEY = 'mittely-theme';

  function current() {
    return document.documentElement.dataset.theme || 'light';
  }

  function apply(theme) {
    if (theme !== 'light' && theme !== 'dark') theme = 'light';
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(STORAGE_KEY, theme); } catch (e) {}
    updateIcons(theme);
  }

  function toggle() {
    apply(current() === 'light' ? 'dark' : 'light');
  }

  function updateIcons(theme) {
    document.querySelectorAll('[data-theme-toggle]').forEach(function (btn) {
      var icon = btn.querySelector('i');
      if (!icon) return;
      if (theme === 'dark') {
        icon.className = 'fa-solid fa-sun';
        btn.setAttribute('aria-label', 'Switch to light mode');
      } else {
        icon.className = 'fa-solid fa-moon';
        btn.setAttribute('aria-label', 'Switch to dark mode');
      }
    });
  }

  function injectButton() {
    var navActions = document.querySelector('.nav-actions');
    if (!navActions || document.querySelector('[data-theme-toggle]')) return;
    var btn = document.createElement('button');
    btn.className = 'icon-btn';
    btn.setAttribute('data-theme-toggle', '');
    btn.setAttribute('aria-label', 'Toggle theme');
    btn.innerHTML = '<i class="fa-solid fa-moon"></i>';
    btn.addEventListener('click', toggle);
    var first = navActions.firstChild;
    if (first) navActions.insertBefore(btn, first);
    else navActions.appendChild(btn);
  }

  function init() {
    apply(current());
    injectButton();
    updateIcons(current());
  }

  window.MITTELY.theme = {
    current: current,
    apply: apply,
    toggle: toggle,
    init: init
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();