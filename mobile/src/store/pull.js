// サーバーから帳簿を取り出して端末へ落とす。**書き込みは一切しない。**
// 書き込み同期は削除の伝播（/api/import は upsert なので消えない）まで含めて別途設計する。
import * as api from '../api/client';
import { open } from '../crypto';
import { unlock } from '../crypto';

/**
 * 暗号化が有効なアカウントか調べる。{ encrypted, bundle, ct, rev }
 *
 * ⚠ 例外を握りつぶして「暗号化なし」に倒してはいけない。
 *   以前は catch(() => null) だったため、通信断・500・タイムアウトでも
 *   「平文アカウント」と判定し、空の平文コレクションを取り込んで端末の帳簿を
 *   消す経路になっていた。パスフレーズを聞かれることもない。
 *
 *   「暗号化なし」と断定してよいのは、サーバーが明示的に「無い」と答えたとき
 *   （404 = まだ一度も暗号化を有効にしていない）だけ。それ以外は投げて中断する。
 */
export async function probe() {
  let ed;
  try {
    ed = await api.encdata.get();
  } catch (e) {
    if (e?.status === 404) return { encrypted: false };
    throw e;
  }
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
