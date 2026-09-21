/** 入力ページ（index.html）の制御。 */
(function () {
  const form = document.getElementById('license-form');
  const nameInput = document.getElementById('name');
  const typeSelect = document.getElementById('type');

  // 16タイプをセレクトに流し込む
  for (const t of LOVE_TYPES) {
    const opt = document.createElement('option');
    opt.value = t.code;
    opt.textContent = `${t.nickname}（${t.code}）`;
    typeSelect.appendChild(opt);
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const name = nameInput.value.trim();
    if (!name) {
      nameInput.focus();
      nameInput.setCustomValidity('お名前を入力してください');
      nameInput.reportValidity();
      return;
    }
    if (!typeSelect.value) {
      typeSelect.focus();
      typeSelect.setCustomValidity('ラブタイプを選んでください');
      typeSelect.reportValidity();
      return;
    }

    // 交付日は発行した当日を使うので、URLには載せない
    const params = new URLSearchParams({ name, type: typeSelect.value });
    location.href = `result.html?${params.toString()}`;
  });

  // 入力し直したらカスタムエラーを解除する
  [nameInput, typeSelect].forEach((el) => {
    el.addEventListener('input', () => el.setCustomValidity(''));
  });
})();
