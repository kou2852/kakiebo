// 未送信の操作をサーバーへ反映する。
//
// 基本方針は「スナップショットを上書きしない」こと。オフライン中に溜めた操作を
// サーバーの最新状態へ載せ直す（db/intents.js の意図の再適用）。丸ごと上書きすると、
// 他端末が同じ間に記帳した仕訳を黙って消す。
//
// アカウントには2形態あり、経路が根本的に違う:
//   暗号化あり … データセット全体が1ブロブ(/api/encdata)。rev で楽観的排他。
//   暗号化なし … コレクションごとに別エンドポイント。仕訳と科目は1件ずつ、他は全置換。
import * as api from '../api/client';
import * as coll from '../api/collections';
import { open, seal } from '../crypto';
import { applyIntents } from '../db/intents';

const COLLECTIONS = ['accounts', 'journals', 'tags', 'allocs', 'wallets', 'presets', 'budgets', 'recurring', 'rules'];
export const normalize = (raw) => Object.fromEntries(COLLECTIONS.map((c) => [c, raw?.[c] || []]));

// サーバー側が「全置換 + 版番号」で受けるコレクション
const VERSIONED = {
  budgets: coll.budgets, recurring: coll.recurring, presets: coll.presets,
  rules: coll.rules, allocs: coll.allocs,
};
// 版番号なしの全置換
const PLAIN = { tags: coll.tags, wallets: coll.wallets };

/** 暗号化アカウント: 復号 → 意図を再適用 → 封緘して送る。409 は取り直して1回だけ再試行。 */
async function pushEncrypted(dek, intents) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const ed = await api.encdata.get();
    const server = normalize(ed?.ct ? open(dek, ed.ct) : {});
    const merged = applyIntents(server, intents);
    try {
      const saved = await api.encdata.save({ bundle: ed.bundle, ct: seal(dek, merged), rev: ed.rev || 0 });
      return { dataset: merged, rev: saved.rev, notes: [] };
    } catch (e) {
      if (e.status !== 409) throw e; // 409＝他端末が先に保存した。取り直してやり直す。
    }
  }
  throw new Error('他の端末と競合が続いています。時間をおいて再試行してください');
}

/** 平文アカウント: 仕訳・科目は1件ずつ、その他はコレクション単位で全置換。 */
async function pushPlain(intents, local) {
  const snapshot = await api.data.exportAll();
  const server = normalize(snapshot);
  const revs = snapshot.revs || {};
  const notes = [];

  // サーバーは作成時に自前で id を採番する。オフラインで作った仕訳の id は通らないので、
  // 対応表を持ち、後続の更新・削除を採番後の id へ読み替える。
  const idMap = new Map();
  const rid = (id) => idMap.get(id) || id;

  const perItem = {
    journals: { ep: coll.journals, ids: new Set(server.journals.map((j) => j.id)) },
    accounts: { ep: coll.accounts, ids: new Set(server.accounts.map((a) => a.id)) },
  };
  const bulk = new Set();

  for (const intent of intents) {
    const target = perItem[intent.c];
    if (target) {
      const { ep, ids } = target;
      if (intent.t === 'upsert') {
        const { id, ...body } = intent.item;
        const sid = rid(id);
        if (ids.has(sid)) await ep.update(sid, body);
        else { const created = await ep.create(body); idMap.set(id, created.id); ids.add(created.id); }
      } else if (intent.t === 'remove') {
        const sid = rid(intent.id);
        if (ids.has(sid)) { await ep.remove(sid); ids.delete(sid); }
      }
    } else {
      bulk.add(intent.c);
    }
  }

  // 全置換のコレクションは、意図を1件ずつ送らず最終状態をまとめて送る（Web 版と同じ扱い）。
  for (const c of bulk) {
    if (PLAIN[c]) { await PLAIN[c].save(local[c]); continue; }
    const ep = VERSIONED[c];
    if (!ep) continue;
    try {
      await ep.save(local[c], revs[c] ?? 0);
    } catch (e) {
      if (e.status !== 409) throw e;
      const fresh = await ep.list(); // 他端末が先に保存していた。版番号を取り直して1回だけ再試行。
      await ep.save(local[c], fresh.rev);
    }
  }

  // サーバーが採番した id を手元へ反映するため、権威的な状態を取り直す。
  return { dataset: normalize(await api.data.exportAll()), rev: 0, notes };
}

/** アカウントの形態を判定して同期する。 */
export async function syncNow({ dek, local, pending }) {
  const ed = await api.encdata.get().catch(() => null);
  const encrypted = !!(ed && ed.bundle);
  if (encrypted && !dek) throw new Error('暗号化が有効です。先に解錠してください');

  const result = encrypted
    ? await pushEncrypted(dek, pending.map((p) => p.intent))
    : await pushPlain(pending.map((p) => p.intent), local);

  // 同期中に積まれた操作を巻き込まないよう、処理した最後の seq までを消す。
  return { ...result, upTo: pending.length ? pending[pending.length - 1].seq : 0 };
}
