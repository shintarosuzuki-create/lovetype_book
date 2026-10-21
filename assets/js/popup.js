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
