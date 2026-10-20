// 総勘定元帳の検算。 node src/utils/generalLedger.check.mjs
//
// 元帳の期末残高が、帳簿全体の残高の計算（bookkeeping.accountBalance）と必ず一致することを確かめる。
// 別々の計算が食い違うと、画面ごとに残高が違って見える。
import { accountBalance, balancesAsOf } from './bookkeeping.js';
import { buildLedger, normalSide } from './generalLedger.js';

let ng = 0;
const check = (name, ok) => { console.log((ok ? '  ok   ' : '  NG   ') + name); if (!ok) ng++; };

const accounts = [
  { id: 'cash', name: '現金', type: 'asset' },
  { id: 'bank', name: '普通預金', type: 'asset' },
  { id: 'food', name: '食費', type: 'expense' },
  { id: 'sal', name: '給与', type: 'income' },
  { id: 'card', name: 'カード', type: 'liability' },
];
const J = (id, date, dr, cr, desc = '') => ({ id, date, desc, lines: [
  ...dr.map(([accountId, amount]) => ({ accountId, side: 'dr', amount })),
  ...cr.map(([accountId, amount]) => ({ accountId, side: 'cr', amount })),
] });
const A = (id) => accounts.find((a) => a.id === id);

console.log('向きと繰越');
const js = [
  J('1', '2026-08-31', [['bank', 100000]], [['sal', 100000]], '8月給与'),
  J('2', '2026-09-02', [['food', 1200]], [['cash', 1200]], '昼'),
  J('3', '2026-09-02', [['food', 800]], [['cash', 800]], '夜'),
  J('4', '2026-09-10', [['cash', 5000]], [['bank', 5000]], '引き出し'),
  J('5', '2026-10-01', [['food', 300]], [['cash', 300]], '来月'),
];
let L = buildLedger(js, A('cash'), accounts, '2026-09-01', '2026-09-30');
check('資産は借方−貸方: 期首0・期末 5000−1200−800=3000', L.opening === 0 && L.closing === 3000);
check('行は3件（期間外の来月は入らない）', L.rows.length === 3);
check('差引残高の積み上げ: −1200, −2000, 3000', L.rows.map((r) => r.balance).join() === '-1200,-2000,3000');
check('同じ日は帳簿の順（昼→夜）', L.rows[0].desc === '昼' && L.rows[1].desc === '夜');
check('借方合計5000・貸方合計2000', L.dr === 5000 && L.cr === 2000);
check('相手科目', L.rows[0].counter.join() === '食費' && L.rows[2].counter.join() === '普通預金');

L = buildLedger(js, A('bank'), accounts, '2026-09-01', '2026-09-30');
check('期間の前の分は繰越になる（8月の給与100,000）', L.opening === 100000 && L.rows.length === 1 && L.closing === 95000);

L = buildLedger(js, A('sal'), accounts, '2026-09-01', '2026-09-30');
check('収益は貸方−借方。9月は動きなし・繰越100,000', L.opening === 100000 && L.rows.length === 0 && L.closing === 100000);

check('向き: 資産・費用=+1、負債・純資産・収益=−1', normalSide('asset') === 1 && normalSide('expense') === 1
  && normalSide('liability') === -1 && normalSide('equity') === -1 && normalSide('income') === -1);

console.log('複合仕訳と、両側に出る科目');
const multi = [J('m', '2026-09-05', [['food', 6000], ['cash', 4000]], [['bank', 10000]], '複合')];
L = buildLedger(multi, A('bank'), accounts, '1900-01-01', '2999-12-31');
check('相手科目が複数ならすべて並ぶ', L.rows[0].counter.join() === '食費,現金');
const both = [J('b', '2026-09-05', [['cash', 700]], [['cash', 200], ['sal', 500]], '同じ科目が両側')];
L = buildLedger(both, A('cash'), accounts, '1900-01-01', '2999-12-31');
check('同じ科目が借方と貸方に出ても1行にまとめる（700 / 200）', L.rows.length === 1 && L.rows[0].dr === 700 && L.rows[0].cr === 200 && L.closing === 500);

console.log('帳簿全体の残高との一致（無作為）');
let seed = 12345;
const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
let mismatches = 0;
for (let round = 0; round < 300; round++) {
  const list = [];
  const n = 1 + rnd(25);
  for (let k = 0; k < n; k++) {
    const d = `2026-0${1 + rnd(9)}-${String(1 + rnd(28)).padStart(2, '0')}`;
    const a = accounts[rnd(accounts.length)].id;
    let b = accounts[rnd(accounts.length)].id;
    if (b === a) b = accounts[(accounts.findIndex((x) => x.id === a) + 1) % accounts.length].id;
    const amt = 1 + rnd(50000);
    list.push(J(`r${round}-${k}`, d, [[a, amt]], [[b, amt]]));
  }
  const asOf = `2026-0${1 + rnd(9)}-${String(1 + rnd(28)).padStart(2, '0')}`;
  const bal = balancesAsOf(list, accounts, asOf);
  for (const acc of accounts) {
    const ledger = buildLedger(list, acc, accounts, '1900-01-01', asOf);
    if (ledger.closing !== accountBalance(acc.id, accounts, bal)) mismatches++;
    // 期間の途中から始めても、繰越＋期間の動き＝期末
    const mid = `2026-0${1 + rnd(9)}-01`;
    const part = buildLedger(list, acc, accounts, mid, asOf);
    const move = normalSide(acc.type) * (part.dr - part.cr);
    if (asOf >= mid && part.opening + move !== part.closing) mismatches++;
  }
}
check(`300回 × 5科目で、元帳の期末残高と accountBalance が一致（食い違い ${mismatches}）`, mismatches === 0);

console.log(ng ? `\nNG ${ng}` : '\n全部OK');
process.exit(ng ? 1 : 0);
