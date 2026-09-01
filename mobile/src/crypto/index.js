// E2E（ゼロ知識）暗号のコア。frontend/src/utils/crypto.js の移植版。
// 方式・パラメータは Web 版と完全に同一で、Web 版で暗号化したデータをそのまま復号できる（実機で検証済み）。
//
// 方式: データ・鍵ラップ = AES-256-GCM、KDF = PBKDF2-SHA256（60万回）。
// 実装の内訳:
//   AES-GCM … 純JS(@noble)。呼び出し回数が多く、実測で十分速い。
//   PBKDF2  … WebView 経由で WebKit の Web Crypto（./kdf.js を参照）。純JSでは実機 138秒で使い物にならない。
// 差し替えるときは deriveKEK() の中身だけを変えれば済むようにしてある。

import { gcm } from '@noble/ciphers/aes.js';
import { deriveKEKFast } from './kdf.js';
import { toB64, fromB64, concat } from './base64.js';

export { toB64, fromB64 };

const te = new TextEncoder();
const td = new TextDecoder();

const PBKDF2_ITERATIONS = 600000; // OWASP 推奨水準（Web 版と一致させること）
const KDF = 'PBKDF2-SHA256';
const CIPHER = 'AES-256-GCM';
const NONCE_LEN = 12; // AES-GCM IV
const KEY_LEN = 32; // AES-256

// Expo Go(Hermes) には globalThis.crypto が無い（実機で確認済み）ので expo-crypto に落とす。
// 検証スクリプトを Node で走らせるときは globalThis.crypto 側が使われる。
let expoRandom = null;
export function randomBytes(n) {
  return rand(n);
}

function rand(n) {
  const c = globalThis.crypto;
  if (c && typeof c.getRandomValues === 'function') return c.getRandomValues(new Uint8Array(n));
  if (!expoRandom) expoRandom = require('expo-crypto').getRandomBytes;
  return expoRandom(n);
}


// ── 鍵 ──
// パスフレーズ + salt → KEK。iterations は必ず「そのラップを作ったときの値」を渡す。
// ここで現在の定数を使うと、PBKDF2_ITERATIONS を引き上げた瞬間に既存 bundle が開けなくなる。
// 鍵導出は WebView 側の Web Crypto（ネイティブ実装）に投げる。
// 純JSだと iPhone 12 実機で 138秒かかり実用にならないため（Node は 0.7秒／Hermes は JIT が無い）。
// Web 版とまったく同じ WebKit の実装を使うので、暗号としての互換性はむしろ保証される。
function deriveKEK(passphrase, salt, iterations) {
  return deriveKEKFast(passphrase, salt, iterations, KEY_LEN);
}

const passIterations = (b) => b.iterations || PBKDF2_ITERATIONS;
const recoveryIterations = (b) => b.recoveryIterations || b.iterations || PBKDF2_ITERATIONS;

// ── AES-GCM（noble は認証タグを暗号文末尾に連結する。Web Crypto と同じ形式）──
function sealRaw(key, plain) {
  const nonce = rand(NONCE_LEN);
  return toB64(concat(nonce, gcm(key, nonce).encrypt(plain)));
}
function openRaw(key, b64blob) {
  const blob = fromB64(b64blob);
  return gcm(key, blob.slice(0, NONCE_LEN)).decrypt(blob.slice(NONCE_LEN)); // 鍵違いは例外
}

// ── データの封緘/開封 ──
export function seal(dek, obj) {
  return sealRaw(dek, te.encode(JSON.stringify(obj)));
}
export function open(dek, b64blob) {
  return JSON.parse(td.decode(openRaw(dek, b64blob)));
}

// ユーザー提示用リカバリーキー（例: A1B2C-3D4E5-...）。約140bit。
export function generateRecoveryKey() {
  return (toB64(rand(20)).replace(/[+/=]/g, '').toUpperCase().match(/.{1,5}/g) || []).join('-');
}

// ── ライフサイクル ──
export async function setupEncryption(passphrase) {
  const dek = rand(KEY_LEN);
  const salt = rand(16);
  const wrappedDEK = sealRaw(await deriveKEK(passphrase, salt, PBKDF2_ITERATIONS), dek);
  const recoveryKey = generateRecoveryKey();
  const recoverySalt = rand(16);
  const recoveryWrappedDEK = sealRaw(await deriveKEK(recoveryKey, recoverySalt, PBKDF2_ITERATIONS), dek);
  return {
    dek,
    recoveryKey,
    bundle: {
      v: 2, kdf: KDF, cipher: CIPHER,
      iterations: PBKDF2_ITERATIONS, salt: toB64(salt), wrappedDEK,
      recoveryIterations: PBKDF2_ITERATIONS, recoverySalt: toB64(recoverySalt), recoveryWrappedDEK,
    },
  };
}

// 解錠: パスフレーズ + bundle → dek（パスフレーズ違いは例外）
export async function unlock(passphrase, bundle) {
  return openRaw(await deriveKEK(passphrase, fromB64(bundle.salt), passIterations(bundle)), bundle.wrappedDEK);
}

// リカバリー: リカバリーキー + bundle → dek
export async function recover(recoveryKey, bundle) {
  return openRaw(await deriveKEK(recoveryKey, fromB64(bundle.recoverySalt), recoveryIterations(bundle)), bundle.recoveryWrappedDEK);
}

// パスフレーズ変更: 既存 dek を新パスフレーズで再ラップ（データ再暗号化は不要）
export async function changePassphrase(dek, newPassphrase, bundle) {
  const salt = rand(16);
  const wrappedDEK = sealRaw(await deriveKEK(newPassphrase, salt, PBKDF2_ITERATIONS), dek);
  // iterations も一緒に更新する。据え置くと、いま作ったラップを古い回数で開こうとして失敗する。
  return { ...bundle, v: 2, iterations: PBKDF2_ITERATIONS, salt: toB64(salt), wrappedDEK };
}

// リカバリーキー再発行
export async function regenerateRecovery(dek) {
  const recoveryKey = generateRecoveryKey();
  const recoverySalt = rand(16);
  const recoveryWrappedDEK = sealRaw(await deriveKEK(recoveryKey, recoverySalt, PBKDF2_ITERATIONS), dek);
  return { recoveryKey, recoveryIterations: PBKDF2_ITERATIONS, recoverySalt: toB64(recoverySalt), recoveryWrappedDEK };
}

export const PARAMS = { PBKDF2_ITERATIONS, KDF, CIPHER, NONCE_LEN, KEY_LEN };
