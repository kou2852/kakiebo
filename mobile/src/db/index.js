// 端末ローカルの保存先。オフラインでも常にここが「今の帳簿」になる。
//
// 方式: Web 版と同じく「データセット全体で1つのJSON」を持つ。理由は E2E 暗号化が
// データセット全体を1ブロブで封緘する方式（/api/encdata）だから。ここだけ行単位に分けても
// 同期の単位はブロブのままなので、噛み合わせが悪くなる。
// SQLite を使うのは、この JSON と「未同期の操作ログ」をアトミックに書ければ十分なため。
import * as SQLite from 'expo-sqlite';

let dbp = null;

function conn() {
  if (!dbp) {
    dbp = SQLite.openDatabaseAsync('kurofukubo.db').then(async (db) => {
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS dataset (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          json TEXT NOT NULL,
          rev INTEGER NOT NULL DEFAULT 0,   -- 同期済みサーバー版番号
          updated_at TEXT NOT NULL
        );
        -- サーバーが採番し直したIDの対応表。
        --
        -- ⚠ これが無いと、同期のたびに対応表が作り直され、既にサーバーへ作った
        --   仕訳や科目を「まだ無い」と判断して作り直す。部分失敗の再試行や
        --   同期の多重起動で帳簿が丸ごと重複する（実測で 1件→5件、57件→459件）。
        CREATE TABLE IF NOT EXISTS idmap (
          local_id TEXT PRIMARY KEY,
          server_id TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS pending (
          seq INTEGER PRIMARY KEY AUTOINCREMENT,
          intent TEXT NOT NULL,             -- 未同期の操作（サーバー最新へ再適用する）
          created_at TEXT NOT NULL
        );
      `);
      return db;
    });
  }
  return dbp;
}

export async function readLocal() {
  const db = await conn();
  const row = await db.getFirstAsync('SELECT json, rev FROM dataset WHERE id = 1');
  return row ? { dataset: JSON.parse(row.json), rev: row.rev } : null;
}

/** データセットを保存。intent を渡すと未同期キューへ同じトランザクションで積む。 */
export async function writeLocal(dataset, rev, intent) {
  const db = await conn();
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'INSERT INTO dataset (id, json, rev, updated_at) VALUES (1, ?, ?, ?) ' +
        'ON CONFLICT(id) DO UPDATE SET json = excluded.json, rev = excluded.rev, updated_at = excluded.updated_at',
      [JSON.stringify(dataset), rev, now]
    );
    if (intent) {
      await db.runAsync('INSERT INTO pending (intent, created_at) VALUES (?, ?)', [JSON.stringify(intent), now]);
    }
  });
}

/** サーバーが採番し直したIDの対応表を読む。local_id -> server_id。 */
export async function loadIdMap() {
  const db = await conn();
  const rows = await db.getAllAsync('SELECT local_id, server_id FROM idmap');
  return new Map(rows.map((r) => [r.local_id, r.server_id]));
}

/** 対応を1件覚える。同期が途中で落ちても残るよう、作成のたびに書く。 */
export async function rememberId(localId, serverId) {
  if (!localId || !serverId || localId === serverId) return;
  const db = await conn();
  await db.runAsync('INSERT OR REPLACE INTO idmap (local_id, server_id, created_at) VALUES (?, ?, ?)',
    [localId, serverId, new Date().toISOString()]);
}

export async function listPending() {
  const db = await conn();
  const rows = await db.getAllAsync('SELECT seq, intent FROM pending ORDER BY seq');
  return rows.map((r) => ({ seq: r.seq, intent: JSON.parse(r.intent) }));
}

/** 同期に成功した分だけ捨てる。同期中に積まれた操作を巻き込まないよう seq で切る。 */
export async function clearPendingUpTo(seq) {
  const db = await conn();
  await db.runAsync('DELETE FROM pending WHERE seq <= ?', [seq]);
}

/**
 * 未送信キューを全部捨てる。
 *
 * ⚠ 利用者が「サーバーを正にする」と明示的に選んだときだけ呼ぶこと。
 *   自動では絶対に呼ばない。未送信の操作はまだサーバーに入っていない変更であり、
 *   黙って捨てると端末でした記帳が消える。
 */
export async function clearAllPending() {
  const db = await conn();
  await db.runAsync('DELETE FROM pending');
}

export async function resetAll() {
  const db = await conn();
  await db.execAsync('DELETE FROM dataset; DELETE FROM pending; DELETE FROM idmap;');
}
