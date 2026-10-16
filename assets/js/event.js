/*
 * イベント招待ページ（event.html）
 *  - 申し込みリンクの設定
 *  - 48時間カウントダウン（初回アクセス時刻を端末に保存して、再訪問しても同じ残り時間を出す）
 *  - ギャラリー（画像・動画）とタップで拡大表示
 */
(function () {
  'use strict';

  /* ================= 設定（ここだけ書き換えればOK） ================= */

  // 予約ツールの URL
  var RESERVE_URL = '#';

  // 初回アクセスから何時間で締め切るか
  var TIMER_HOURS = 48;

  // 締め切り時刻を保存するキー。全員のタイマーをリセットしたいときは末尾の番号を変える
  var STORAGE_KEY = 'lt-event-deadline-v1';

  // ギャラリー。assets/event/ にファイルを置き、ここに並べる。
  //   type   : 'image' か 'video'
  //   src    : ファイルの場所
  //   poster : 動画のサムネイル画像（省略可。省略時は動画の先頭コマ）
  //   caption: 画面には出さない。読み上げ・代替テキスト用の名前
  // ファイルがまだ無い項目は「準備中」の枠が表示される。
  var GALLERY = [
    { type: 'image', src: 'assets/event/special-guide.jpg', caption: '特別なご案内' },
    { type: 'video', src: 'assets/event/cafe-pr.mp4', poster: 'assets/event/cafe-pr-poster.jpg', caption: 'ラブタイプ診断コラボカフェPR動画' }
  ];

  /* ================= 申し込みリンク ================= */

  var applyLink = document.getElementById('apply-link');
  var applyClosed = document.getElementById('apply-closed');
  applyLink.href = RESERVE_URL;

  /* ================= カウントダウン ================= */

  // localStorage が使えない環境（一部のプライベートブラウズ等）では Cookie に保存する
  function loadDeadline() {
    try {
      var v = window.localStorage.getItem(STORAGE_KEY);
      if (v) return Number(v);
    } catch (e) { /* 使えなければ Cookie へ */ }
    var m = document.cookie.match(new RegExp('(?:^|; )' + STORAGE_KEY + '=(\\d+)'));
    return m ? Number(m[1]) : NaN;
  }

  function saveDeadline(ms) {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(ms));
    } catch (e) { /* Cookie だけでも残す */ }
    document.cookie = STORAGE_KEY + '=' + ms + '; max-age=' + (60 * 60 * 24 * 365) + '; path=/; SameSite=Lax';
  }

  var deadline = loadDeadline();
  if (!isFinite(deadline) || deadline <= 0) {
    deadline = Date.now() + TIMER_HOURS * 60 * 60 * 1000;
    saveDeadline(deadline);
  }

  var nums = {};
  Array.prototype.forEach.call(document.querySelectorAll('.countdown__num'), function (el) {
    nums[el.getAttribute('data-unit')] = el;
  });

  function pad(n) {
    return n < 10 ? '0' + n : String(n);
  }

  var timerId = null;

  function render() {
    var left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    nums.d.textContent = pad(Math.floor(left / 86400));
    nums.h.textContent = pad(Math.floor(left % 86400 / 3600));
    nums.m.textContent = pad(Math.floor(left % 3600 / 60));
    nums.s.textContent = pad(left % 60);

    if (left === 0) {
      applyLink.hidden = true;
      applyClosed.hidden = false;
      document.getElementById('countdown').classList.add('is-over');
      if (timerId) clearInterval(timerId);
    }
  }

  render();
  // 毎回「締め切り − 現在時刻」で計算するので、タブを裏に回してもずれない
  if (applyClosed.hidden) timerId = setInterval(render, 1000);

  /* ================= ギャラリー ================= */

  var galleryEl = document.getElementById('gallery');

  function placeholder(item) {
    var div = document.createElement('div');
    div.className = 'gallery__placeholder';
    div.textContent = item.type === 'video' ? '動画 準備中' : '画像 準備中';
    return div;
  }

  GALLERY.forEach(function (item, i) {
    var li = document.createElement('li');
    li.className = 'gallery__item gallery__item--' + item.type;

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'gallery__thumb';
    btn.setAttribute('aria-label', item.caption + 'を拡大して見る');

    var media;
    if (item.type === 'video') {
      if (item.poster) {
        media = document.createElement('img');
        media.src = item.poster;
      } else {
        media = document.createElement('video');
        media.src = item.src + '#t=0.1';
        media.muted = true;
        media.playsInline = true;
        media.preload = 'metadata';
      }
      var play = document.createElement('span');
      play.className = 'gallery__play';
      play.setAttribute('aria-hidden', 'true');
      btn.appendChild(play);
    } else {
      media = document.createElement('img');
      media.src = item.src;
      media.loading = 'lazy';
    }
    media.alt = '';
    media.className = 'gallery__media';
    media.addEventListener('error', function () {
      btn.innerHTML = '';
      btn.appendChild(placeholder(item));
      btn.disabled = true;
    });
    btn.insertBefore(media, btn.firstChild);
    btn.addEventListener('click', function () { openLightbox(i); });

    li.appendChild(btn);
    galleryEl.appendChild(li);
  });

  /* ================= 拡大表示 ================= */

  var lightbox = document.getElementById('lightbox');
  var stage = document.getElementById('lightbox-stage');
  var current = 0;
  var lastFocus = null;

  // 拡大表示できる（ファイルが存在する）項目だけを順に回る
  function availableIndexes() {
    var thumbs = galleryEl.querySelectorAll('.gallery__thumb');
    var list = [];
    Array.prototype.forEach.call(thumbs, function (t, i) {
      if (!t.disabled) list.push(i);
    });
    return list;
  }

  function show(i) {
    current = i;
    var item = GALLERY[i];
    stage.innerHTML = '';
    var el;
    if (item.type === 'video') {
      el = document.createElement('video');
      el.src = item.src;
      el.controls = true;
      el.playsInline = true;
      el.autoplay = true;
      if (item.poster) el.poster = item.poster;
    } else {
      el = document.createElement('img');
      el.src = item.src;
      el.alt = item.caption;
    }
    stage.appendChild(el);
  }

  function step(dir) {
    var list = availableIndexes();
    if (list.length < 2) return;
    var pos = list.indexOf(current);
    show(list[(pos + dir + list.length) % list.length]);
  }

  function openLightbox(i) {
    lastFocus = document.activeElement;
    show(i);
    lightbox.hidden = false;
    document.body.classList.add('is-locked');
    var single = availableIndexes().length < 2;
    document.getElementById('lightbox-prev').hidden = single;
    document.getElementById('lightbox-next').hidden = single;
    document.getElementById('lightbox-close').focus();
  }

  function closeLightbox() {
    lightbox.hidden = true;
    stage.innerHTML = ''; // 動画を止める
    document.body.classList.remove('is-locked');
    if (lastFocus) lastFocus.focus();
  }

  document.getElementById('lightbox-close').addEventListener('click', closeLightbox);
  document.getElementById('lightbox-prev').addEventListener('click', function () { step(-1); });
  document.getElementById('lightbox-next').addEventListener('click', function () { step(1); });
  lightbox.addEventListener('click', function (e) {
    if (e.target === lightbox || e.target === stage) closeLightbox();
  });
  document.addEventListener('keydown', function (e) {
    if (lightbox.hidden) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') step(-1);
    if (e.key === 'ArrowRight') step(1);
  });

  // スワイプで前後に切り替え
  var touchX = null;
  stage.addEventListener('touchstart', function (e) {
    touchX = e.touches[0].clientX;
  }, { passive: true });
  stage.addEventListener('touchend', function (e) {
    if (touchX === null) return;
    var dx = e.changedTouches[0].clientX - touchX;
    touchX = null;
    if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
  });
})();
