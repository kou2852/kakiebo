// 勘定科目の非表示。ウェブ版（2026-09-23 リリース、コミット 58227d9）と同じ決めごと。
// 検証: node src/utils/hiddenAccounts.check.mjs
//
// 非表示は「これから入力する科目を選ぶ場所」の候補から外すだけ。
// ⚠ 集計（ダッシュボード・レポート）、仕訳帳での科目名の表示、CSV の自動一致には効かせない。
//   残高が残ったまま隠れると貸借が合わなくなる。非表示でも残高があれば必ず出す。
//
// 既存データにはフィールドが無いので、!!a.hidden で判定する。値は 0/1（サーバーが正規化する）。

export const isHidden = (a) => !!a?.hidden;

/**
 * 選択肢に出す科目。非表示を外す。
 *
 * ⚠ いま選ばれている科目（keep）は非表示でも残す。残さないと、非表示の科目を使った
 *   仕訳・定期取引・プリセットなどを開いて保存した瞬間に、その科目が空になって消える。
 */
export function selectable(accounts, keep = []) {
  const k = new Set((keep || []).filter(Boolean));
  return (accounts || []).filter((a) => !isHidden(a) || k.has(a.id));
}

/**
 * 予算を保存するときの一覧を作る。
 *
 * 画面に出す費目は非表示を外すので、画面の入力だけで作り直すと、非表示の費目に付いていた
 * 予算が保存のたびに消える。画面に出していない科目の予算はそのまま引き継ぐ。
 *
 * @param budgets 今の予算 [{ accountId, amount }]
 * @param shownIds 画面に出した費目の id
 * @param entered  画面で入れた予算 [{ accountId, amount }]（0 は含めない）
 */
export function mergeBudgets(budgets, shownIds, entered) {
  const shown = new Set(shownIds || []);
  const kept = (budgets || []).filter((b) => !shown.has(b.accountId));
  return [...kept, ...(entered || [])];
}
