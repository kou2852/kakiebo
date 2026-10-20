// 純資産に入れる科目の組み合わせ（2026-10-17 追加）。例: 仮口座や投資を外した純資産をホームで見る。
// 検証: node src/utils/netWorthSets.check.mjs
//
// ・変えるのはホームの純資産（数字・推移・前月比）だけ。貸借対照表は変えない（帳簿そのものは全部の科目で正しく出す）
// ・組み合わせは「外す科目」で持つ。あとから足した科目は、何もしなくても入る（入れ忘れで数字が欠けない）
// ・非表示（hidden）とは別物。非表示は記帳の候補から隠すだけで、純資産には入ったまま
// ・端末ごとに保存する（ホームの表示と同じ。store/netWorthSets.js）
//
// ホームの純資産のカードは、選んだ組み合わせ（shown。「すべての科目」＝ALL を含めて最大 MAX_SHOWN）を
// 横にスライドして見比べる（2026-10-18 指示）。active は最後に止めたページ（次に開いたときそこから）。

export const ALL = 'all';
export const MAX_SHOWN = 5;

/** 保存の形をそろえる。壊れた値は空に */
export function normalizeSets(raw) {
  const sets = Array.isArray(raw?.sets) ? raw.sets
    .filter((x) => x && typeof x.id === 'string' && typeof x.name === 'string' && x.id !== ALL)
    .map((x) => ({ id: x.id, name: x.name, exclude: Array.isArray(x.exclude) ? x.exclude.filter((v) => typeof v === 'string') : [] }))
    : [];
  const ids = new Set([ALL, ...sets.map((x) => x.id)]);
  // 選んだものの並びは「すべての科目」→ 保存した順。選んだ記録が無ければ（前の版の保存）先頭から MAX_SHOWN 個
  const picked = Array.isArray(raw?.shown) ? new Set(raw.shown.filter((v) => ids.has(v))) : null;
  let shown = [ALL, ...sets.map((x) => x.id)].filter((id) => (picked ? picked.has(id) : true)).slice(0, MAX_SHOWN);
  if (!shown.length) shown = [ALL];
  const active = shown.includes(raw?.active) ? raw.active : null;
  return { active, shown, sets };
}

/** ホームのカードに並べる組み合わせ（null＝すべての科目） */
export const shownPages = (state) => state.shown.map((id) => (id === ALL ? null : state.sets.find((x) => x.id === id)));

/** 最後に止めた組み合わせ（null＝すべての科目） */
export const activeSet = (state) => state.sets.find((x) => x.id === state.active) || null;

/** 純資産の計算に渡す科目。外す科目は資産・負債だけを抜く（収益・費用は純資産の計算に使わない） */
export function accountsFor(accounts, set) {
  if (!set?.exclude?.length) return accounts;
  const out = new Set(set.exclude);
  return accounts.filter((a) => !((a.type === 'asset' || a.type === 'liability') && out.has(a.id)));
}

/** 組み合わせを足すか直す（id が同じなら置き換え）。新しく足したものは、空きがあればホームに出す */
export function upsertSet(state, set) {
  const isNew = !state.sets.some((x) => x.id === set.id);
  const sets = isNew ? [...state.sets, set] : state.sets.map((x) => (x.id === set.id ? set : x));
  const shown = isNew && state.shown.length < MAX_SHOWN ? [...state.shown, set.id] : state.shown;
  return normalizeSets({ active: state.active, shown, sets });
}

/** 組み合わせを消す */
export function removeSet(state, id) {
  return normalizeSets({ ...state, shown: state.shown.filter((x) => x !== id), sets: state.sets.filter((x) => x.id !== id) });
}

/** ホームに出すかを切り替える。最大 MAX_SHOWN 個、最低1個（足せない・外せないときは state をそのまま返す） */
export function toggleShown(state, id) {
  if (state.shown.includes(id)) {
    if (state.shown.length <= 1) return state;
    return normalizeSets({ ...state, shown: state.shown.filter((x) => x !== id) });
  }
  if (state.shown.length >= MAX_SHOWN) return state;
  return normalizeSets({ ...state, shown: [...state.shown, id] });
}

/** 止めたページを覚える（null＝すべての科目） */
export const selectSet = (state, id) => ({ ...state, active: id && state.shown.includes(id) ? id : null });
