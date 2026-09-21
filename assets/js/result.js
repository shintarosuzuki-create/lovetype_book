/** 結果ページ（result.html）の制御。 */
(function () {
  const SITE_URL = new URL('index.html', location.href).href;
  const HASHTAGS = ['ラブタイプ診断', 'ラブタイプ恋愛免許証'];

  const $ = (id) => document.getElementById(id);
  const container = $('result-image');
  const loading = $('loading');
  const toast = $('toast');

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove('is-visible'), 1800);
  }

  function fail(message) {
    container.innerHTML = `<p class="error">${message}</p>`;
  }

  /** ?date=YYYY-MM-DD をローカル日付として解釈する（UTCずれを避ける）。 */
  function parseDate(value) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
    if (!m) return new Date();
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Number.isNaN(d.getTime()) ? new Date() : d;
  }

  // 合言葉を通していない場合は、結果ページに直接来ても中身を出さない
  if (!Gate.isUnlocked()) {
    loading.remove();
    fail('このページは書籍購入者限定です。<br><a href="index.html">入力ページ</a>で合言葉を入力してください。');
    document.querySelectorAll('.panel').forEach((el) => { el.hidden = true; });
    return;
  }

  const params = new URLSearchParams(location.search);
  const name = (params.get('name') || '').trim().slice(0, 12);
  const code = (params.get('type') || '').toUpperCase();
  const date = parseDate(params.get('date'));

  if (!name || !LOVE_TYPE_MAP[code]) {
    loading.remove();
    fail('免許証の情報が読み取れませんでした。<br><a href="index.html">入力ページ</a>からやり直してください。');
    return;
  }

  const type = LOVE_TYPE_MAP[code];
  const caption = [
    `私のラブタイプは「${type.nickname}」でした！`,
    `${type.catch}`,
    '',
    'ラブタイプ恋愛免許証、交付されました💌',
    '',
    HASHTAGS.map((h) => `#${h}`).join(' '),
  ].join('\n');

  $('headline').innerHTML = `あなたは<span class="marker">${type.nickname}</span>`;
  $('subline').textContent = type.catch;
  $('caption').textContent = caption;

  // ---- 共有リンク（テキスト + サイトURL） ----
  const shareText = `${caption}\n`;
  $('share-x').href =
    `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(SITE_URL)}`;
  $('share-line').href =
    `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(SITE_URL)}&text=${encodeURIComponent(shareText)}`;
  $('share-fb').href =
    `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(SITE_URL)}`;

  $('copy-caption').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(`${caption}\n${SITE_URL}`);
      showToast('投稿文をコピーしました');
    } catch {
      showToast('コピーできませんでした');
    }
  });

  // ---- 免許証を描画 ----
  const canvas = document.createElement('canvas');
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', `${name} さんのラブタイプ恋愛免許証（${type.nickname}）`);

  renderLicense(canvas, { name, code, date })
    .then((result) => {
      loading.remove();
      container.appendChild(canvas);
      $('save-hint').hidden = false;
      // 完成画像がまだ配置されていないタイプは、その旨を伝える
      $('pending-note').hidden = result.hasArtwork;
      return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    })
    .then((blob) => {
      if (!blob) return;

      const fileName = `love-license-${type.code}.png`;
      const url = URL.createObjectURL(blob);
      const download = $('download');
      download.href = url;
      download.download = fileName;

      // 画像そのものを共有できる端末では、それを最優先の導線にする
      const file = new File([blob], fileName, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        const btn = $('share-image');
        btn.hidden = false;
        btn.addEventListener('click', async () => {
          try {
            await navigator.share({ files: [file], text: `${caption}\n${SITE_URL}` });
          } catch (err) {
            if (err && err.name !== 'AbortError') showToast('シェアできませんでした');
          }
        });
      }
    })
    .catch((err) => {
      console.error(err);
      loading.remove();
      fail('免許証の作成に失敗しました。ページを再読み込みしてください。');
    });
})();
