// 解錠済みデータ鍵(DEK)を端末の Keychain に保持し、起動のたびのパスフレーズ入力を省く。
// Web 版の utils/dekStore.js（IndexedDB）に相当する。**サーバーへは一切送らない。**
// 端末を変えた・アプリを消したなら鍵は無いので解錠画面に戻る（ゼロ知識性は保たれる）。
import * as SecureStore from 'expo-secure-store';
import { fromB64, toB64 } from './base64.js';

const key = (env) => `kk_dek_${env}`;

export async function saveDek(env, dek) {
  try { await SecureStore.setItemAsync(key(env), toB64(dek)); }
  catch { /* Keychain が使えなくても毎回解錠になるだけ */ }
}

export async function loadDek(env) {
  try {
    const v = await SecureStore.getItemAsync(key(env));
    return v ? fromB64(v) : null;
  } catch { return null; }
}

export async function clearDek(env) {
  try { await SecureStore.deleteItemAsync(key(env)); } catch { /* noop */ }
}
