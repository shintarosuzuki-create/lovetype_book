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

  // 合言葉を通していない場合は、結果ページに直接来ても中身を出さない
  if (!Gate.isUnlocked()) {
    loading.remove();
    fail('このページは合言葉を入力した方限定です。<br><a href="index.html">入力ページ</a>から合言葉を入力してください。');
    document.querySelectorAll('.panel').forEach((el) => { el.hidden = true; });
    return;
  }

  const params = new URLSearchParams(location.search);
  const name = (params.get('name') || '').trim().slice(0, 12);
  const code = (params.get('type') || '').toUpperCase();
  const date = new Date(); // 交付日は常に発行した当日

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

  // ---- 共有リンク（テキスト + サイトURL） ----
  const shareText = `${caption}\n`;
  $('share-x').href =
    `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(SITE_URL)}`;
  $('share-line').href =
    `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(SITE_URL)}&text=${encodeURIComponent(shareText)}`;

  // ---- 取扱説明書（タイプごとのPDF） ----
  // ファイルは assets/manuals/<CODE>.pdf に置く。
  // 保存時のファイル名は download 属性で「書籍予約特典_◯◯の取扱説明書.pdf」に差し替える。
  (async () => {
    const link = $('manual-link');
    const href = `assets/manuals/${type.code}.pdf`;
    link.href = href;
    link.download = `書籍予約特典_${type.nickname}の取扱説明書.pdf`;

    let exists = false;
    try {
      const res = await fetch(href, { method: 'HEAD' });
      exists = res.ok;
    } catch {
      exists = false; // 取得できないときは未配置として扱う
    }
    link.hidden = !exists;
    $('manual-note').hidden = exists;
  })();

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

      // 画像ファイルごと共有できる端末か（Instagramボタンの挙動を切り替える）
      const file = new File([blob], fileName, { type: 'image/png' });
      const canShareImage = Boolean(navigator.canShare && navigator.canShare({ files: [file] }));

      async function shareImage() {
        await navigator.share({ files: [file], text: `${caption}\n${SITE_URL}` });
      }

      // Instagram はWeb上から投稿を作るURLが提供されていないため、
      // 共有シート（Instagramが選べる）か、保存してアプリで投稿する導線にする。
      $('share-ig').addEventListener('click', async () => {
        if (canShareImage) {
          try {
            await shareImage();
            return;
          } catch (err) {
            if (err && err.name === 'AbortError') return;
          }
        }
        download.click(); // 画像を保存してから、Instagramで投稿してもらう
        showToast('画像を保存しました。Instagramで投稿してください');
      });
    })
    .catch((err) => {
      console.error(err);
      loading.remove();
      fail('免許証の作成に失敗しました。ページを再読み込みしてください。');
    });
})();
