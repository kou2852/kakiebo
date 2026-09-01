// サーバーから帳簿を取り出して端末へ落とす。**書き込みは一切しない。**
// 書き込み同期は削除の伝播（/api/import は upsert なので消えない）まで含めて別途設計する。
import * as api from '../api/client';
import { open } from '../crypto';
import { unlock } from '../crypto';

/** 暗号化が有効なアカウントか調べる。{ encrypted, bundle, ct, rev } */
export async function probe() {
  const ed = await api.encdata.get().catch(() => null);
  return { encrypted: !!(ed && ed.bundle && ed.ct), ...(ed || {}) };
}

/** パスフレーズで解錠して DEK を得る。 */
export async function unlockWith(bundle, passphrase) {
  return unlock(passphrase, bundle);
}

const COLLECTIONS = ['accounts', 'journals', 'tags', 'allocs', 'wallets', 'presets', 'budgets', 'recurring', 'rules'];
const normalize = (raw) => Object.fromEntries(COLLECTIONS.map((c) => [c, raw?.[c] || []]));

/** 暗号化アカウント: 暗号文を復号して返す。 */
export function pullEncrypted(dek, ct) {
  return normalize(open(dek, ct));
}

/** 平文アカウント: /api/export をそのまま使う。 */
export async function pullPlain() {
  const raw = await api.data.exportAll();
  return normalize(raw);
}
