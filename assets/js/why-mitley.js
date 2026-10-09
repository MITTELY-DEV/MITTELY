/* ============================================================
   MITTELY — why-mitley.js
   Animated accordion for FAQ + mirrors content as FAQPage JSON-LD.
   ============================================================ */

(function () {
  'use strict';

  var utils = (window.MITTELY && window.MITTELY.utils) || {};
  var esc = utils.escapeHtml || function (s) { return String(s == null ? '' : s); };

  function bindAccordion() {
    var accordion = document.getElementById('faq-accordion');
    if (!accordion) return;

    accordion.addEventListener('click', function (e) {
      var trigger = e.target.closest('.accordion-trigger');
      if (!trigger) return;

      var item = trigger.closest('.accordion-item');
      var panel = item.querySelector('.accordion-panel');
      var isOpen = item.classList.contains('open');

      // Close all others (single-open accordion)
      accordion.querySelectorAll('.accordion-item').forEach(function (other) {
        if (other !== item && other.classList.contains('open')) {
          other.classList.remove('open');
          var otherTrigger = other.querySelector('.accordion-trigger');
          var otherPanel = other.querySelector('.accordion-panel');
          if (otherTrigger) otherTrigger.setAttribute('aria-expanded', 'false');
          if (otherPanel) otherPanel.hidden = true;
        }
      });

      if (isOpen) {
        item.classList.remove('open');
        trigger.setAttribute('aria-expanded', 'false');
        panel.hidden = true;
      } else {
        item.classList.add('open');
        trigger.setAttribute('aria-expanded', 'true');
        panel.hidden = false;
      }
    });

    // Keyboard support
    accordion.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var trigger = e.target.closest('.accordion-trigger');
      if (!trigger) return;
      e.preventDefault();
      trigger.click();
    });
  }

  function injectFAQJSONLD() {
    var accordion = document.getElementById('faq-accordion');
    if (!accordion) return;

    var items = [];
    accordion.querySelectorAll('.accordion-item').forEach(function (item) {
      var trigger = item.querySelector('.accordion-trigger');
      var panel = item.querySelector('.accordion-panel');
      if (!trigger || !panel) return;
      var question = (trigger.querySelector('span:first-child') || trigger).textContent.trim();
      var answer = (panel.textContent || '').trim();
      if (question && answer) {
        items.push({
          '@type': 'Question',
          name: question,
          acceptedAnswer: {
            '@type': 'Answer',
            text: answer
          }
        });
      }
    });

    if (!items.length) return;

    var data = {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: items
    };

    var script = document.createElement('script');
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify(data);
    document.head.appendChild(script);
  }

  function init() {
    bindAccordion();
    injectFAQJSONLD();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();