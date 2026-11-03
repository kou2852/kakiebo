// タグ配分の付け替え。口座ごとの配分を、あるタグから別のタグへ指定の金額だけ動かす。
// 残高も仕訳も動かさない（配分は「いくらを何に取っておくか」の目安なので、仕訳は増やさない）。
// 付け替え元は 0 円を下回ってよい（マイナスの配分＝他のタグから内部的に借りている状態）。
// 動かすのは配分の合計が変わらない範囲だけなので、口座の残高・未配分は付け替えで変わらない。
// allocs は { accountId, tagId, amount } の配列（id なし）。flow は computeTagBalances().byAccount[accountId]。

const amountOf = (allocs, accountId, tagId) => (
  (allocs || []).find((a) => a.accountId === accountId && a.tagId === tagId)?.amount || 0
);

// タグの残り。配分に、記帳でタグを付けた分の増減を足したもの（マイナスもある）
export const tagLeft = (allocs, flow, accountId, tagId) => amountOf(allocs, accountId, tagId) + (flow?.[tagId] || 0);

// 付け替え後の allocs を返す。付け替えられない指定（同じタグ・0 以下・小数）は null。元の配列は書き換えない。
// 付け替え元は金額の上限なしでマイナスになってよい。0 円になった行は残さない。
export function moveAlloc(allocs, { accountId, fromId, toId, amount }) {
  if (!accountId || !fromId || !toId || fromId === toId) return null;
  if (!Number.isInteger(amount) || amount <= 0) return null;

  const next = (allocs || []).map((a) => ({ ...a }));
  const bump = (tagId, diff) => {
    const hit = next.find((a) => a.accountId === accountId && a.tagId === tagId);
    if (hit) hit.amount += diff;
    else next.push({ accountId, tagId, amount: diff });
  };
  bump(fromId, -amount);
  bump(toId, amount);
  return next.filter((a) => a.amount !== 0);
}
