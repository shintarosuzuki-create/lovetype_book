/**
 * イベント申込管理: Gmail → スプレッドシート自動転記
 * 対象: 「☆ラブタイプ診断 縁結び神社ポップアップ☆─ インフルエンサー様限定招待 ─」
 *
 * 使い方: Apps Script に全文を貼り付け → setup() を1回実行(権限を承認)
 * 初回は過去のメールをすべて取り込み、以降は1時間おきに自動実行されます。
 *
 * 2026/10 改修
 *  - 列の位置を決め打ちせず、申込一覧の1行目(見出し)の名前で書き込み先を決めるようにした。
 *    列を挿入・並べ替えしても正しい列に入る。
 *  - 「招待コード(なければ無しと記載ください)」を取り込むようにした(見出し「招待コード」の列)。
 *  - フォームに知らない項目が増えても他の項目に混ざらないようにした。
 *    見出しに同じ名前の列があればそこへ、無ければ見出しの右端に列を自動で追加して書き込む。
 *  - 紹介者のSNS・招待コードから「招待元」を判定するようにした(あみあん: amian / あみあん / アミアン / anju)。
 *    判定ルールは INVITERS で変更できる。メニュー「招待元を判定し直す」で既存行にも反映できる。
 *  - 集計シートの数式も見出しの位置から作るようにし、招待元ごとの申込数を追加した。
 */

const CONFIG = {
  EVENT_KEYWORD: 'インフルエンサー様限定招待',   // 件名に必ず含まれる文言(インフルエンサー招待だけを拾う)
  EXCLUDE_SUBJECT_PART: 'メディア様内覧会',      // 念のための除外(メディア内覧会のメールは拾わない)
  REG_SUBJECT_PART: 'に申し込みました',          // ①申込メールの件名に含まれる文言
  CANCEL_SUBJECT_PART: 'キャンセルされました',   // ②キャンセルメールの件名に含まれる文言
  GMAIL_QUERY: '"インフルエンサー様限定招待"',   // Gmail検索条件(件名・本文のどちらでも一致)
  SHEET_NAME: '申込一覧',
  LOG_SHEET_NAME: '要確認ログ',                  // キャンセルの該当者を特定できなかった場合に自動作成
  SUMMARY_SHEET_NAME: '集計',                    // 現在の合計人数の集計シート(無ければ自動作成)
  ID_SHEET_NAME: '_処理済みID',                  // 重複防止用の内部シート(自動作成・非表示)
  MAX_PAGES: 10,                                 // 通常時に検索するページ数(1ページ=100スレッド)
  BACKFILL_MAX_PAGES: 50,                        // 初回(過去メール全取り込み)時に検索するページ数
  BACKFILL_AFTER: '',                            // 初回の取り込み開始日。空欄=過去すべて。例: '2026/09/01'
  RUN_LIMIT_SEC: 300,                            // 1回の実行時間の上限(Apps Scriptの制限6分に対する安全マージン)
  TRIGGER_HOURS: 1,                              // 自動実行の間隔(時間)。1, 2, 4, 6, 8, 12 のいずれか
  OVERLAP_SEC: 7200,                             // 取りこぼし防止のため前回から2時間重ねて検索
  // 申込者のメールアドレス抽出時に除外するアドレス(システム送信元など)
  EXCLUDE_EMAIL_PATTERN: /no-?reply|@(.+\.)?(lu\.ma|luma-mail\.com|lumacdn\.com|timerex\.net|timerex\.jp)$/i,
};

/**
 * 招待元の判定ルール。
 * 紹介者のSNSアカウントのURL・招待コードのどちらかにキーワードが含まれていれば、その招待元とする。
 * 大文字・小文字は区別しない。上から順に判定し、最初に当てはまったものを使う。
 */
const INVITERS = [
  { name: 'あみあん', keywords: ['amian', 'あみあん', 'アミアン', 'anju'] },
];

/**
 * 申込一覧の列。見出しの名前で探すので、列の順番は自由に変えてよい。
 * header: 見出しが無いときに右端へ追加する名前 / match: 既存の見出しがその列かどうかの判定
 */
const COLUMNS = [
  { key: 'no',        header: '番号',            match: h => h === '番号' },
  { key: 'status',    header: 'ステータス',      match: h => h === 'ステータス' },
  { key: 'regAt',     header: '申し込み日時',    match: h => h === '申し込み日時' },
  { key: 'cancelAt',  header: 'キャンセル日時',  match: h => h === 'キャンセル日時' },
  { key: 'eventAt',   header: '開催日時',        match: h => h === '開催日時' },
  { key: 'name',      header: '名前：',          match: h => h === '名前' },
  { key: 'email',     header: 'メールアドレス：', match: h => h === 'メールアドレス' },
  { key: 'sns',       header: 'SNSアカウントのURL：',
                      match: h => h.indexOf('SNSアカウントのURL') >= 0 && h.indexOf('紹介者') < 0 },
  { key: 'code',      header: '招待コード',      match: h => h.indexOf('招待コード') === 0 },
  { key: 'ref',       header: '(もしいれば)ご紹介者のSNSアカウントのURL：', match: h => h.indexOf('紹介者') >= 0 },
  { key: 'consent',   header: '弊社公式サイトなどで「ご招待インフルエンサー」としてお名前を公開してよいでしょうか？：',
                      match: h => h.indexOf('公開してよい') >= 0 },
  { key: 'remarks',   header: '備考・ご連絡事項：', match: h => h.indexOf('備考') === 0 },
  { key: 'companion', header: '同伴者数',        match: h => h === '同伴者数' },
  { key: 'inviter',   header: '招待元',          match: h => h === '招待元' },
];

const EMAIL_RE = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g;

// メール本文からの項目抽出に使う見出し(本文中の「見出し：回答」を拾う)
const FIELD_DEFS = [
  { key: 'name',    re: /名前\s*[：:]/ },
  { key: 'email',   re: /メールアドレス\s*[：:]/ },
  { key: 'sns',     re: /(?<!ご紹介者の)SNSアカウントのURL\s*[：:]/ },
  { key: 'code',    re: /招待コード[^：:\n]{0,40}[：:]/ },
  { key: 'ref',     re: /(?:[（(]\s*もしいれば\s*[）)]\s*)?ご紹介者のSNSアカウントのURL\s*[：:]/ },
  { key: 'consent', re: /弊社公式サイトなどで[\s\S]{0,60}?公開してよいでしょうか\s*[？?]?\s*[：:]?/ },
  { key: 'remarks', re: /備考・ご連絡事項\s*[：:]/ },
  { key: 'companion', re: /同伴者?[^：:\n]{0,20}[：:]/ },   // 同伴者の項目がある場合のみ
];
// メール末尾のTimeRex宣伝文(備考に混ざるため、置換で削除する)
const BOILERPLATE_PATTERNS = [
  /TimeRexは、日程候補のリストアップから予定の登録まで、面倒な日程調整タスクを自動化するサービスです。/g,
  /[>＞]?\s*TimeRexについて詳しくみる/g,
  /[>＞]?\s*60秒でかんたん会員登録\s*[（(]\s*無料\s*[）)]/g,
  /https?:\/\/(?:[\w-]+\.)*timerex\.net[^\s]*/g,
];
// 最後の項目の回答の終わり(メール末尾のフッター)を判定する目印
const FOOTER_RE = /\n\s*(?:-{2,}|—{2,}|©|Powered by|このメールは|配信停止|Unsubscribe|ゲストを表示|ゲスト一覧|Manage|Lumaで|TimeRex\s*\n|ミクステンド)/i;

function onOpen() {
  SpreadsheetApp.getUi().createMenu('申込管理')
    .addItem('今すぐ同期', 'syncApplications')
    .addItem('初期設定(自動実行トリガー作成)', 'setup')
    .addItem('全メールを再スキャン', 'rescanAll')
    .addItem('招待元を判定し直す', 'rejudgeInviters')
    .addItem('データを消して取り込み直す(全リセット)', 'resetAll')
    .addToUi();
}

/** 初回のみ実行: トリガー作成 + 過去メールの取り込み */
function setup() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'syncApplications') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('syncApplications').timeBased().everyHours(CONFIG.TRIGGER_HOURS).create();
  const s = ensureSheets_();
  writeSummary_(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SUMMARY_SHEET_NAME), s.cols);
  rejudgeInviters();
  syncApplications();
}

/** 過去メールを最初から読み直す(取り込み済みのメールは重複して追加されません) */
function rescanAll() {
  PropertiesService.getScriptProperties().deleteProperty('LAST_TS');
  syncApplications();
}

/** 一覧を空にして、過去メールから全部取り込み直す */
function resetAll() {
  const ui = SpreadsheetApp.getUi();
  if (ui.alert('確認', '申込一覧のデータをすべて消して、メールから取り込み直します。よろしいですか?',
               ui.ButtonSet.OK_CANCEL) !== ui.Button.OK) return;
  const s = ensureSheets_();
  if (s.sh.getLastRow() > 1) s.sh.getRange(2, 1, s.sh.getLastRow() - 1, s.sh.getLastColumn()).clearContent();
  if (s.idSh.getLastRow() > 0) s.idSh.clearContents();
  const log = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.LOG_SHEET_NAME);
  if (log && log.getLastRow() > 1) log.getRange(2, 1, log.getLastRow() - 1, log.getLastColumn()).clearContent();
  PropertiesService.getScriptProperties().deleteProperty('LAST_TS');
  syncApplications();
}

/** 申込一覧の全行について、紹介者・招待コードから招待元を判定し直す(判定ルールを変えたときに実行) */
function rejudgeInviters() {
  const s = ensureSheets_();
  const sh = s.sh, cols = s.cols;
  const last = sh.getLastRow();
  if (last < 2) return;
  const width = sh.getLastColumn();
  const values = sh.getRange(2, 1, last - 1, width).getValues();
  const out = values.map(r => [judgeInviter_(r[cols.ref - 1], r[cols.code - 1])]);
  sh.getRange(2, cols.inviter, out.length, 1).setValues(out);
}

function syncApplications() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;
  const pending = [];          // 処理済みメールIDの書き込み待ち
  let idSh = null;
  try {
    const sheets = ensureSheets_();
    const sh = sheets.sh;
    const cols = sheets.cols;
    idSh = sheets.idSh;
    const props = PropertiesService.getScriptProperties();
    const lastTs = Number(props.getProperty('LAST_TS') || 0);   // 最後に処理したメールの時刻(epoch秒)
    const isBackfill = !lastTs;                                  // 0 = 初回(過去メールをすべて取り込む)
    const startedAt = Date.now();

    // --- 1. Gmail検索 ---
    let query = CONFIG.GMAIL_QUERY;
    if (lastTs) query += ' after:' + Math.max(lastTs - CONFIG.OVERLAP_SEC, 0);
    else if (CONFIG.BACKFILL_AFTER) query += ' after:' + CONFIG.BACKFILL_AFTER;
    const maxPages = isBackfill ? CONFIG.BACKFILL_MAX_PAGES : CONFIG.MAX_PAGES;
    const threads = [];
    for (let p = 0; p < maxPages; p++) {
      const chunk = GmailApp.search(query, p * 100, 100);
      threads.push.apply(threads, chunk);
      if (chunk.length < 100) break;
    }

    // --- 2. 対象メールを抽出して古い順に並べる(申込→キャンセルの順で処理するため) ---
    const minMs = (lastTs - CONFIG.OVERLAP_SEC) * 1000;
    const items = [];
    threads.forEach(th => th.getMessages().forEach(m => {
      if (m.getDate().getTime() < minMs) return;
      const subj = m.getSubject() || '';
      if (subj.indexOf(CONFIG.EVENT_KEYWORD) < 0) return;
      if (subj.indexOf(CONFIG.EXCLUDE_SUBJECT_PART) >= 0) return;   // メディア内覧会のメールは、こちらに入れない
      if (subj.indexOf(CONFIG.CANCEL_SUBJECT_PART) >= 0) items.push({ m: m, type: 'cancel' });
      else if (subj.indexOf(CONFIG.REG_SUBJECT_PART) >= 0) items.push({ m: m, type: 'reg' });
    }));
    items.sort((a, b) => a.m.getDate() - b.m.getDate());

    // --- 3. 既存データを読み込み ---
    const lastRow = sh.getLastRow();
    const width = sh.getLastColumn();
    const values = lastRow > 1 ? sh.getRange(2, 1, lastRow - 1, width).getValues() : [];
    const rows = values.map((r, i) => ({
      row: i + 2,
      status: String(r[cols.status - 1]),
      name: String(r[cols.name - 1]),
      email: String(r[cols.email - 1]).toLowerCase(),
    }));
    const state = { nextNo: values.reduce((mx, r) => Math.max(mx, Number(r[cols.no - 1]) || 0), 0) + 1 };
    const seen = loadProcessedIds_(idSh);

    // --- 4. 1通ずつ処理 ---
    let maxTs = lastTs;
    for (let i = 0; i < items.length; i++) {
      if (Date.now() - startedAt > CONFIG.RUN_LIMIT_SEC * 1000) break;   // 時間切れ: 続きは次回の実行で処理
      const m = items[i].m;
      const id = m.getId();
      const ts = Math.floor(m.getDate().getTime() / 1000);
      if (!seen.has(id)) {
        if (items[i].type === 'reg') {
          addRegistration_(sh, cols, rows, state, m);
        } else if (!applyCancel_(sh, cols, rows, m)) {
          appendLog_(m, '該当する申込を特定できません(手動で確認してください)');
        }
        seen.add(id);
        pending.push(id);
        if (pending.length >= 20) flushIds_(idSh, pending);
      }
      if (ts > maxTs) maxTs = ts;
    }
    if (maxTs > lastTs) props.setProperty('LAST_TS', String(maxTs));
  } finally {
    try { if (idSh) flushIds_(idSh, pending); } finally { lock.releaseLock(); }
  }
}

/** ①申込メール → 1行追加(各項目はメール本文から取得) */
function addRegistration_(sh, cols, rows, state, m) {
  const subj = m.getSubject() || '';
  const body = m.getPlainBody() || '';
  const f = parseFields_(body);

  const nm = subj.match(/^(.+?)さんが/);
  const name = f.name || (nm ? nm[1].trim() : '');
  const emailField = (f.email || '').match(EMAIL_RE);
  const email = emailField ? emailField[0] : (extractEmails_(m, body)[0] || '');

  // フォームに見出しの無い項目があれば、右端に列を追加してから書き込む
  Object.keys(f.extras).forEach(label => { extraColumn_(sh, cols, label); });

  const width = sh.getLastColumn();
  const row = sh.getLastRow() + 1;
  const rec = new Array(width).fill('');
  const put = (key, v) => { if (cols[key]) rec[cols[key] - 1] = v; };
  put('no', state.nextNo);
  put('status', '申込');
  put('regAt', m.getDate());
  put('eventAt', extractEventAt_(body));
  put('name', name);
  put('email', email);
  put('sns', f.sns || '');
  put('code', f.code || '');
  put('ref', f.ref || '');
  put('consent', f.consent || '');
  put('remarks', f.remarks || '');
  put('companion', detectCompanions_(f));
  put('inviter', judgeInviter_(f.ref, f.code));
  Object.keys(f.extras).forEach(label => { rec[cols.extra[label] - 1] = f.extras[label]; });

  sh.getRange(row, 1, 1, width).setValues([rec]);
  sh.getRange(row, cols.regAt).setNumberFormat('yyyy/mm/dd hh:mm');
  state.nextNo++;
  rows.push({ row: row, status: '申込', name: name, email: email.toLowerCase() });
}

/** ②キャンセルメール → 該当行のステータスを「キャンセル」に変更 */
function applyCancel_(sh, cols, rows, m) {
  const subj = m.getSubject() || '';
  const body = m.getPlainBody() || '';
  const emails = extractEmails_(m, body);
  const f = parseFields_(body);
  const haystack = subj + '\n' + body;
  const active = rows.filter(r => r.status !== 'キャンセル');

  let target = null;
  if (emails.length) {                       // 優先: メールアドレスで特定(同一アドレスは直近の申込)
    const hit = active.filter(r => r.email && emails.indexOf(r.email) >= 0);
    if (hit.length) target = hit[hit.length - 1];
  }
  if (!target) {                             // 次点: 氏名で特定(本文に含まれ、かつ1人に絞れる場合のみ)
    const hit = active.filter(r => r.name && (haystack.indexOf(r.name) >= 0 || (f.name && f.name === r.name)));
    if (hit.length === 1) target = hit[0];
  }
  if (!target) return false;

  sh.getRange(target.row, cols.status).setValue('キャンセル');
  sh.getRange(target.row, cols.cancelAt).setValue(m.getDate()).setNumberFormat('yyyy/mm/dd hh:mm');
  target.status = 'キャンセル';
  return true;
}

/**
 * 本文の「見出し：回答」を拾って項目ごとに返す。
 * 決まった項目(FIELD_DEFS)のほか、「入力情報」以降で備考より前にある「〇〇：」の行も項目の区切りとして扱い、
 * 知らない項目は extras に入れる(=前の項目の回答に混ざらない)。
 */
function parseFields_(body) {
  const text = removeBoilerplate_(String(body || '')).replace(/\r/g, '');
  const hits = [];
  FIELD_DEFS.forEach(d => {
    const mt = d.re.exec(text);
    if (mt) hits.push({ key: d.key, start: mt.index, end: mt.index + mt[0].length });
  });
  const rem = hits.filter(h => h.key === 'remarks')[0];
  const filtered = hits.filter(h => !(h.key === 'companion' && rem && h.start > rem.start));

  // 知らない項目: 「入力情報」以降・備考より前にある「〇〇：」の行
  const infoAt = text.indexOf('入力情報');
  const lineRe = /^[ \t　]*([^\n：:]{1,80}?)\s*[：:]/gm;
  let mt;
  while ((mt = lineRe.exec(text)) !== null) {
    const pos = mt.index;
    if (infoAt >= 0 && pos < infoAt) continue;
    if (rem && pos >= rem.start) break;
    const lineEnd = text.indexOf('\n', pos) < 0 ? text.length : text.indexOf('\n', pos);
    const known = filtered.some(h => h.start >= pos && h.start < lineEnd);
    if (known) continue;
    filtered.push({ key: 'extra', label: mt[1].trim(), start: pos, end: pos + mt[0].length });
  }

  filtered.sort((a, b) => a.start - b.start);
  const out = { extras: {} };
  filtered.forEach((h, i) => {
    const next = i + 1 < filtered.length ? filtered[i + 1].start : text.length;
    let v = text.slice(h.end, next);
    if (i === filtered.length - 1) {
      const ft = v.search(FOOTER_RE);
      if (ft >= 0) v = v.slice(0, ft);
    }
    const val = cleanValue_(v, h.key === 'remarks');
    if (h.key === 'extra') out.extras[h.label] = val;
    else out[h.key] = val;
  });
  return out;
}

/** 招待元の判定 */
function judgeInviter_(ref, code) {
  const t = (String(ref || '') + ' ' + String(code || '')).toLowerCase();
  for (let i = 0; i < INVITERS.length; i++) {
    if (INVITERS[i].keywords.some(k => t.indexOf(String(k).toLowerCase()) >= 0)) return INVITERS[i].name;
  }
  return '';
}

/** 同伴者数の判定: ①「同伴者」項目があればその回答 → ②無ければ備考の文章から推定(同伴は1名までのルール) */
function detectCompanions_(f) {
  if (f.companion) {
    const a = countFromAnswer_(f.companion);
    if (a !== null) return a;
  }
  return countFromRemarks_(f.remarks);
}

function toHalf_(s) {
  return String(s || '').replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
}

function toNum_(s) {
  const map = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5 };
  const m = toHalf_(s).match(/[0-9]+|[一二三四五]/);
  return m ? (map[m[0]] || Number(m[0])) : null;
}

function countFromAnswer_(v) {
  const t = toHalf_(v).trim();
  if (!t) return null;
  const n = toNum_(t);
  if (n !== null) return n;
  if (/(なし|無し|いません|おりません|いない|不要|いいえ|ゼロ)/.test(t)) return 0;
  if (/(あり|有り|います|おります|はい|同伴)/.test(t)) return 1;
  return null;
}

function countFromRemarks_(r) {
  const t = toHalf_(r);
  if (!t) return 0;
  let m = t.match(/同伴(?:者|人)?[^0-9一二三四五\n]{0,6}?([0-9]+|[一二三四五])\s*[名人]/);
  if (m) return toNum_(m[1]);                                   // 「同伴者1名」
  if (/同伴(?:者|人)?\s*(?:は\s*)?(?:なし|無し|いません|おりません)/.test(t)) return 0;
  if (/(?:1|一)\s*人で(?:の)?(?:参加|伺|お伺|行|来)|一人で|ひとりで|単独/.test(t)) return 0;
  m = t.match(/([0-9]+|[一二三四五])\s*[名人]\s*(?:で|にて)/);
  if (m) return Math.max(toNum_(m[1]) - 1, 0);                  // 「2名で伺います」= 本人+同伴1名
  if (/(友人|友達|友だち|彼氏|彼女|パートナー|家族|お母さん|母|姉|妹|知人|お連れ|連れて|同行|一緒|同伴|ペア)/.test(t)) return 1;
  return 0;
}

function removeBoilerplate_(text) {
  let t = text;
  BOILERPLATE_PATTERNS.forEach(re => { t = t.replace(re, ''); });
  return t;
}

function cleanValue_(v, keepLines) {
  const lines = String(v).split('\n').map(s => s.replace(/[ \t　]+/g, ' ').trim()).filter(Boolean);
  return (keepLines ? lines.join('\n') : lines.join(' ')).slice(0, 2000);
}

/** 本文から開催日時を取得(「開催日時:」等の見出し → 日本語の日時表記 → 英語の日時表記の順に探す) */
function extractEventAt_(body) {
  const text = String(body || '').replace(/\r/g, '');
  const lab = text.match(/^\s*(?:開催日時|イベント日時|日時|開催日)\s*[：:]\s*(.+)$/m);
  if (lab) return lab[1].trim();
  const jp = text.match(/(?:\d{4}年\s*)?\d{1,2}月\s*\d{1,2}日\s*(?:[（(][月火水木金土日][）)])?\s*\d{1,2}:\d{2}(?:\s*[〜~～\-–—]\s*\d{1,2}:\d{2})?/);
  if (jp) return jp[0].replace(/\s+/g, ' ').trim();
  const en = text.match(/(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*,?\s+[A-Z][a-z]+\s+\d{1,2}(?:,\s*\d{4})?[^\n]{0,40}?\d{1,2}:\d{2}\s*(?:AM|PM)?(?:\s*[-–—]\s*\d{1,2}:\d{2}\s*(?:AM|PM)?)?/);
  if (en) return en[0].replace(/\s+/g, ' ').trim();
  return '';
}

/** 本文から申込者のメールアドレスを抽出(送受信アドレス・システムアドレスは除外) */
function extractEmails_(m, body) {
  const own = new Set();
  [m.getFrom(), m.getTo(), m.getCc()].forEach(s => {
    (String(s || '').match(EMAIL_RE) || []).forEach(e => own.add(e.toLowerCase()));
  });
  const found = [];
  (String(body || '').match(EMAIL_RE) || []).forEach(e => {
    const l = e.toLowerCase();
    if (own.has(l) || CONFIG.EXCLUDE_EMAIL_PATTERN.test(l) || found.indexOf(l) >= 0) return;
    found.push(l);
  });
  return found;
}

/** 該当者を特定できなかったキャンセルメールを記録(必要なときだけ自動作成されるシート) */
function appendLog_(m, reason) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let lg = ss.getSheetByName(CONFIG.LOG_SHEET_NAME);
  if (!lg) {
    lg = ss.insertSheet(CONFIG.LOG_SHEET_NAME);
    lg.getRange(1, 1, 1, 4).setValues([['受信日時', '件名', '理由', 'Gmailリンク']]);
    lg.setFrozenRows(1);
  }
  const row = lg.getLastRow() + 1;
  lg.getRange(row, 1, 1, 4).setValues([[
    m.getDate(), m.getSubject() || '', reason,
    '=HYPERLINK("https://mail.google.com/mail/u/0/#all/' + m.getId() + '","開く")',
  ]]);
  lg.getRange(row, 1).setNumberFormat('yyyy/mm/dd hh:mm');
}

function loadProcessedIds_(idSh) {
  const last = idSh.getLastRow();
  return new Set(last >= 1
    ? idSh.getRange(1, 1, last, 1).getValues().map(r => String(r[0])).filter(Boolean) : []);
}

function flushIds_(idSh, pending) {
  if (!pending.length) return;
  idSh.getRange(idSh.getLastRow() + 1, 1, pending.length, 1).setValues(pending.map(id => [id]));
  pending.length = 0;
}

/** 集計シートの中身を書き込む(申込者数・同伴者数・合計人数・招待元ごとの申込数など) */
function writeSummary_(sm, cols) {
  const ref = c => "'" + CONFIG.SHEET_NAME + "'!" + colLetter_(c) + '2:' + colLetter_(c) + '2000';
  const st = ref(cols.status);
  const cp = ref(cols.companion);
  const inv = ref(cols.inviter);
  sm.getRange('A1').setValue('申込状況の集計').setFontWeight('bold');
  sm.getRange('A3:A9').setValues([
    ['申込者数(キャンセル除く)'], ['同伴者数(キャンセル除く)'], ['来場想定の合計人数(申込者+同伴者)'],
    ['同伴が2名以上の申込(要確認)'], [''], ['キャンセル数'], ['申込総数(キャンセル含む)'],
  ]);
  sm.getRange('B3').setFormula('=COUNTIF(' + st + ',"申込")');
  sm.getRange('B4').setFormula('=SUMIF(' + st + ',"申込",' + cp + ')');
  sm.getRange('B5').setFormula('=B3+B4').setFontWeight('bold');
  sm.getRange('A5').setFontWeight('bold');
  sm.getRange('B6').setFormula('=COUNTIFS(' + st + ',"申込",' + cp + ',">1")');
  sm.getRange('B8').setFormula('=COUNTIF(' + st + ',"キャンセル")');
  sm.getRange('B9').setFormula('=B3+B8');
  sm.getRange('A11').setValue('※同伴者数は申込メール(同伴者の項目または備考)から自動判定しています。誤りは申込一覧の「同伴者数」列を直接修正すると集計に反映されます。');
  sm.getRange('A11').setFontColor('#647087').setFontSize(9);
  INVITERS.forEach((v, i) => {
    sm.getRange(13 + i, 1).setValue(v.name + 'さん経由の申込(キャンセル除く)');
    sm.getRange(13 + i, 2).setFormula('=COUNTIFS(' + st + ',"申込",' + inv + ',"' + v.name + '")');
  });
  sm.setColumnWidth(1, 300);
}

/** 必要なシート・列が無ければ作成し、{ sh, idSh, cols } を返す */
function ensureSheets_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(CONFIG.SHEET_NAME);
    sh.getRange(1, 1, 1, COLUMNS.length).setValues([COLUMNS.map(c => c.header)]);
    sh.setFrozenRows(1);
  }
  const cols = resolveColumns_(sh);
  if (!ss.getSheetByName(CONFIG.SUMMARY_SHEET_NAME)) {
    writeSummary_(ss.insertSheet(CONFIG.SUMMARY_SHEET_NAME), cols);
  }
  let idSh = ss.getSheetByName(CONFIG.ID_SHEET_NAME);
  if (!idSh) {
    idSh = ss.insertSheet(CONFIG.ID_SHEET_NAME);
    idSh.hideSheet();
  }
  return { sh: sh, idSh: idSh, cols: cols };
}

/** 見出し行から各項目の列番号を調べる。無い列は右端に追加する */
function resolveColumns_(sh) {
  const headers = readHeaders_(sh);
  const cols = { extra: {} };
  COLUMNS.forEach(c => {
    let i = headers.findIndex(h => c.match(normHeader_(h)));
    if (i < 0) {
      headers.push(c.header);
      i = headers.length - 1;
      sh.getRange(1, i + 1).setValue(c.header);
    }
    cols[c.key] = i + 1;
  });
  headers.forEach((h, i) => {
    const n = normHeader_(h);
    if (n && !COLUMNS.some(c => cols[c.key] === i + 1)) cols.extra[n] = i + 1;
  });
  cols._headers = headers;
  return cols;
}

/** フォームの知らない項目の列。同じ名前の見出しが無ければ右端に追加する */
function extraColumn_(sh, cols, label) {
  const n = normHeader_(label);
  if (cols.extra[n]) { cols.extra[label] = cols.extra[n]; return; }
  const col = cols._headers.length + 1;
  sh.getRange(1, col).setValue(label);
  cols._headers.push(label);
  cols.extra[n] = col;
  cols.extra[label] = col;
}

function readHeaders_(sh) {
  const width = Math.max(sh.getLastColumn(), 1);
  const h = sh.getRange(1, 1, 1, width).getValues()[0].map(String);
  while (h.length && !h[h.length - 1]) h.pop();
  return h;
}

/** 見出しの比較用: 末尾の「：」や空白を除く */
function normHeader_(h) {
  return String(h || '').replace(/[\s　]/g, '').replace(/[：:]+$/, '');
}

function colLetter_(n) {
  let s = '';
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}
