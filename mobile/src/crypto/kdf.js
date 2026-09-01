// PBKDF2 だけを WebView（WebKit の Web Crypto = ネイティブ実装）に委譲する。
//
// なぜ: 純JS の PBKDF2 は iPhone 12 実機で 60万回に 138秒かかった（Node は 0.7秒）。
// Hermes には JIT が無く、この差は実装を書き直しても埋まらない。
// WKWebView の crypto.subtle は Web 版が使っているものと同一実装なので、
// 速度が戻るだけでなく、鍵導出の互換性もこれ以上ない形で担保される。
//
// AES-GCM は純JS（@noble）のまま。呼ばれる回数が桁違いに多く、実測でも十分速いため、
// 橋渡しの往復を増やす価値がない。
import { toB64, fromB64 } from './base64.js';

let post = null;              // WebView へ送る関数。KdfBridge がマウント時に差し込む。
const pending = new Map();    // id -> { resolve, reject }
const queued = [];            // Bridge の準備前に来た依頼
let seq = 1;
let ready = null;             // WebView から返ってきた環境情報（診断用）

// WebView が黙って死んだときに原因を切り分けるための足跡。診断画面が読む。
const status = { mounted: false, loadStart: false, loadEnd: false, boot: false, error: null, httpError: null, messages: 0 };
export const kdfStatus = () => ({ ...status });
export function _mark(k, v = true) { status[k] = v; }

export function _attach(fn) {
  post = fn;
  queued.splice(0).forEach(post);
}

export function _detach() {
  post = null;
}

export function _receive(raw) {
  status.messages++;
  let m;
  try { m = JSON.parse(raw); } catch { return; }
  if (m.boot) { status.boot = true; return; }
  if (m.ready) { ready = m; return; }
  const w = pending.get(m.id);
  if (!w) return;
  pending.delete(m.id);
  if (m.error) w.reject(new Error(m.error));
  else w.resolve(fromB64(m.key));
}

/** WebView 側の環境（crypto.subtle が使えるか）。診断画面が読む。 */
export const kdfEnvironment = () => ready;

/** WebView の準備が整うまで待つ。起動直後に解錠へ進むケースがあるため。 */
export function whenReady(timeoutMs = 8000) {
  if (ready) return Promise.resolve(ready);
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const id = setInterval(() => {
      if (ready) { clearInterval(id); resolve(ready); }
      else if (Date.now() - started > timeoutMs) { clearInterval(id); reject(new Error('WebView が準備できませんでした')); }
    }, 50);
  });
}

export async function deriveKEKFast(passphrase, salt, iterations, dkLen) {
  // Web Crypto が直接使える環境（Node の検証スクリプト等）では WebView を経由しない。
  const subtle = globalThis.crypto && globalThis.crypto.subtle;
  if (subtle) {
    const k = await subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveBits']);
    const bits = await subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, k, dkLen * 8);
    return new Uint8Array(bits);
  }
  return new Promise((resolve, reject) => {
    const id = String(seq++);
    pending.set(id, { resolve, reject });
    const msg = JSON.stringify({ id, passphrase, salt: toB64(salt), iterations, dkLen });
    if (post) post(msg); else queued.push(msg);
    // 橋が落ちている・WebView が壊れている場合に永久に待たない。
    setTimeout(() => {
      if (pending.delete(id)) reject(new Error('鍵導出がタイムアウトしました'));
    }, 60000);
  });
}
