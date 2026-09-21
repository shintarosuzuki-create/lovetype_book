/** 入力ページ（index.html）の制御。 */
(function () {
  const form = document.getElementById('license-form');
  const nameInput = document.getElementById('name');
  const typeSelect = document.getElementById('type');
  const dateInput = document.getElementById('date');
  const note = document.getElementById('type-note');

  // 16タイプをセレクトに流し込む
  for (const t of LOVE_TYPES) {
    const opt = document.createElement('option');
    opt.value = t.code;
    opt.textContent = `${t.nickname}（${t.code}）`;
    typeSelect.appendChild(opt);
  }

  typeSelect.addEventListener('change', () => {
    const t = LOVE_TYPE_MAP[typeSelect.value];
    note.textContent = t ? `💗 ${t.catch}` : '';
  });

  // 交付日の初期値を今日にする
  const today = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  dateInput.value = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

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

    const params = new URLSearchParams({ name, type: typeSelect.value });
    if (dateInput.value) params.set('date', dateInput.value);
    location.href = `result.html?${params.toString()}`;
  });

  // 入力し直したらカスタムエラーを解除する
  [nameInput, typeSelect].forEach((el) => {
    el.addEventListener('input', () => el.setCustomValidity(''));
  });
})();
