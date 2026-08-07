/**
 * タグ残高の増減保証チェック。
 *   node src/utils/bookkeeping.tagcheck.mjs
 *
 * タグ機能の要件は「タグ付きで入ってきた分は増え、タグ付きで出ていった分は減る」。
 * どの入力経路・どの行にタグを付けても同じ答えになることを確認する。
 */
import { computeTagBalances } from './bookkeeping.js';

const A = {
  cash: { id: 'a01', code: '1001', name: '現金', type: 'asset' },
  bank: { id: 'a02', code: '1002', name: '普通預金', type: 'asset' },
  bank2: { id: 'a03', code: '1003', name: '定期預金', type: 'asset' },
  card: { id: 'l01', code: '2001', name: '未払金', type: 'liability' },
  food: { id: 'e01', code: '5001', name: '食費', type: 'expense' },
  pay: { id: 'i01', code: '4001', name: '給与', type: 'income' },
};
const accounts = Object.values(A);
const T = 't1';

const ln = (acct, side, amount, tagged) => ({
  accountId: acct.id, side, amount, taxRate: 0,
  ...(tagged ? { splits: [{ tagId: T, amount }] } : {}),
});
const jn = (id, lines, extra = {}) => ({ id, date: '2026-01-10', desc: '', lines, ...extra });

// 入金10万を「旅行費」タグで預金へ
const IN = jn('in', [ln(A.bank, 'dr', 100000, true), ln(A.pay, 'cr', 100000, false)]);

const total = (journals) => computeTagBalances(journals, accounts).byTag[T] || 0;
const inAcct = (journals, acct) => (computeTagBalances(journals, accounts).byAccount[acct.id] || {})[T] || 0;

const cases = [
  ['入金のみ（預金の借方にタグ）', [IN], 100000],
  ['入金（収入行にタグ）', [jn('i2', [ln(A.bank, 'dr', 100000, false), ln(A.pay, 'cr', 100000, true)])], 100000],
  ['入金（両行にタグ／二重計上しない）', [jn('i3', [ln(A.bank, 'dr', 100000, true), ln(A.pay, 'cr', 100000, true)])], 100000],

  ['出金3万：費用行にタグ', [IN, jn('o1', [ln(A.food, 'dr', 30000, true), ln(A.bank, 'cr', 30000, false)])], 70000],
  ['出金3万：預金行にタグ', [IN, jn('o2', [ln(A.food, 'dr', 30000, false), ln(A.bank, 'cr', 30000, true)])], 70000],
  ['出金3万：両行にタグ（相殺しない）', [IN, jn('o3', [ln(A.food, 'dr', 30000, true), ln(A.bank, 'cr', 30000, true)])], 70000],
  ['出金3万：カード払い（資産が動かない）', [IN, jn('o4', [ln(A.food, 'dr', 30000, true), ln(A.card, 'cr', 30000, false)])], 70000],
  ['出金3万：カード引落（未払金行にタグ）', [IN, jn('o5', [ln(A.card, 'dr', 30000, true), ln(A.bank, 'cr', 30000, false)])], 70000],
  ['出金3万：旧クイック入力（仕訳直下のtagId）', [IN, jn('o6', [ln(A.food, 'dr', 30000, false), ln(A.bank, 'cr', 30000, false)], { tagId: T })], 70000],
  ['返金1万（費用の貸方にタグ）', [IN, jn('r1', [ln(A.bank, 'dr', 10000, false), ln(A.food, 'cr', 10000, true)])], 110000],

  ['複数行の出金（費用2行にタグ）', [IN, jn('m1', [
    ln(A.food, 'dr', 20000, true), ln(A.food, 'dr', 10000, true), ln(A.bank, 'cr', 30000, false)])], 70000],
  ['一部だけタグ（3万のうち1万）', [IN, jn('p1', [
    { accountId: A.food.id, side: 'dr', amount: 30000, taxRate: 0, splits: [{ tagId: T, amount: 10000 }] },
    ln(A.bank, 'cr', 30000, false)])], 90000],

  ['使いすぎ（12万出金）はマイナスになる', [IN, jn('n1', [ln(A.food, 'dr', 120000, true), ln(A.bank, 'cr', 120000, false)])], -20000],
  ['振替（口座間移動）は合計が変わらない', [IN, jn('t1', [ln(A.bank2, 'dr', 40000, true), ln(A.bank, 'cr', 40000, true)])], 100000],
  ['タグなし取引は影響しない', [IN, jn('u1', [ln(A.food, 'dr', 30000, false), ln(A.bank, 'cr', 30000, false)])], 100000],
];

let ng = 0;
for (const [name, journals, expected] of cases) {
  const got = total(journals);
  const ok = Math.abs(got - expected) < 0.5;
  if (!ok) ng++;
  console.log(`${ok ? '  ok  ' : '  NG  '}${name}  → ${got.toLocaleString()}（期待 ${expected.toLocaleString()}）`);
}

// 口座別配分: 振替でタグの居場所が移ること
{
  const js = [IN, jn('t2', [ln(A.bank2, 'dr', 40000, true), ln(A.bank, 'cr', 40000, true)])];
  const bank = inAcct(js, A.bank), bank2 = inAcct(js, A.bank2);
  const ok = bank === 60000 && bank2 === 40000;
  if (!ok) ng++;
  console.log(`${ok ? '  ok  ' : '  NG  '}振替後の口座別配分  → 普通預金 ${bank.toLocaleString()} / 定期預金 ${bank2.toLocaleString()}（期待 60,000 / 40,000）`);
}
// 口座別配分: 費用行のタグが支払元口座から引かれること
{
  const js = [IN, jn('o7', [ln(A.food, 'dr', 30000, true), ln(A.bank, 'cr', 30000, false)])];
  const bank = inAcct(js, A.bank);
  const ok = bank === 70000;
  if (!ok) ng++;
  console.log(`${ok ? '  ok  ' : '  NG  '}費用行タグの支払元口座への反映  → 普通預金 ${bank.toLocaleString()}（期待 70,000）`);
}

console.log(ng ? `\n${ng} 件 NG` : '\nすべて OK');
process.exit(ng ? 1 : 0);
