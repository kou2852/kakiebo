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
