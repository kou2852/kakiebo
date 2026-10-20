// 仕訳行に付けるタグ（split）の決め方。仕訳モーダルから切り出した純粋ロジック。
//
// プリセットのタグは、展開した時点では split にしない。プリセットの金額は0（＝都度入力）に
// できるため、その時点で確定した金額を割り当てられないから。金額が決まる保存時にここで作る。

/** 行に付いているタグの数。プリセット由来のタグはまだ split になっていないので別に数える。 */
export const tagCount = (l) => (
  l.splits?.length ? l.splits.length : (l.presetSplits?.length || 0)
);

/**
 * プリセットのタグ配分を、実際に入力された金額に合わせて割り当て直す。
 *
 * 金額を決めてあるプリセットは「行の金額に対する割合」を保つ。
 *   例: 金額1000で 食費600/娯楽400 → 1500で記帳すると 900/600。
 *   一部だけタグを付けている場合（1000のうち300だけ食費）もその比率のまま残る。
 * 金額が都度入力（0）のプリセットは基準になる金額が無いので、入れた数字どうしの比率とみなす。
 *   例: 食費70/娯楽30 → 1500で記帳すると 1050/450。
 *
 * @param {{tagId:string, amount:number}[]} presetSplits
 * @param {number} presetAmount プリセット側の金額（0＝都度入力）
 * @param {number} amount 実際に入力された金額
 */
export function scalePresetSplits(presetSplits, presetAmount, amount) {
  const src = (presetSplits || []).filter((s) => s.tagId && s.amount > 0);
  if (!src.length || !(amount > 0)) return [];
  const sum = src.reduce((s, x) => s + x.amount, 0);
  const base = presetAmount > 0 ? presetAmount : sum;
  if (!(base > 0)) return [];

  const scale = amount / base;
  const out = src.map((s) => ({ tagId: s.tagId, amount: Math.round(s.amount * scale) }));
  // 四捨五入のずれを最後の1件で吸収する。行の金額は超えさせない。
  const want = Math.min(amount, Math.round(sum * scale));
  const diff = want - out.reduce((s, x) => s + x.amount, 0);
  if (diff !== 0) out[out.length - 1].amount += diff;
  return out.filter((s) => s.amount > 0);
}

/**
 * 保存時に行へ載せるタグ配分を決める。
 * 手動で付けたタグが最優先。無ければプリセットのタグを金額に合わせて割り当てる。
 */
export function resolveSplits(line, amount) {
  if (line.splits?.length) return line.splits.filter((s) => s.tagId && s.amount > 0);
  return scalePresetSplits(line.presetSplits, parseFloat(line.presetAmount) || 0, amount);
}

/**
 * プリセットの行からタグ配分を取り出す。
 * 旧形式（1行1タグの tagId）で保存されたプリセットもここで吸収する。
 */
export function presetLineSplits(line) {
  if (line?.splits?.length) return line.splits.filter((s) => s.tagId && s.amount > 0);
  // 旧形式は行の全額に1つのタグ。金額未設定なら比率1（＝全額）として扱う。
  return line?.tagId ? [{ tagId: line.tagId, amount: line.amount || 1 }] : [];
}

/**
 * 編集前の行から、アプリの入力欄に無い項目を引き継ぐ（複数タグの配分 splits・税率など）。
 *
 * ⚠ アプリの入力欄は「科目・金額・タグ1つ」しか持たない。行をその場で作り直すと、ウェブで付けた
 *   複数タグの配分が保存のたびに消える（2026-09-24 に確認）。next には入力欄で決めた項目だけを渡す。
 *
 * 金額を変えたときは、配分を同じ比率で付け直す（一部だけタグを付けていた場合もその比率のまま）。
 * 金額が0（プリセットの都度入力）のときは比率として持っているので、そのまま残す。
 */
export function carryLine(prev, next) {
  if (!prev) return next;
  const out = { ...prev, ...next };
  if (prev.splits?.length) {
    const from = Number(prev.amount) || 0;
    const to = Number(next.amount) || 0;
    out.splits = from === to || !(to > 0) ? prev.splits : scalePresetSplits(prev.splits, from, to);
    if (!out.splits.length) delete out.splits;
  }
  return out;
}

/**
 * 定期取引の行に、タグ配分を載せる（2026-10-21）。
 * 1つのタグを行の全額に付けるだけなら、ウェブ版の定期取引と同じ行の tagId で持つ
 * （ウェブの編集画面は splits を読めず、保存で落とすため。記帳のとき splits に直して付ける）。
 * 一部だけ・複数のタグは splits で持つ。どちらでも splitsToRows が読める。
 * @param {object} out 行（書き換えて返す）
 */
export function storeLineTags(out, splits, amount) {
  delete out.tagId;
  delete out.splits;
  if (!splits?.length) return out;
  if (splits.length === 1 && splits[0].amount === amount) out.tagId = splits[0].tagId;
  else out.splits = splits;
  return out;
}

// ── 記帳画面のタグ欄 ─────────────────────────────────────
//
// タグ欄は「行」の並び: [{ tagId, amount }]。amount は入力中の文字列。
//   ・1つだけで金額が空 … 行の全額に付ける（いちばん多い使い方。金額を入れさせない）
//   ・金額を入れたタグ … その金額だけ付ける。1つだけでも入れられる（一部だけタグを付ける）
//   ・2つ以上 … タグごとに金額を入れる
//   ・タグの金額の合計は、行の金額と合わせなくてよい（超えてもよい。整合性は確かめない・2026-10-20）
// 保存するときは、ウェブと同じ splits の形にする。
// ⚠ 行の tagId に入れないこと。タグごとの残り（bookkeeping.js の computeTagBalances）は
//   splits しか読まないので、tagId に入れたタグは配分に入らない（2026-10-15 に見つけた不具合）。

const yenOf = (v) => Number(String(v ?? '').replace(/[^0-9]/g, '')) || 0;

/** タグ欄の行を、保存する splits にする。 */
export function rowsToSplits(rows, amount) {
  const list = (rows || []).filter((r) => r.tagId);
  if (!list.length || !(amount > 0)) return [];
  if (list.length === 1 && String(list[0].amount ?? '') === '') return [{ tagId: list[0].tagId, amount }];
  return list.map((r) => ({ tagId: r.tagId, amount: yenOf(r.amount) })).filter((s) => s.amount > 0);
}

/** 保存済みの行から、タグ欄の行を作る。splits と、古い形（行の tagId）の両方を読む。 */
export function splitsToRows(line) {
  const sp = (line?.splits || []).filter((s) => s.tagId && s.amount > 0);
  if (sp.length) {
    // 1つで全額なら、金額を出さない形に戻す（入力欄を増やさない）
    if (sp.length === 1 && sp[0].amount === Number(line.amount)) return [{ tagId: sp[0].tagId, amount: '' }];
    return sp.map((s) => ({ tagId: s.tagId, amount: String(s.amount) }));
  }
  return line?.tagId ? [{ tagId: line.tagId, amount: '' }] : [];
}

/** 金額を決めていないプリセットのタグ（比率）を、入れた金額に合わせたタグ欄の行にする。 */
export function ratioRows(ratio, amount) {
  if (!(amount > 0)) return (ratio || []).map((s) => ({ tagId: s.tagId, amount: '' }));
  return scalePresetSplits(ratio, 0, amount).map((s) => ({ tagId: s.tagId, amount: String(s.amount) }));
}

/** タグ欄に保存できない理由があれば返す。無ければ null。合計と行の金額の突き合わせはしない。 */
export function tagRowsProblem(rows) {
  const list = (rows || []).filter((r) => r.tagId);
  if (list.length < 2 && !list.some((r) => String(r.amount ?? '') !== '')) return null;
  if (list.some((r) => !(yenOf(r.amount) > 0))) return 'タグごとの金額を入れてください';
  return null;
}

/** 借方と貸方の行のタグが同じか（片方だけに付いている場合も同じとみなす）。違えば簡易フォームでは直せない。 */
export function sameTagRows(a, b) {
  if (!a.length || !b.length) return true;
  const key = (rows) => JSON.stringify([...rows].sort((x, y) => (x.tagId > y.tagId ? 1 : -1)));
  return key(a) === key(b);
}
