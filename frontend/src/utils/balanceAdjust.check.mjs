/**
 * 残高合わせのロジック検証。
 *   node src/utils/balanceAdjust.check.mjs
 *
 * AccountModal の handleAdjust と同じ規則をここに写して検証する。
 * 要件は「差額だけを記帳する」＝同じ金額で何度実行しても残高が動かないこと（べき等）。
 */
import { calcBalances, accountBalance, isInvestmentAsset } from './bookkeeping.js';
import { lastClosingDate } from './creditCard.js';

const A = {
  bank: { id: 'a02', code: '1002', name: '普通預金', type: 'asset' },
  ideco: { id: 'a07', code: '1212', name: 'iDeCo', type: 'asset' },
  card: { id: 'b03', code: '2101', name: 'クレジットカード', type: 'liability', ccClose: 15, ccDay: 27, ccDelay: 1, ccFrom: 'a02' },
  loan: { id: 'b04', code: '2201', name: '借入金', type: 'liability' },
  equity: { id: 'c01', code: '3001', name: '元入金', type: 'equity' },
  pl: { id: 'd05', code: '4005', name: '評価損益', type: 'income' },
};
const accounts = Object.values(A);

const bookBalance = (journals, id) => accountBalance(id, accounts, calcBalances(journals, accounts));

/** AccountModal.handleAdjust と同じ規則 */
function adjust(journals, acct, actual, counterId) {
  const diff = actual - bookBalance(journals, acct.id);
  if (!diff) return null;
  const amount = Math.abs(diff);
  const selfSide = acct.type === 'asset' ? (diff > 0 ? 'dr' : 'cr') : (diff > 0 ? 'cr' : 'dr');
  const lines = [
    { accountId: acct.id, side: selfSide, amount, taxRate: 0 },
    { accountId: counterId, side: selfSide === 'dr' ? 'cr' : 'dr', amount, taxRate: 0 },
  ].sort((a, b) => (a.side === 'dr' ? 0 : 1) - (b.side === 'dr' ? 0 : 1));
  return { id: `adj${journals.length}`, date: acct.ccClose ? lastClosingDate(acct.ccClose) : '2026-08-06', desc: `残高合わせ（${acct.name}）`, lines };
}

let ng = 0;
const check = (label, cond, detail) => { if (!cond) ng++; console.log(`${cond ? '  ok  ' : '  NG  '}${label}${detail ? `  → ${detail}` : ''}`); };

// ① 空の資産科目に残高を入れる（＝既定科目への初回残高）
{
  let js = [];
  js = [...js, adjust(js, A.bank, 500000, A.equity.id)];
  check('空の普通預金に 500,000 を入れる', bookBalance(js, A.bank.id) === 500000, String(bookBalance(js, A.bank.id)));
  check('  相手の元入金も 500,000 になる', bookBalance(js, A.equity.id) === 500000);
  // べき等: 同じ金額でもう一度
  const again = adjust(js, A.bank, 500000, A.equity.id);
  check('  同じ金額で再実行しても仕訳が作られない（べき等）', again === null);
}

// ② 空の既定クレジットカードに次回引落額を入れる（1-a の本題）
{
  let js = [];
  const j = adjust(js, A.card, 80000, A.equity.id);
  js = [...js, j];
  check('空のカードに 80,000 を入れる', bookBalance(js, A.card.id) === 80000, String(bookBalance(js, A.card.id)));
  check('  仕訳は 借方 元入金 / 貸方 カード', j.lines[0].accountId === A.equity.id && j.lines[0].side === 'dr'
    && j.lines[1].accountId === A.card.id && j.lines[1].side === 'cr');
  check('  日付は直前の締め日', j.date === lastClosingDate(15), j.date);
  check('  再実行しても増えない（べき等）', adjust(js, A.card, 80000, A.equity.id) === null);
}

// ③ iDeCo の毎月の評価替え
{
  let js = [{ id: 'buy', date: '2026-01-10', desc: '拠出',
    lines: [{ accountId: A.ideco.id, side: 'dr', amount: 1000000 }, { accountId: A.bank.id, side: 'cr', amount: 1000000 }] }];
  check('評価損益が既定の相手科目になる（投資性の資産）', isInvestmentAsset(A.ideco));

  const up = adjust(js, A.ideco, 1010000, A.pl.id);
  js = [...js, up];
  check('評価額 1,010,000 に合わせる → 残高が一致', bookBalance(js, A.ideco.id) === 1010000, String(bookBalance(js, A.ideco.id)));
  check('  評価益 10,000 が収益に立つ', bookBalance(js, A.pl.id) === 10000, String(bookBalance(js, A.pl.id)));
  check('  仕訳は 借方 iDeCo / 貸方 評価損益', up.lines[0].accountId === A.ideco.id && up.lines[0].side === 'dr');
  check('  1本だけ（洗替のように2本にならない）', up.lines.length === 2);

  const down = adjust(js, A.ideco, 990000, A.pl.id);
  js = [...js, down];
  check('翌月 990,000 に下がる → 残高が一致', bookBalance(js, A.ideco.id) === 990000, String(bookBalance(js, A.ideco.id)));
  check('  評価損益は通算 −10,000', bookBalance(js, A.pl.id) === -10000, String(bookBalance(js, A.pl.id)));
  check('  仕訳は 借方 評価損益 / 貸方 iDeCo', down.lines[0].accountId === A.pl.id && down.lines[0].side === 'dr');
}

// ④ 負債を減らす向き
{
  let js = [{ id: 'l', date: '2026-01-10', desc: '借入',
    lines: [{ accountId: A.bank.id, side: 'dr', amount: 300000 }, { accountId: A.loan.id, side: 'cr', amount: 300000 }] }];
  const j = adjust(js, A.loan, 250000, A.equity.id);
  js = [...js, j];
  check('借入金を 300,000 → 250,000 に合わせる', bookBalance(js, A.loan.id) === 250000, String(bookBalance(js, A.loan.id)));
  check('  仕訳は 借方 借入金 / 貸方 元入金', j.lines[0].accountId === A.loan.id && j.lines[0].side === 'dr');
  check('  カードでない負債の日付は今日', j.date === '2026-08-06', j.date);
}

// ⑤ 借方・貸方が必ず1行ずつ（backend の validateLines を通る形か）
{
  const js = [];
  const j = adjust(js, A.bank, 1, A.equity.id);
  const dr = j.lines.filter((l) => l.side === 'dr').reduce((s, l) => s + l.amount, 0);
  const cr = j.lines.filter((l) => l.side === 'cr').reduce((s, l) => s + l.amount, 0);
  check('借方と貸方が一致する', dr === cr && dr === 1);
  check('借方が先に並ぶ', j.lines[0].side === 'dr');
}

console.log(ng ? `\n${ng} 件 NG` : '\nすべて OK');
process.exit(ng ? 1 : 0);
