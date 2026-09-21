/**
 * 合言葉ゲート（画面側での簡易判定）
 *
 * 書籍に記載した合言葉を入力すると、特典ページのロックが外れる。
 *
 * ■ 合言葉の変え方
 *   下の PASSCODE_SHA256 を、新しい合言葉の SHA-256 ハッシュに差し替える。
 *   ハッシュは tools/passcode.html を開いて合言葉を入れれば出せる。
 *   （ハッシュを変えると、解除済みの端末も再入力が必要になる）
 *
 * ■ 強度について
 *   これはブラウザ内だけで判定する「関係者以外がうっかり入れない」ための仕組み。
 *   合言葉そのものはソースに書いていないが、総当たりや解析で突破はできる。
 *   厳密な会員制にしたい場合は、サーバー側の認証（Basic認証など）が必要。
 */
const Gate = (() => {
  /** 合言葉の SHA-256。初期値は "lovetype" ← 公開前に必ず差し替えること */
  const PASSCODE_SHA256 = '7b8c20274a5383dba0668a4113b97088a109cf46b86e9dd7ef1b80002cb3cfba';

  const STORAGE_KEY = 'lovetype-license-unlocked';

  /** 全角・大文字・空白のゆらぎを吸収する。 */
  function normalize(value) {
    return (value || '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, '');
  }

  async function sha256Hex(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /** 解除済みか。合言葉を変えるとハッシュも変わるので、自動的に再入力になる。 */
  function isUnlocked() {
    try {
      return localStorage.getItem(STORAGE_KEY) === PASSCODE_SHA256;
    } catch {
      return false; // プライベートモードなどで localStorage が使えない場合
    }
  }

  function remember() {
    try {
      localStorage.setItem(STORAGE_KEY, PASSCODE_SHA256);
    } catch {
      /* 保存できなくても、そのセッション中は先に進める */
    }
  }

  async function verify(input) {
    return (await sha256Hex(normalize(input))) === PASSCODE_SHA256;
  }

  /**
   * 入力ページのロック画面を組み立てる。
   * #gate（ロック画面）と #gated-content（解除後に出す中身）がある場合だけ動く。
   */
  function mountGateScreen() {
    const gate = document.getElementById('gate');
    const content = document.getElementById('gated-content');
    if (!gate || !content) return;

    const open = () => {
      gate.hidden = true;
      content.hidden = false;
    };

    if (isUnlocked()) {
      open();
      return;
    }

    gate.hidden = false;
    content.hidden = true;

    const form = document.getElementById('gate-form');
    const input = document.getElementById('passcode');
    const error = document.getElementById('gate-error');

    if (!crypto.subtle) {
      // https か localhost でないと Web Crypto が使えない
      error.textContent = 'この環境では合言葉を確認できません。https のURLで開いてください。';
      return;
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      error.textContent = '';

      if (!input.value.trim()) {
        input.focus();
        return;
      }

      if (await verify(input.value)) {
        remember();
        open();
        content.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        error.textContent = '合言葉が違うようです。書籍に記載のものをご確認ください。';
        input.select();
      }
    });

    input.addEventListener('input', () => { error.textContent = ''; });
  }

  return { isUnlocked, verify, mountGateScreen };
})();

document.addEventListener('DOMContentLoaded', Gate.mountGateScreen);
