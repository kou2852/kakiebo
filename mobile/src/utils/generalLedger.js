// 総勘定元帳（科目ごとの明細と差引残高）。2026-10-20。
// 検証: node src/utils/generalLedger.check.mjs
//
// ・残高の向きは bookkeeping.accountBalance と同じ。資産・費用は借方−貸方、負債・純資産・収益は貸方−借方
// ・期間の前に動いた分は「繰越」にまとめる（期首残高）。期間の中は日付順に、1仕訳＝1行で差引残高を積み上げる
// ・同じ日の仕訳は帳簿に入っている順のまま（仕訳に時刻は無い）
// ・1つの仕訳が同じ科目の借方と貸方の両方を持つときも、1行にまとめて両方の列に出す

const DEBIT_NORMAL = new Set(['asset', 'expense']);

/** 借方を足すか引くか。+1 なら借方が増加側 */
export const normalSide = (type) => (DEBIT_NORMAL.has(type) ? 1 : -1);

/**
 * @param {Array} journals 全仕訳
 * @param {{id:string,type:string}} account 対象の科目
 * @param {Array} accounts 全科目（相手科目の名前を引く）
 * @param {string} start 期間の開始（YYYY-MM-DD）
 * @param {string} end 期間の終了
 * @returns {{opening:number, closing:number, dr:number, cr:number,
 *   rows:Array<{id:string,date:string,desc:string,dr:number,cr:number,balance:number,counter:string[]}>}}
 */
export function buildLedger(journals, account, accounts, start, end) {
  const sign = normalSide(account.type);
  const name = Object.fromEntries(accounts.map((a) => [a.id, a.name]));

  let opening = 0;
  const inRange = [];
  journals.forEach((j, i) => {
    let dr = 0;
    let cr = 0;
    j.lines.forEach((l) => {
      if (l.accountId !== account.id) return;
      if (l.side === 'dr') dr += l.amount; else cr += l.amount;
    });
    if (!dr && !cr) return;
    if (j.date < start) { opening += sign * (dr - cr); return; }
    if (j.date > end) return;
    inRange.push({ j, dr, cr, i });
  });

  inRange.sort((a, b) => (a.j.date < b.j.date ? -1 : a.j.date > b.j.date ? 1 : a.i - b.i));

  let balance = opening;
  let drTotal = 0;
  let crTotal = 0;
  const rows = inRange.map(({ j, dr, cr }) => {
    balance += sign * (dr - cr);
    drTotal += dr;
    crTotal += cr;
    // 相手科目は、この科目以外の行の名前を重複なしで並べる
    const counter = [...new Set(j.lines.filter((l) => l.accountId !== account.id).map((l) => name[l.accountId] || '?'))];
    return { id: j.id, date: j.date, desc: j.desc || '', dr, cr, balance, counter, createdAt: j.createdAt, updatedAt: j.updatedAt };
  });

  return { opening, closing: balance, dr: drTotal, cr: crTotal, rows };
}
