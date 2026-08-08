// localStorage 向けの暗号化データI/O層（E2E方式A: データセット全体を1ブロブで封緘）。
// crypto.js の上に乗る薄い層。鍵バンドル（平文鍵なし）と暗号文を別キーに保存し、
// 既存の平文キー(kk4 / kk4_guest)とは分離する。オプトイン・後方互換（未有効化なら無干渉）。
import { seal, open, setupEncryption, unlock, recover, changePassphrase } from './crypto.js';

const blobKey = (key) => `${key}__enc`;       // 暗号文ブロブ
const metaKey = (key) => `${key}__encmeta`;   // 鍵バンドル（平文鍵を含まない）

/** このストレージキーが暗号化有効か */
export function hasEncryption(key) {
  return !!localStorage.getItem(metaKey(key));
}
export function readBundle(key) {
  try { return JSON.parse(localStorage.getItem(metaKey(key))); } catch { return null; }
}
export function writeBundle(key, bundle) {
  localStorage.setItem(metaKey(key), JSON.stringify(bundle));
}

/** 暗号文をそのまま読む（復号しない）。解錠できないときのバックアップ書き出しに使う。 */
export function readCipher(key) {
  return localStorage.getItem(blobKey(key));
}

/** 復号せずに暗号化を捨てる。パスフレーズもリカバリーキーも失った人の最終手段。 */
export function clearEncryption(key) {
  localStorage.removeItem(blobKey(key));
  localStorage.removeItem(metaKey(key));
}

/** dek でデータセット全体を封緘して保存 */
export async function saveEncrypted(key, dek, dataset) {
  localStorage.setItem(blobKey(key), await seal(dek, dataset));
}
/** dek で復号して返す（暗号文が無ければ null） */
export async function loadEncrypted(key, dek) {
  const blob = localStorage.getItem(blobKey(key));
  return blob ? open(dek, blob) : null;
}

/**
 * 暗号化を有効化：既存(平文)データセットを暗号化し、鍵バンドル＋暗号文を保存、平文キーは削除。
 * recoveryKey を返す（一度だけ表示して保存させる）。dek は呼び出し側がセッション保持する。
 */
export async function enableEncryption(key, passphrase, dataset) {
  const { dek, recoveryKey, bundle } = await setupEncryption(passphrase);
  writeBundle(key, bundle);
  await saveEncrypted(key, dek, dataset);
  localStorage.removeItem(key); // 平文を消去
  return { dek, recoveryKey };
}

/** パスフレーズで解錠 → dek（違えば例外） */
export async function unlockLocal(key, passphrase) {
  const b = readBundle(key);
  if (!b) throw new Error('not encrypted');
  return unlock(passphrase, b);
}
/** リカバリーキーで解錠 → dek */
export async function recoverLocal(key, recoveryKey) {
  const b = readBundle(key);
  if (!b) throw new Error('not encrypted');
  return recover(recoveryKey, b);
}
/** パスフレーズ変更（DEK 再ラップのみ） */
export async function changeLocalPassphrase(key, dek, newPassphrase) {
  const b = readBundle(key);
  if (!b) throw new Error('not encrypted');
  writeBundle(key, await changePassphrase(dek, newPassphrase, b));
}

/** 暗号化を解除：dek で復号した平文を平文キーへ戻し、暗号メタ/ブロブを削除。復号後の dataset を返す。 */
export async function disableEncryption(key, dek) {
  const dataset = await loadEncrypted(key, dek);
  if (dataset != null) localStorage.setItem(key, JSON.stringify(dataset));
  localStorage.removeItem(blobKey(key));
  localStorage.removeItem(metaKey(key));
  return dataset;
}
