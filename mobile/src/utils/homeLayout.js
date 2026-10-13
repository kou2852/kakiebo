// ホーム（ダッシュボード）に出す項目と、その並び。画面や保存から切り離した純関数（検証は homeLayout.check.mjs）。
//
// 利用者が出す・出さないと並び順を選べる（2026-10-13 指示）。期間の切り替えは選べない（常に出す。並びだけ変えられる）。
// 広告はこの一覧に入れない（常に一番下）。
// 保存は端末ごと（store/homeLayout.js）。アカウントでは共有しない。

export const HOME_ITEMS = [
  { id: 'networth', label: '純資産と推移' },
  { id: 'pending', label: '未記帳の自動取引', note: '対象があるときだけ出ます' },
  { id: 'period', label: '期間の切り替え', locked: true },
  { id: 'flow', label: '収支' },
  { id: 'breakdown', label: '支出内訳' },
  { id: 'accounts', label: '口座の残高', note: '残高のある口座があるときだけ出ます' },
  { id: 'trend', label: '支出の推移（6か月）', note: '支出があるときだけ出ます' },
  { id: 'budget', label: '予算の消化', note: '予算を決めているときだけ出ます' },
  { id: 'investments', label: '投資資産', note: '投資の科目があるときだけ出ます' },
];

export const DEFAULT_LAYOUT = HOME_ITEMS.map((x) => ({ id: x.id, on: true }));

const LOCKED = new Set(HOME_ITEMS.filter((x) => x.locked).map((x) => x.id));
const KNOWN = new Set(HOME_ITEMS.map((x) => x.id));

/**
 * 保存されていた並びを、いまのアプリの項目に合わせて直す。
 * 知らない項目（古い版にあったもの）は捨て、保存に無い項目（新しく増えたもの）は末尾に「出す」で足す。
 * 選べない項目は必ず「出す」にする。壊れた値なら初期の並び。
 */
export function normalizeLayout(saved) {
  if (!Array.isArray(saved)) return DEFAULT_LAYOUT.map((x) => ({ ...x }));
  const seen = new Set();
  const out = [];
  for (const x of saved) {
    if (!x || !KNOWN.has(x.id) || seen.has(x.id)) continue;
    seen.add(x.id);
    out.push({ id: x.id, on: LOCKED.has(x.id) ? true : x.on !== false });
  }
  for (const x of DEFAULT_LAYOUT) if (!seen.has(x.id)) out.push({ ...x });
  return out;
}

/** i 番目の項目を dir（-1 で上へ、+1 で下へ）動かした並び。端なら変えない */
export function moveItem(layout, i, dir) {
  const j = i + dir;
  if (j < 0 || j >= layout.length) return layout;
  const next = [...layout];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/** 出す・出さないを切り替えた並び。選べない項目は変えない */
export function toggleItem(layout, id) {
  if (LOCKED.has(id)) return layout;
  return layout.map((x) => (x.id === id ? { ...x, on: !x.on } : x));
}
