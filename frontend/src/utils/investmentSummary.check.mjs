/**
 * 投資サマリー（元本／評価損益／時価）の検証。
 *   node src/utils/investmentSummary.check.mjs
 *
 * 要件: 科目を分けずに、仕訳から拠出と評価替えを振り分けられること。
 *       元本＋評価損益は必ず科目残高に一致すること。
 */
import { investmentSummary, calcBalances, accountBalance } from './bookkeeping.js';

const A = {
  bank: { id: 'a02', code: '1002', name: '普通預金', type: 'asset' },
  ideco: { id: 'a07', code: '1212', name: 'iDeCo', type: 'asset' },
  nisa: { id: 'a08', code: '1211', name: 'NISA口座', type: 'asset' },
  salary: { id: 'd01', code: '4001', name: '給与収入', type: 'income' },
  pl: { id: 'd05', code: '4005', name: '評価損益', type: 'income' },
  equity: { id: 'c01', code: '3001', name: '元入金', type: 'equity' },
  food: { id: 'e01', code: '5001', name: '食費', type: 'expense' },
};
const accounts = Object.values(A);
const J = (id, date, lines) => ({ id, date, desc: '', lines });
const L = (acct, side, amount) => ({ accountId: acct.id, side, amount, taxRate: 0 });

const journals = [
  // 口座振替の拠出（相手＝資産）
  J('c1', '2026-05-10', [L(A.ideco, 'dr', 23000), L(A.bank, 'cr', 23000)]),
  J('c2', '2026-06-10', [L(A.ideco, 'dr', 23000), L(A.bank, 'cr', 23000)]),
  // 給与天引きの拠出（相手＝収益）。元本として拾えること
  J('c3', '2026-07-10', [L(A.ideco, 'dr', 23000), L(A.salary, 'cr', 23000)]),
  // 評価替え（相手＝評価損益）
  J('v1', '2026-06-30', [L(A.ideco, 'dr', 4000), L(A.pl, 'cr', 4000)]),
  J('v2', '2026-07-31', [L(A.pl, 'dr', 1500), L(A.ideco, 'cr', 1500)]), // 下がった月
  // NISA は拠出のみ・評価替えなし
  J('n1', '2026-06-05', [L(A.nisa, 'dr', 100000), L(A.bank, 'cr', 100000)]),
  // 無関係な仕訳
  J('x1', '2026-07-02', [L(A.food, 'dr', 3000), L(A.bank, 'cr', 3000)]),
];

let ng = 0;
const check = (label, cond, detail) => { if (!cond) ng++; console.log(`${cond ? '  ok  ' : '  NG  '}${label}${detail ? `  → ${detail}` : ''}`); };

const rows = investmentSummary(journals, accounts);
const ideco = rows.find((r) => r.account.id === A.ideco.id);
const nisa = rows.find((r) => r.account.id === A.nisa.id);

check('投資性の資産だけが対象（普通預金・食費は出ない）', rows.length === 2, rows.map((r) => r.account.name).join());
check('iDeCo の元本は 69,000（口座振替2回＋給与天引き1回）', ideco.principal === 69000, String(ideco.principal));
check('iDeCo の評価損益は +2,500（+4,000 −1,500）', ideco.gain === 2500, String(ideco.gain));
check('iDeCo の時価は 71,500', ideco.value === 71500, String(ideco.value));
check('NISA は評価替えなしで元本のみ', nisa.principal === 100000 && nisa.gain === 0, `${nisa.principal}/${nisa.gain}`);
check('NISA の最終評価日は空（未更新）', nisa.lastValuation === '', `"${nisa.lastValuation}"`);
check('iDeCo の最終評価日は 2026-07-31', ideco.lastValuation === '2026-07-31', ideco.lastValuation);
check('時価の降順に並ぶ', rows[0].account.id === A.nisa.id, rows.map((r) => r.account.name).join());

// いちばん大事な性質: 元本＋評価損益＝科目残高
const bal = calcBalances(journals, accounts);
for (const r of rows) {
  const real = accountBalance(r.account.id, accounts, bal);
  check(`${r.account.name}: 元本＋評価損益が科目残高に一致`, r.principal + r.gain === real, `${r.principal + r.gain} vs ${real}`);
}

// 評価損益の科目が無い場合（既存ユーザー）は、すべて元本として扱われる
{
  const noPl = accounts.filter((a) => a.id !== A.pl.id);
  const r = investmentSummary(journals, noPl).find((x) => x.account.id === A.ideco.id);
  check('評価損益の科目が無ければ全額が元本になる（残高は一致したまま）',
    r.gain === 0 && r.principal === 71500, `${r.principal}/${r.gain}`);
}

// 残高が動いていない科目は出さない
{
  const r = investmentSummary([], accounts);
  check('仕訳が無ければ何も出さない', r.length === 0);
}

console.log(ng ? `\n${ng} 件 NG` : '\nすべて OK');
process.exit(ng ? 1 : 0);
