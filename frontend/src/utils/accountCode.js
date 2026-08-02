// 勘定科目コードの採番。AccountModal（詳細登録）と AccountsPage（かんたん登録）で共用する。

// 区分別のコード範囲（資産1000番台・負債2000番台…既定科目のseedと同じ体系）
export const CODE_BASE = { asset: 1000, liability: 2000, equity: 3000, income: 4000, expense: 5000 };

// システム科目「元入金」固定ID。開始残高の相手科目として使う（ゲスト初期データ・サーバー側seedと共通）。
export const EQUITY_ID = 'c01';

/** 指定区分の範囲内で、まだ使われていない最も若いコードを返す。excludeId は編集中の自分自身を除外する用。 */
export function nextCode(accounts, type, excludeId) {
  const base = CODE_BASE[type] ?? 1000;
  const used = new Set(accounts.filter((a) => a.id !== excludeId).map((a) => a.code));
  for (let n = base + 1; n <= base + 999; n++) {
    const s = String(n);
    if (!used.has(s)) return s;
  }
  return '';
}
