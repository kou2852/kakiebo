// localStorage暗号化I/O層の検証（localStorageをモックしてNodeで実行）
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const cs = await import('../../frontend/src/utils/cryptoStore.js');

const ok = (label, cond) => console.log((cond ? 'PASS' : 'FAIL') + ' — ' + label);
let pass = true; const must = (l, c) => { if (!c) pass = false; ok(l, c); };

const KEY = 'kk4_guest';
const dataset = {
  accounts: [{ id: 'e09', name: '住居費', type: 'expense' }],
  journals: [{ id: 'j1', date: '2026-06-16', desc: '家賃', lines: [{ accountId: 'e09', side: 'dr', amount: 80000 }] }],
  tags: [], wallets: [], budgets: [], presets: [], recurring: [], rules: [], allocs: [],
};

// 事前に平文で保存されている状態
localStorage.setItem(KEY, JSON.stringify(dataset));

// 有効化
const { dek, recoveryKey } = await cs.enableEncryption(KEY, 'pass-1234', dataset);
must('有効化後 hasEncryption=true', cs.hasEncryption(KEY));
must('平文キーが削除される', localStorage.getItem(KEY) === null);
must('暗号メタに平文鍵が無い', !JSON.stringify(cs.readBundle(KEY)).includes('住居費') && !!cs.readBundle(KEY).wrappedDEK);
must('暗号文ブロブに平文が出ない', !(localStorage.getItem(KEY + '__enc') || '').includes('家賃') && !(localStorage.getItem(KEY + '__enc') || '').includes('80000'));
must('リカバリーキー発行', typeof recoveryKey === 'string' && recoveryKey.length >= 10);

// 解錠（パスフレーズ）→ 復号一致
const dek2 = await cs.unlockLocal(KEY, 'pass-1234');
must('解錠して復号一致', JSON.stringify(await cs.loadEncrypted(KEY, dek2)) === JSON.stringify(dataset));

// 誤パスフレーズは失敗
let wrong = false; try { await cs.unlockLocal(KEY, 'nope'); } catch { wrong = true; }
must('誤パスフレーズは例外', wrong);

// リカバリーキーで解錠
const dek3 = await cs.recoverLocal(KEY, recoveryKey);
must('リカバリーキーで復号一致', JSON.stringify(await cs.loadEncrypted(KEY, dek3)) === JSON.stringify(dataset));

// パスフレーズ変更
await cs.changeLocalPassphrase(KEY, dek, 'new-pass-5678');
const dek4 = await cs.unlockLocal(KEY, 'new-pass-5678');
must('変更後の新パスフレーズで復号一致', JSON.stringify(await cs.loadEncrypted(KEY, dek4)) === JSON.stringify(dataset));

// 解除 → 平文へ戻る・メタ/ブロブ消える
const restored = await cs.disableEncryption(KEY, dek4);
must('解除で平文へ復元一致', JSON.stringify(restored) === JSON.stringify(dataset));
must('解除後 hasEncryption=false', !cs.hasEncryption(KEY));
must('解除後 平文キーが復活', JSON.stringify(JSON.parse(localStorage.getItem(KEY))) === JSON.stringify(dataset));

console.log(pass ? '\nALL PASS' : '\nSOME FAILED');
if (!pass) process.exit(1);
