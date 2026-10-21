/**
 * ポップアップ・コラボカフェ招待リスト 自動取り込みスクリプト
 *
 * TimeRex から届く申込・キャンセルの通知メールを読み取り、
 * スプレッドシート「ポップアップ・コラボカフェ招待リスト」に書き込みます。
 *
 *   ・インフルエンサー様限定招待の申込   → 「申込一覧」に1行追加
 *   ・インフルエンサー様限定招待のキャンセル → 「申込一覧」の該当行をキャンセルに更新
 *   ・メディア様内覧会の申込             → 「内覧会予約」に1行追加
 *   ・読み取れなかったメール             → 「未解析メール」に記録
 *
 * 【このスクリプトの特徴】
 *   ・列の位置を決め打ちせず、各シートの1行目（見出し）の名前で書き込み先を決めます。
 *   ・TimeRex のフォームに項目を追加しても、見出しに同じ名前の列があればそこへ、
 *     無ければ見出しの右端に列を自動で追加して書き込みます（他の項目に混ざりません）。
 *   ・紹介者・招待コードから「招待元」（例：あみあん）を自動判定します。
 *     判定のキーワードは下の INVITERS で変更できます。
 *
 * 【使い方】
 *   1. このコードを Apps Script に貼り付けて保存
 *   2. 関数「setup」を一度だけ実行（権限の承認が出たら許可）
 *      → 5分おきの自動実行が設定され、既存行の招待元も判定し直します
 *   3. 以降は自動。手動で今すぐ取り込みたいときは「run」を実行
 */

// ===================== 設定 =====================

/** 招待元の判定ルール。紹介者のSNS・招待コードにキーワードが含まれていれば、その招待元とする（大文字小文字は区別しない） */
const INVITERS = [
  { name: 'あみあん', keywords: ['amian', 'あみあん', 'アミアン', 'anju'] },
];

/** 取り込み対象のメールを探す条件 */
const SEARCH_QUERY = 'from:notifications@timerex.net newer_than:60d';

/** イベント名で振り分け */
const EVENT_INFLUENCER = 'インフルエンサー様限定招待';
const EVENT_MEDIA = 'メディア様内覧会';

const SHEET_APPLY = '申込一覧';
const SHEET_MEDIA = '内覧会予約';
const SHEET_UNPARSED = '未解析メール';
const SHEET_DONE = '_処理済みID';

const TZ = 'Asia/Tokyo';

// ===================== 実行用の関数 =====================

/** 最初に一度だけ実行：自動実行の設定と、既存行の招待元の判定 */
function setup() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('run').timeBased().everyMinutes(5).create();
  rejudgeInviters();
  run();
}

/** メールを取り込む（5分おきに自動実行される） */
function run() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30 * 1000)) return;
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const done = loadDoneIds_(ss);
    const threads = GmailApp.search(SEARCH_QUERY, 0, 200);
    const messages = [];
    threads.forEach(function (th) {
      th.getMessages().forEach(function (m) {
        if (!done.has(m.getId())) messages.push(m);
      });
    });
    messages.sort(function (a, b) { return a.getDate() - b.getDate(); }); // 古い順に処理

    messages.forEach(function (m) {
      let handled;
      try {
        handled = handleMessage_(ss, m);
      } catch (e) {
        logUnparsed_(ss, m, 'エラー: ' + e.message);
        handled = true;
      }
      if (handled !== null) markDone_(ss, m.getId());
    });
  } finally {
    lock.releaseLock();
  }
}

/** 申込一覧の全行について、招待元を判定し直す（判定ルールを変えたときに実行） */
function rejudgeInviters() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_APPLY);
  const cols = ensureColumns_(sheet, ['招待元']);
  const last = sheet.getLastRow();
  if (last < 2) return;
  const values = sheet.getRange(2, 1, last - 1, sheet.getLastColumn()).getValues();
  const refCol = findColumn_(sheet, 'ご紹介者のSNSアカウントのURL');
  const codeCol = findColumn_(sheet, '招待コード');
  const out = values.map(function (r) {
    const ref = refCol ? r[refCol - 1] : '';
    const code = codeCol ? r[codeCol - 1] : '';
    return [judgeInviter_(ref, code)];
  });
  sheet.getRange(2, cols['招待元'], out.length, 1).setValues(out);
}

// ===================== メールの振り分け =====================

/**
 * 1通のメールを処理する。
 * 戻り値：true = 処理した / false = 対象外（処理済みにする） / null = 後で再試行
 */
function handleMessage_(ss, m) {
  const subject = m.getSubject();
  const body = m.getPlainBody();
  const isInfluencer = subject.indexOf(EVENT_INFLUENCER) >= 0 || body.indexOf(EVENT_INFLUENCER) >= 0;
  const isMedia = subject.indexOf(EVENT_MEDIA) >= 0 || body.indexOf(EVENT_MEDIA) >= 0;
  const isApply = /申し込みました/.test(subject);
  const isCancel = /キャンセル/.test(subject);

  if (!isInfluencer && !isMedia) return false; // ポップアップ以外の TimeRex メールは無視

  const form = parseForm_(body);
  if (!form.fields['名前'] && !form.fields['メールアドレス']) {
    logUnparsed_(ss, m, '入力情報を読み取れませんでした');
    return true;
  }

  if (isInfluencer && isApply) return addApplication_(ss, m, form);
  if (isInfluencer && isCancel) return cancelApplication_(ss, m, form);
  if (isMedia && isApply) return addMediaReservation_(ss, m, form);

  logUnparsed_(ss, m, isMedia && isCancel ? '内覧会のキャンセル（手動で確認してください）' : '種類を判定できませんでした');
  return true;
}

/** インフルエンサー申込を「申込一覧」に追加 */
function addApplication_(ss, m, form) {
  const sheet = ss.getSheetByName(SHEET_APPLY);
  const f = form.fields;
  const row = {
    '番号': nextNumber_(sheet),
    'ステータス': '申込',
    '申し込み日時': formatDate_(m.getDate()),
    'キャンセル日時': '',
    '開催日時': form.eventDate,
    '同伴者数': countCompanions_(f),
    '招待元': judgeInviter_(pick_(f, 'ご紹介者のSNSアカウントのURL'), pick_(f, '招待コード')),
  };
  Object.keys(f).forEach(function (label) { row[label] = f[label]; });
  appendByHeader_(sheet, row);
  return true;
}

/** キャンセルメールの内容から「申込一覧」の該当行を探してキャンセルにする */
function cancelApplication_(ss, m, form) {
  const sheet = ss.getSheetByName(SHEET_APPLY);
  const cols = ensureColumns_(sheet, ['ステータス', 'キャンセル日時']);
  const mailCol = findColumn_(sheet, 'メールアドレス');
  const dateCol = findColumn_(sheet, '開催日時');
  const last = sheet.getLastRow();
  if (last < 2 || !mailCol) { logUnparsed_(ss, m, 'キャンセル対象の行が見つかりません'); return true; }

  const data = sheet.getRange(2, 1, last - 1, sheet.getLastColumn()).getValues();
  const email = String(form.fields['メールアドレス'] || '').trim().toLowerCase();
  const slot = slotKey_(form.eventDate);
  let target = -1, fallback = -1;
  for (let i = data.length - 1; i >= 0; i--) {
    const r = data[i];
    if (r[cols['ステータス'] - 1] !== '申込') continue;
    if (String(r[mailCol - 1]).trim().toLowerCase() !== email) continue;
    if (fallback < 0) fallback = i;
    if (slot && dateCol && slotKey_(String(r[dateCol - 1])) === slot) { target = i; break; }
  }
  if (target < 0) target = fallback;
  if (target < 0) { logUnparsed_(ss, m, 'キャンセル対象の行が見つかりません'); return true; }

  sheet.getRange(target + 2, cols['ステータス']).setValue('キャンセル');
  sheet.getRange(target + 2, cols['キャンセル日時']).setValue(formatDate_(m.getDate()));
  return true;
}

/** メディア内覧会の申込を「内覧会予約」に追加 */
function addMediaReservation_(ss, m, form) {
  const sheet = ss.getSheetByName(SHEET_MEDIA);
  const row = {
    '番号': nextNumber_(sheet),
    '日時': formatDate_(m.getDate()),
    '予約日時': mediaSlot_(form.eventDate),
    'メッセージID': m.getId(),
  };
  Object.keys(form.fields).forEach(function (label) { row[label] = form.fields[label]; });
  appendByHeader_(sheet, row);
  return true;
}

// ===================== メール本文の読み取り =====================

/**
 * TimeRex の本文から「開催日時」と「入力情報」の各項目を取り出す。
 * 入力情報は「項目名：値」の行が並ぶ形。備考は複数行になることがあるので、
 * 備考の途中にある「〇〇：」は新しい項目として扱わない。
 */
function parseForm_(body) {
  const text = body.replace(/<br\s*\/?>/gi, '').replace(/\r/g, '');
  const dateMatch = text.match(/開催日時：(.+)/);
  const eventDate = dateMatch ? dateMatch[1].trim() : '';

  const start = text.indexOf('入力情報');
  const fields = {};
  if (start < 0) return { eventDate: eventDate, fields: fields };

  const lines = text.slice(start + '入力情報'.length).split('\n');
  let current = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(TimeRexは|TimeRex\s*$|>TimeRex)/.test(line)) break; // フッター
    const mm = line.match(/^([^：]{1,120})：(.*)$/);
    const inRemarks = current && /備考/.test(current);
    if (mm && !inRemarks) {
      current = mm[1].trim();
      fields[current] = mm[2].trim();
    } else if (current) {
      fields[current] = (fields[current] ? fields[current] + '\n' : '') + line;
    }
  }
  Object.keys(fields).forEach(function (k) { fields[k] = fields[k].replace(/\s+$/, ''); });
  return { eventDate: eventDate, fields: fields };
}

/** 項目名の一部で値を取り出す（例：'招待コード' → 「招待コード(なければ無しと記載ください)」の値） */
function pick_(fields, partial) {
  const key = Object.keys(fields).filter(function (k) { return k.indexOf(partial) >= 0; })[0];
  return key ? fields[key] : '';
}

/** 同伴者数：同伴者の項目があればその数、無ければ備考から推定 */
function countCompanions_(fields) {
  const direct = pick_(fields, '同伴');
  if (direct) {
    const n = toNumber_(direct);
    return n === null ? 0 : n;
  }
  const note = pick_(fields, '備考');
  if (!note) return 0;
  const m = note.match(/(?:同伴|同行|一緒|友人|連れ|招待)[^0-9０-９一二三]{0,10}([0-9０-９一二三])\s*(?:名|人)/) ||
            note.match(/([0-9０-９一二三])\s*(?:名|人)[^。]{0,6}(?:同伴|同行|一緒|連れ)/);
  if (m) return toNumber_(m[1]) || 0;
  if (/同伴|同行|一緒に参加|マネージャー/.test(note)) return 1;
  return 0;
}

/** 招待元の判定 */
function judgeInviter_(referrer, code) {
  const target = (String(referrer || '') + ' ' + String(code || '')).toLowerCase();
  for (let i = 0; i < INVITERS.length; i++) {
    const hit = INVITERS[i].keywords.some(function (k) { return target.indexOf(k.toLowerCase()) >= 0; });
    if (hit) return INVITERS[i].name;
  }
  return '';
}

// ===================== シートへの書き込み =====================

/** 見出しの名前に合わせて1行追加。見出しに無い項目は右端に列を追加する */
function appendByHeader_(sheet, row) {
  const headers = getHeaders_(sheet);
  const out = new Array(headers.length).fill('');
  Object.keys(row).forEach(function (label) {
    let col = matchHeader_(headers, label);
    if (!col) {
      headers.push(label);
      sheet.getRange(1, headers.length).setValue(label);
      out.push('');
      col = headers.length;
    }
    out[col - 1] = row[label];
  });
  const target = sheet.getLastRow() + 1;
  sheet.getRange(target, 1, 1, out.length).setNumberFormat('@').setValues([out.map(String)]);
  const numCol = matchHeader_(headers, '同伴者数');
  if (numCol) sheet.getRange(target, numCol).setNumberFormat('0').setValue(Number(row['同伴者数']) || 0);
}

/** 必要な列が無ければ右端に追加し、{見出し: 列番号} を返す */
function ensureColumns_(sheet, names) {
  const headers = getHeaders_(sheet);
  const cols = {};
  names.forEach(function (name) {
    let col = matchHeader_(headers, name);
    if (!col) {
      headers.push(name);
      col = headers.length;
      sheet.getRange(1, col).setValue(name);
    }
    cols[name] = col;
  });
  return cols;
}

function getHeaders_(sheet) {
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const row = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  while (row.length && row[row.length - 1] === '') row.pop();
  return row;
}

function findColumn_(sheet, partial) {
  return matchHeader_(getHeaders_(sheet), partial);
}

/** 見出しとの照合：「：」や空白を除いて完全一致 → 前方一致・部分一致の順 */
function matchHeader_(headers, label) {
  const norm = function (s) { return String(s).replace(/[：:\s]/g, ''); };
  const L = norm(label);
  if (!L) return 0;
  let i = headers.findIndex(function (h) { return norm(h) === L; });
  if (i >= 0) return i + 1;
  i = headers.findIndex(function (h) {
    const H = norm(h);
    return H.length >= 2 && (L.indexOf(H) === 0 || H.indexOf(L) === 0);
  });
  if (i >= 0) return i + 1;
  i = headers.findIndex(function (h) {
    const H = norm(h);
    return H.length >= 4 && L.length >= 4 && (L.indexOf(H) >= 0 || H.indexOf(L) >= 0);
  });
  return i >= 0 ? i + 1 : 0;
}

function nextNumber_(sheet) {
  const col = findColumn_(sheet, '番号') || 1;
  const last = sheet.getLastRow();
  if (last < 2) return 1;
  const nums = sheet.getRange(2, col, last - 1, 1).getValues()
    .map(function (r) { return Number(r[0]); })
    .filter(function (n) { return !isNaN(n); });
  return (nums.length ? Math.max.apply(null, nums) : 0) + 1;
}

function logUnparsed_(ss, m, reason) {
  const sheet = ss.getSheetByName(SHEET_UNPARSED);
  if (!sheet) return;
  sheet.appendRow([
    formatDate_(m.getDate()),
    m.getFrom(),
    m.getSubject(),
    (reason ? '【' + reason + '】' : '') + m.getPlainBody().slice(0, 300),
    m.getId(),
  ]);
}

/** 処理済みのメッセージID。_処理済みID に加え、内覧会予約・未解析メールに記録済みのIDも含める（二重登録の防止） */
function loadDoneIds_(ss) {
  const ids = new Set();
  const add = function (sheetName, header) {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return;
    const last = sheet.getLastRow();
    if (!last) return;
    const col = header ? findColumn_(sheet, header) : 1;
    if (!col) return;
    sheet.getRange(1, col, last, 1).getValues().forEach(function (r) {
      if (r[0]) ids.add(String(r[0]).trim());
    });
  };
  add(SHEET_DONE, null);
  add(SHEET_MEDIA, 'メッセージID');
  add(SHEET_UNPARSED, 'メッセージID');
  return ids;
}

function markDone_(ss, id) {
  ss.getSheetByName(SHEET_DONE).appendRow([id]);
}

// ===================== 小さな部品 =====================

function formatDate_(d) {
  return Utilities.formatDate(d, TZ, 'yyyy/MM/dd HH:mm');
}

/** 「10月28日 15:00」の部分だけを取り出して比較用のキーにする（曜日・<br>・年の有無の違いを吸収） */
function slotKey_(s) {
  const m = String(s).match(/(\d{1,2})月(\d{1,2})日[^0-9]*(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) + '/' + Number(m[2]) + ' ' + Number(m[3]) + ':' + m[4] : '';
}

/** 内覧会シートの表記「10月28日(水) 12:00 - 12:30」に合わせる */
function mediaSlot_(s) {
  const m = String(s).match(/(\d{4})年(\d{1,2})月(\d{1,2})日[^0-9]*(\d{1,2}:\d{2})\s*[〜~\-–]\s*(\d{1,2}:\d{2})/);
  if (!m) return s;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const w = '日月火水木金土'.charAt(d.getDay());
  return Number(m[2]) + '月' + Number(m[3]) + '日(' + w + ') ' + m[4] + ' - ' + m[5];
}

function toNumber_(s) {
  const t = String(s).replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
    .replace('一', '1').replace('二', '2').replace('三', '3');
  const m = t.match(/\d+/);
  if (m) return Number(m[0]);
  if (/なし|無し|いない|0/.test(t)) return 0;
  return null;
}
