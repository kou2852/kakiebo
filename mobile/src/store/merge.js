// サーバーと端末の帳簿を突き合わせる。
//
// ⚠ 取り込み（replaceAll）は端末の帳簿を消す。使ってよいのは「失うものが無い」と
//   確かめられたときだけ。以前はログイン経路がすべて無条件に取り込んでいたため、
//   ゲストで記帳した人が Apple / Google でアカウントを作ると帳簿が消えていた。
//
// 衝突（同じ id が両方にあり中身が違う）は、利用者にどちらを正とするか選ばせる。
// 将来は1件ずつ選べるようにするが、まずは帳簿単位で選ぶ。
import { emptyDataset } from '../db/defaults.js'; // .js は node で検証スクリプトを走らせるため。Metro も解決できる

export const COLLECTIONS = [
  'accounts', 'journals', 'tags', 'allocs', 'wallets', 'presets', 'budgets', 'recurring', 'rules',
];

/**
 * 利用者のデータが入っているか。初期状態（既定26科目だけ）は「空」とみなす。
 *
 * ⚠ 既定科目の名前を変えただけの端末を「空」と誤判定すると、その変更を消してしまう。
 *   科目の中身の比較は鍵の順序に左右されて当てにならないので、呼び出し側で
 *   未送信キューの有無（＝何か操作したか）も併せて見ること。
 */
export function hasContent(ds) {
  if (!ds) return false;
  // 既定で入っているのは科目だけではない（プリセットも既定がある）。
  // コレクションごとに既定の id 集合と突き合わせる。
  const base = emptyDataset();
  for (const c of COLLECTIONS) {
    const cur = ds[c] || [];
    const def = new Set((base[c] || []).map((x) => x.id));
    if (cur.length !== def.size) return true;
    if (cur.some((x) => !def.has(x.id))) return true;
  }
  return false;
}

/**
 * id で突き合わせて合わせる。両方にある id は prefer 側を採る。
 * prefer は 'local'（この端末を正）か 'server'（サーバーを正）。
 * どちらを選んでも、片方にしか無いものは必ず残る＝消えない。
 */
export function mergeDatasets(server, local, prefer) {
  const win = prefer === 'server' ? server : local;
  const lose = prefer === 'server' ? local : server;
  const out = {};
  for (const c of COLLECTIONS) {
    const map = new Map();
    for (const it of lose[c] || []) map.set(it.id, it);
    for (const it of win[c] || []) map.set(it.id, it); // 後勝ち＝prefer 側
    out[c] = [...map.values()];
  }
  return out;
}

/** 選ばせる前に見せる要約。{ onlyLocal, onlyServer, conflict } */
export function diffSummary(server, local) {
  let onlyLocal = 0; let onlyServer = 0; let conflict = 0;
  for (const c of COLLECTIONS) {
    const s = new Map((server[c] || []).map((x) => [x.id, x]));
    const l = new Map((local[c] || []).map((x) => [x.id, x]));
    for (const [id, item] of l) {
      if (!s.has(id)) onlyLocal++;
      else if (!same(s.get(id), item)) conflict++;
    }
    for (const id of s.keys()) if (!l.has(id)) onlyServer++;
  }
  return { onlyLocal, onlyServer, conflict };
}

// 鍵の順序に左右されない比較。サーバーを往復すると順序が変わることがある。
function same(a, b) {
  const ka = Object.keys(a).filter((k) => a[k] !== undefined).sort();
  const kb = Object.keys(b).filter((k) => b[k] !== undefined).sort();
  if (ka.length !== kb.length || ka.some((k, i) => k !== kb[i])) return false;
  return ka.every((k) => (typeof a[k] === 'object' && a[k] !== null
    ? JSON.stringify(a[k]) === JSON.stringify(b[k])
    : a[k] === b[k]));
}

/**
 * マージ後に残るコードの衝突を洗い出す。
 *
 * 科目は id で突き合わせるので、id が違えば両方残る。その結果
 * 「別の科目なのに勘定科目コードが同じ」が生まれる。コードは一覧の並び順と
 * 体系（資産1000番台…）の根拠なので、重複したままだと帳簿として読めなくなる。
 *
 * ⚠ ここで自動的に片方を消したり振り直したりしない。どちらが本物かは
 *   利用者にしか分からない。出すところまでが役目。
 *
 * 返すのは [{ code, items: [{ ...account, side }] }]。side は
 * 'local'（この端末だけ） / 'server'（サーバーだけ） / 'both'（両方にある同じ id）。
 */
export function codeCollisions(merged, server, local) {
  const sid = new Set((server.accounts || []).map((a) => a.id));
  const lid = new Set((local.accounts || []).map((a) => a.id));
  const byCode = new Map();
  for (const a of merged.accounts || []) {
    if (!a.code) continue; // コード無しは並びの根拠にならないので衝突の対象外
    const side = sid.has(a.id) && lid.has(a.id) ? 'both' : (lid.has(a.id) ? 'local' : 'server');
    const list = byCode.get(a.code) || [];
    list.push({ ...a, side });
    byCode.set(a.code, list);
  }
  return [...byCode.entries()]
    .filter(([, items]) => items.length > 1)
    .map(([code, items]) => ({ code, items }))
    .sort((x, y) => (x.code > y.code ? 1 : -1));
}
