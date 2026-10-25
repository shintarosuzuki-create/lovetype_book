/*
 * 一般向けLP（popup.html）
 * スクロール位置に合わせて、上部メニューの「いま見ているセクション」のボタンを強調する。
 */
(function () {
  'use strict';

  var links = Array.prototype.slice.call(document.querySelectorAll('.nav__btn'));
  var sections = links.map(function (a) {
    return document.querySelector(a.getAttribute('href'));
  });

  function update() {
    // メニューの少し下を基準線にして、それより上に始まっている最後のセクションを「いま」とする
    var line = document.querySelector('.nav').offsetHeight + 40;
    var current = 0;
    sections.forEach(function (sec, i) {
      if (sec && sec.getBoundingClientRect().top <= line) current = i;
    });
    links.forEach(function (a, i) {
      a.classList.toggle('is-current', i === current);
      if (i === current) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    });
  }

  var ticking = false;
  window.addEventListener('scroll', function () {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(function () {
      update();
      ticking = false;
    });
  }, { passive: true });
  window.addEventListener('resize', update);
  update();
})();

/*
 * コラボカフェのタブ（メニュー／ギャラリー）の切り替え。
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
