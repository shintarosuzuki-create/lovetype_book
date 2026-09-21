/**
 * ラブタイプ恋愛免許証 画像ジェネレーター
 *
 * 仕組み:
 *   assets/licenses/<CODE>.png（タイプごとの完成画像）を読み込み、
 *   その上に「氏名」と「交付日」だけを重ねて 1枚の PNG を作る。
 *
 * 完成画像が未配置のタイプは、準備中プレースホルダーを描画する。
 * 画像を assets/licenses/ に置けば、コード変更なしで自動的に切り替わる。
 */

/** 座標の基準となる完成画像のサイズ。実画像がこれ以外でも自動でスケールする。 */
const BASE_W = 1080;
const BASE_H = 1920;

/**
 * 完成画像に文字を載せる位置（BASE_W x BASE_H 基準）。
 * サンプル（忠犬ハチ公）の枠を実測した値。
 * 差し替える画像でレイアウトがずれる場合は、ここか LAYOUT_OVERRIDES を直す。
 */
const LAYOUT = {
  /** 氏名欄（空欄なので、そのまま中央に書き込む） */
  name: { x: 145, y: 905, w: 520, h: 50, size: 36 },
  /** 交付日欄（「2026年　月　日交付」が印刷済みなので、一度塗りつぶしてから書き直す） */
  date: { x: 669, y: 907, w: 339, h: 46, size: 26, clear: '#ffffff' },
};

/** タイプごとに枠位置が違う場合だけ、ここに差分を書く（例: FCPE: { name: { y: 910 } }）。 */
const LAYOUT_OVERRIDES = {};

const PALETTE = {
  bg1: '#fff2f6',
  bg2: '#ffe3ec',
  pink: '#f4749e',
  pinkDeep: '#e2537f',
  pinkSoft: '#ffd6e3',
  yellow: '#fff27a',
  ink: '#2f2b2c',
  line: '#3a3436',
  white: '#ffffff',
};

const JP = '"M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", "Yu Gothic", "Meiryo", sans-serif';
const EN = '"Baloo 2", "M PLUS Rounded 1c", sans-serif';

const font = (weight, size, family = JP) => `${weight} ${size}px ${family}`;

/* ------------------------------------------------------------------ *
 * 汎用ヘルパー
 * ------------------------------------------------------------------ */

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function heartPath(ctx, cx, cy, size) {
  const s = size / 16;
  ctx.beginPath();
  ctx.moveTo(cx, cy + 5 * s);
  ctx.bezierCurveTo(cx - 9 * s, cy - 2 * s, cx - 7 * s, cy - 10 * s, cx, cy - 5 * s);
  ctx.bezierCurveTo(cx + 7 * s, cy - 10 * s, cx + 9 * s, cy - 2 * s, cx, cy + 5 * s);
  ctx.closePath();
}

/** maxWidth に収まるまでフォントサイズを落として描画する。 */
function fitText(ctx, text, x, y, maxWidth, size, weight = 700, family = JP, align = 'left') {
  let s = size;
  ctx.font = font(weight, s, family);
  while (ctx.measureText(text).width > maxWidth && s > 8) {
    s -= 1;
    ctx.font = font(weight, s, family);
  }
  ctx.textAlign = align;
  ctx.fillText(text, x, y);
  ctx.textAlign = 'left';
  return s;
}

/** 名前・タイプ・日付から毎回同じ免許番号を作る。 */
function makeLicenseNo(name, code, date) {
  const seed = `${name}|${code}|${date.toISOString().slice(0, 10)}`;
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  const yy = String(date.getFullYear()).slice(2);
  const mmdd = String(date.getMonth() + 1).padStart(2, '0') + String(date.getDate()).padStart(2, '0');
  return `${yy}-${mmdd}-${String(h % 10000).padStart(4, '0')}`;
}

/** 完成画像を読み込む。未配置なら null を返す。 */
function loadLicenseArtwork(code) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = `assets/licenses/${code}.png`;
  });
}

/** Canvas で使う文字を渡して、必要なフォントサブセットを確実に読み込ませる。 */
async function ensureFonts(sample) {
  if (!document.fonts) return;
  const jobs = [
    document.fonts.load(font(500, 24), sample),
    document.fonts.load(font(700, 24), sample),
    document.fonts.load(font(800, 24), sample),
    document.fonts.load(font(800, 150, EN), 'Love License'),
  ];
  await Promise.all(jobs.map((p) => p.catch(() => null)));
  await document.fonts.ready;
}

/* ------------------------------------------------------------------ *
 * 完成画像への文字入れ
 * ------------------------------------------------------------------ */

function layoutFor(code) {
  const o = LAYOUT_OVERRIDES[code] || {};
  return {
    name: { ...LAYOUT.name, ...(o.name || {}) },
    date: { ...LAYOUT.date, ...(o.date || {}) },
  };
}

/** 枠の中央にテキストを1行入れる。box.clear があれば先に塗りつぶす。 */
function fillBox(ctx, box, text, scale) {
  const x = box.x * scale;
  const y = box.y * scale;
  const w = box.w * scale;
  const h = box.h * scale;

  if (box.clear) {
    ctx.fillStyle = box.clear;
    ctx.fillRect(x, y, w, h);
  }

  ctx.fillStyle = PALETTE.ink;
  ctx.textBaseline = 'middle';
  fitText(ctx, text, x + w / 2, y + h / 2 + scale, w - 28 * scale, box.size * scale, 800, JP, 'center');
  ctx.textBaseline = 'alphabetic';
}

/* ------------------------------------------------------------------ *
 * 完成画像が無いタイプ向けのプレースホルダー
 * ------------------------------------------------------------------ */

function drawPlaceholderBackground(ctx) {
  const g = ctx.createLinearGradient(0, 0, 0, BASE_H);
  g.addColorStop(0, PALETTE.bg1);
  g.addColorStop(1, PALETTE.bg2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, BASE_W, BASE_H);

  const dot = (ox, oy, cols, rows) => {
    ctx.fillStyle = 'rgba(244,116,158,0.22)';
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        ctx.beginPath();
        ctx.arc(ox + c * 26, oy + r * 26, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  };
  dot(30, 30, 9, 5);
  dot(BASE_W - 250, 40, 9, 4);
  dot(40, BASE_H - 190, 9, 5);
  dot(BASE_W - 250, BASE_H - 250, 9, 6);

  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.arc(150, 1660, 130, 0, Math.PI * 2);
  ctx.stroke();

  const hearts = [
    [300, 60, 46, 0.5], [880, 160, 34, 0.45], [70, 420, 54, 0.5],
    [1015, 470, 40, 0.4], [60, 760, 30, 0.45], [1000, 1560, 46, 0.5],
    [190, 1600, 40, 0.45], [640, 1690, 36, 0.4], [90, 1840, 42, 0.5],
    [900, 1840, 50, 0.45], [420, 1780, 28, 0.4],
  ];
  for (const [x, y, s, a] of hearts) {
    ctx.fillStyle = `rgba(255,150,183,${a})`;
    heartPath(ctx, x, y, s);
    ctx.fill();
  }
}

function drawPlaceholder(ctx, type, data) {
  drawPlaceholderBackground(ctx);

  // タイトル
  ctx.textAlign = 'center';
  ctx.font = font(800, 150, EN);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = PALETTE.white;
  ctx.lineWidth = 22;
  ctx.strokeText('Love License', BASE_W / 2, 560);
  ctx.fillStyle = PALETTE.pink;
  ctx.fillText('Love License', BASE_W / 2, 560);
  ctx.textAlign = 'left';

  ctx.fillStyle = PALETTE.pink;
  fitText(ctx, '＼ラブタイプ恋愛免許証／', BASE_W / 2, 430, 600, 46, 800, JP, 'center');

  // 白いカード
  const X = 68;
  const W = BASE_W - X * 2;
  const Y = 780;
  const H = 560;
  ctx.save();
  ctx.shadowColor = 'rgba(214,120,150,0.25)';
  ctx.shadowBlur = 26;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = PALETTE.white;
  roundRect(ctx, X, Y, W, H, 30);
  ctx.fill();
  ctx.restore();

  const rows = [
    ['氏名', data.name],
    ['タイプ', `${type.nickname}（${type.code}）`],
    ['交付日', data.dateLabel],
    ['免許番号', `第 ${data.licenseNo} 号`],
  ];
  const rx = X + 40;
  const rw = W - 80;
  const rh = 76;
  ctx.textBaseline = 'middle';
  rows.forEach(([label, value], i) => {
    const ry = Y + 56 + i * rh;
    ctx.strokeStyle = PALETTE.pinkSoft;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(rx, ry + rh - 8);
    ctx.lineTo(rx + rw, ry + rh - 8);
    ctx.stroke();
    ctx.fillStyle = PALETTE.pinkDeep;
    fitText(ctx, label, rx, ry + rh / 2 - 6, 220, 28, 800);
    ctx.fillStyle = PALETTE.ink;
    fitText(ctx, value, rx + rw, ry + rh / 2 - 6, rw - 250, 34, 800, JP, 'right');
  });

  // 準備中の注意書き
  const ny = Y + 56 + rows.length * rh + 20;
  ctx.fillStyle = '#fff7da';
  roundRect(ctx, rx, ny, rw, 92, 14);
  ctx.fill();
  ctx.fillStyle = '#8a6d1f';
  fitText(ctx, 'このタイプの免許証デザインは準備中です', rx + rw / 2, ny + 34, rw - 40, 30, 800, JP, 'center');
  fitText(ctx, '完成しだい、この画像に差し替わります', rx + rw / 2, ny + 68, rw - 40, 24, 500, JP, 'center');

  ctx.fillStyle = PALETTE.pinkDeep;
  fitText(ctx, type.catch, BASE_W / 2, 1440, 900, 34, 700, JP, 'center');
  ctx.textBaseline = 'alphabetic';
}

/* ------------------------------------------------------------------ *
 * エントリポイント
 * ------------------------------------------------------------------ */

/**
 * 免許証画像を描画する。
 * @param {HTMLCanvasElement} canvas
 * @param {{name: string, code: string, date?: Date}} input
 * @returns {Promise<{licenseNo: string, type: object, hasArtwork: boolean}>}
 */
async function renderLicense(canvas, input) {
  const type = LOVE_TYPE_MAP[input.code] || LOVE_TYPES[0];
  const date = input.date || new Date();
  const name = (input.name || '').trim() || 'ななしさん';

  const data = {
    name,
    dateLabel: `${date.getFullYear()}年 ${date.getMonth() + 1}月 ${date.getDate()}日交付`,
    licenseNo: makeLicenseNo(name, type.code, date),
  };

  const [artwork] = await Promise.all([
    loadLicenseArtwork(type.code),
    ensureFonts(`${name}${data.dateLabel}${type.nickname}${type.catch}氏名タイプ交付日免許番号第号このタイプの免許証デザインは準備中です完成しだい、この画像に差し替わります＼ラブタイプ恋愛免許証／`),
  ]);

  canvas.width = artwork ? artwork.width : BASE_W;
  canvas.height = artwork ? artwork.height : BASE_H;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (artwork) {
    ctx.drawImage(artwork, 0, 0);
    const scale = artwork.width / BASE_W;
    const layout = layoutFor(type.code);
    fillBox(ctx, layout.name, data.name, scale);
    fillBox(ctx, layout.date, data.dateLabel, scale);
  } else {
    drawPlaceholder(ctx, type, data);
  }

  return { licenseNo: data.licenseNo, type, hasArtwork: Boolean(artwork) };
}
