// 一覧の並び順（タグ・口座・プリセット・ルール・定期取引・勘定科目）。2026-10-20 追加。
// 検証: node src/utils/listOrder.check.mjs
//
// ・並びは「id の並び」だけを端末に持つ（store/listOrder.js）。サーバーは項目を決まった形でしか保存せず、
//   並び順の項目を足すにはバックエンドの変更が要るので、アカウントでは共有しない（2026-10-20 決定。ホームの表示と同じ扱い）
// ・並びに無い項目（あとから足したもの）は、並んだ項目のあとに、もとの順のまま付く
// ・並びに残った id が消えた項目でも害は無い（無視される）

export const ORDER_KEYS = ['tags', 'wallets', 'presets', 'rules', 'recurring', 'accounts'];

/** 保存の形をそろえる。壊れた値は空に */
export function normalizeOrder(raw) {
  const out = {};
  ORDER_KEYS.forEach((k) => {
    const v = raw?.[k];
    out[k] = Array.isArray(v) ? [...new Set(v.filter((x) => typeof x === 'string'))] : [];
  });
  return out;
}

/** 並びに従って並べ直す。並びが空なら、渡した配列をそのまま返す（描き直しを増やさない） */
export function applyOrder(items, ids) {
  if (!ids?.length || !items?.length) return items;
  const rank = new Map(ids.map((id, i) => [id, i]));
  const known = [];
  const rest = [];
  items.forEach((x) => (rank.has(x.id) ? known : rest).push(x));
  known.sort((a, b) => rank.get(a.id) - rank.get(b.id));
  return [...known, ...rest];
}

/**
 * 勘定科目を、区分の中で並べる。並びに無い科目は、並んだ科目のあとにコード順で付く。
 * 区分をまたぐ比較はしない（呼び出し側が区分ごとに渡す）
 */
export function applyAccountOrder(accounts, ids) {
  const byCode = (x, y) => ((x.code || '') > (y.code || '') ? 1 : (x.code || '') < (y.code || '') ? -1 : 0);
  const sorted = [...accounts].sort(byCode);
  return applyOrder(sorted, ids);
}

/** 見えている一覧（visible）の並びを、保存済みの並び（saved）へ反映する。見えていない項目の位置は動かさない */
export function mergeOrder(saved, visible) {
  const set = new Set(visible);
  return [...(saved || []).filter((id) => !set.has(id)), ...visible];
}

/** ids の from 番目を to 番目へ移す */
export function moveId(ids, from, to) {
  if (from === to || from < 0 || to < 0 || from >= ids.length || to >= ids.length) return ids;
  const next = [...ids];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
}

/**
 * ドラッグ中の指の位置から、落とす先の番号を決める。
 * heights は一覧の各行の高さ（上から順）、from はつかんだ行の番号、offset はつかんだ行の中心の移動量（下へ＋）。
 */
export function dropIndex(heights, from, offset) {
  let top = 0;
  const tops = heights.map((h) => { const t = top; top += h; return t; });
  const center = tops[from] + heights[from] / 2 + offset;
  for (let i = 0; i < heights.length; i++) {
    if (center < tops[i] + heights[i]) return i;
  }
  return heights.length - 1;
}
