// E2E（ゼロ知識）暗号のコア。
// 認証(Cognito)とは独立。鍵・パスフレーズ・平文は **サーバーへ送らない/保存しない**。
// 方式: Web Crypto API / データ・鍵ラップ = AES-256-GCM、KDF = PBKDF2-SHA256。
//   ※ KDF は deriveKEK() に分離してあり、将来 Argon2id(libsodium) へ差し替え可能。
// 設計の詳細は docs/E2E_ENCRYPTION_DESIGN.md を参照。

const subtle = globalThis.crypto.subtle;
const rand = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));
const te = new TextEncoder();
const td = new TextDecoder();

const PBKDF2_ITERATIONS = 600000; // OWASP 推奨水準（PBKDF2-HMAC-SHA256）
const KDF = 'PBKDF2-SHA256';
const CIPHER = 'AES-256-GCM';
const NONCE_LEN = 12; // AES-GCM IV

// ── base64 ──
function toB64(bytes) {
  const b = new Uint8Array(bytes); let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s);
}
function fromB64(str) {
  const s = atob(str); const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
  return b;
}
function concat(a, b) { const r = new Uint8Array(a.length + b.length); r.set(a, 0); r.set(b, a.length); return r; }

// ── 鍵 ──
// パスフレーズ + salt → KEK（DEK ラップ用の AES-GCM 鍵）
async function deriveKEK(passphrase, salt) {
  const base = await subtle.importKey('raw', te.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

// ランダムな DEK（データ暗号化鍵）。ラップするため extractable。
async function generateDEK() {
  return subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

// DEK を KEK でラップ（raw を AES-GCM 暗号化）→ b64(nonce|ct)
async function wrapDEK(dek, kek) {
  const raw = new Uint8Array(await subtle.exportKey('raw', dek));
  const nonce = rand(NONCE_LEN);
  const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv: nonce }, kek, raw));
  return toB64(concat(nonce, ct));
}
async function unwrapDEK(wrappedB64, kek) {
  const blob = fromB64(wrappedB64);
  const nonce = blob.slice(0, NONCE_LEN); const ct = blob.slice(NONCE_LEN);
  const raw = new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: nonce }, kek, ct)); // 鍵違いは例外
  return subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

// ── データの封緘/開封（DEK で JSON を暗号化/復号）──
export async function seal(dek, obj) {
  const nonce = rand(NONCE_LEN);
  const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv: nonce }, dek, te.encode(JSON.stringify(obj))));
  return toB64(concat(nonce, ct));
}
export async function open(dek, b64blob) {
  const blob = fromB64(b64blob);
  const nonce = blob.slice(0, NONCE_LEN); const ct = blob.slice(NONCE_LEN);
  const data = new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: nonce }, dek, ct));
  return JSON.parse(td.decode(data));
}

// ユーザー提示用リカバリーキー（例: A1B2C-3D4E5-...）。約140bit。
export function generateRecoveryKey() {
  return (toB64(rand(20)).replace(/[+/=]/g, '').toUpperCase().match(/.{1,5}/g) || []).join('-');
}

// ── ライフサイクル ──
// 新規セットアップ: DEK 生成 → パスフレーズとリカバリーキーで二重ラップしたバンドルを返す。
// bundle はサーバー保存可（平文鍵を含まない）。recoveryKey は一度だけ表示し保存させる。
export async function setupEncryption(passphrase) {
  const dek = await generateDEK();
  const salt = rand(16);
  const wrappedDEK = await wrapDEK(dek, await deriveKEK(passphrase, salt));
  const recoveryKey = generateRecoveryKey();
  const recoverySalt = rand(16);
  const recoveryWrappedDEK = await wrapDEK(dek, await deriveKEK(recoveryKey, recoverySalt));
  return {
    dek,
    recoveryKey,
    bundle: {
      v: 1, kdf: KDF, cipher: CIPHER, iterations: PBKDF2_ITERATIONS,
      salt: toB64(salt), wrappedDEK,
      recoverySalt: toB64(recoverySalt), recoveryWrappedDEK,
    },
  };
}

// 解錠: パスフレーズ + bundle → dek（パスフレーズ違いは例外）
export async function unlock(passphrase, bundle) {
  return unwrapDEK(bundle.wrappedDEK, await deriveKEK(passphrase, fromB64(bundle.salt)));
}

// リカバリー: リカバリーキー + bundle → dek
export async function recover(recoveryKey, bundle) {
  return unwrapDEK(bundle.recoveryWrappedDEK, await deriveKEK(recoveryKey, fromB64(bundle.recoverySalt)));
}

// パスフレーズ変更: 既存 dek を新パスフレーズで再ラップ（データ再暗号化は不要）
export async function changePassphrase(dek, newPassphrase, bundle) {
  const salt = rand(16);
  const wrappedDEK = await wrapDEK(dek, await deriveKEK(newPassphrase, salt));
  return { ...bundle, salt: toB64(salt), wrappedDEK };
}

// リカバリーキー再発行: 既存 dek を新しいリカバリーキーで再ラップ。新キーと更新用フィールドを返す。
export async function regenerateRecovery(dek) {
  const recoveryKey = generateRecoveryKey();
  const recoverySalt = rand(16);
  const recoveryWrappedDEK = await wrapDEK(dek, await deriveKEK(recoveryKey, recoverySalt));
  return { recoveryKey, recoverySalt: toB64(recoverySalt), recoveryWrappedDEK };
}
