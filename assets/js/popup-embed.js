/*
 * event.html に移植したLPセクション用スクリプト。
 * コラボカフェのタブ（メニュー／ギャラリー）の切り替えだけを担当する。
 * （popup.js のスクロール連動ナビは event.html に .nav が無いため含めない）
 */
(function () {
  'use strict';

  var tabs = Array.prototype.slice.call(document.querySelectorAll('.cafe-tab'));
  if (!tabs.length) return;

  function activate(tab) {
    tabs.forEach(function (t) {
      var selected = t === tab;
      t.classList.toggle('is-active', selected);
      t.setAttribute('aria-selected', selected ? 'true' : 'false');
      var panel = document.getElementById(t.getAttribute('aria-controls'));
      if (panel) {
        panel.classList.toggle('is-active', selected);
        if (selected) panel.removeAttribute('hidden');
        else panel.setAttribute('hidden', '');
      }
    });
  }

  tabs.forEach(function (tab, i) {
    tab.addEventListener('click', function () {
      activate(tab);
    });
    tab.addEventListener('keydown', function (e) {
      var next = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = tabs[(i + 1) % tabs.length];
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = tabs[(i - 1 + tabs.length) % tabs.length];
      if (next) {
        e.preventDefault();
        activate(next);
        next.focus();
      }
    });
  });
})();
