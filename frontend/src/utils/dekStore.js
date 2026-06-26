// 解錠済みデータ鍵(DEK)を端末の IndexedDB に保持し、再オープン時のパスフレーズ入力を不要にする。
// CryptoKey オブジェクトをそのまま保存（raw を取り出さない）。サーバーへは一切送らない。
// 別端末・ブラウザデータ消去時は保持が無いので解錠画面に戻る（ゼロ知識性は維持）。
const DB_NAME = 'kk_e2e';
const STORE = 'dek';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run(mode, op) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = op(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** DEK(CryptoKey) を端末に保持 */
export async function saveDek(name, key) {
  try { await run('readwrite', (s) => s.put(key, name)); } catch { /* IndexedDB不可なら諦める（毎回解錠になるだけ） */ }
}
/** 端末から DEK を取り出す（無ければ null） */
export async function loadDek(name) {
  try { return (await run('readonly', (s) => s.get(name))) || null; } catch { return null; }
}
/** 端末の DEK を破棄（暗号化解除・鍵不一致時） */
export async function clearDek(name) {
  try { await run('readwrite', (s) => s.delete(name)); } catch { /* noop */ }
}
