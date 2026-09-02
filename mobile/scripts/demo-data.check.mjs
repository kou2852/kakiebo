// デモ帳簿の検算。アプリが使うのと同じ関数に通し、審査員に見せて不自然でないかを確かめる。
// 目で見て「それっぽい」ではなく、貸借が合うか・残高がマイナスでないかを数字で見る。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { accountBalance, balanceSheet, calcBalances, filterByPeriod, getPeriodRange } from '../src/utils/bookkeeping.js';
import { creditCardCycles } from '../src/utils/creditCard.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const d = JSON.parse(fs.readFileSync(path.join(HERE, '..', '..', 'docs', 'appstore', 'demo-data.json'), 'utf8'));
const { accounts, journals } = d;
const fa = (n) => n.toLocaleString('ja-JP');

let ng = 0;
const check = (name, cond, detail = '') => {
  console.log((cond ? '  OK ' : '  NG ') + name + (detail ? '  ' + detail : ''));
  if (!cond) ng++;
};

const today = new Date().toISOString().slice(0, 10);

// 1. すべての仕訳で借方と貸方が一致するか
const unbalanced = journals.filter((j) => {
  const dr = j.lines.filter((l) => l.side === 'dr').reduce((s, l) => s + l.amount, 0);
  const cr = j.lines.filter((l) => l.side === 'cr').reduce((s, l) => s + l.amount, 0);
  return dr !== cr;
});
check('全仕訳の貸借一致', unbalanced.length === 0, `崩れ ${unbalanced.length} 件`);

// 2. 未来の日付が無いか
const future = journals.filter((j) => j.date > today);
check('未来の日付なし', future.length === 0, future.length ? future[0].date : '');

// 3. 貸借対照表
const bs = balanceSheet(journals, accounts, today);
console.log(`\n  資産 ${fa(bs.asset)} / 負債 ${fa(bs.liability)} / 差引純資産 ${fa(bs.netWorth)}`);
check('純資産がプラス', bs.netWorth > 0);
check('資産側にマイナスなし', bs.assets.every((r) => r.amount > 0));

// 4. 現金・預金がマイナスになっていないか（残高不足で買い物している帳簿は不自然）
const bal = calcBalances(journals, accounts);
for (const id of ['a01', 'a02']) {
  const a = accounts.find((x) => x.id === id);
  const v = accountBalance(id, accounts, bal);
  check(`${a.name} がプラス`, v > 0, fa(v) + ' 円');
}

// 5. 当月の収支。収入より支出が極端に多い/少ないと不自然に見える
const { start, end } = getPeriodRange('month');
const flow = calcBalances(filterByPeriod(journals, start, end > today ? today : end), accounts);
const sum = (t) => accounts.filter((a) => a.type === t).reduce((s, a) => s + accountBalance(a.id, accounts, flow), 0);
console.log(`\n  今月 収入 ${fa(sum('income'))} / 支出 ${fa(sum('expense'))}`);

// 6. クレジットカードのサイクルが立つか（カード画面が空にならないこと）
const card = accounts.find((a) => a.id === 'b03');
const cycles = creditCardCycles(card, journals, accounts);
console.log(`\n  カード「${card.name}」のサイクル ${cycles.length} 件`);
cycles.slice(0, 4).forEach((c) =>
  console.log(`    ${c.periodStart}〜${c.periodEnd} 利用 ${fa(c.usage)} 引落 ${c.settleDate} [${c.status}]`));
check('カードのサイクルがある', cycles.length > 0);

// 7. 予算のある費目に実績があるか。
// 「今月」で見ない。投入した日が月初だと当月の記録が数日分しか無く、
// 予算の消化が 0 になるのは帳簿の欠陥ではなく暦の都合。直近30日で見る。
const d30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
const flow30 = calcBalances(filterByPeriod(journals, d30, today), accounts);
const used = d.budgets.map((b) => ({
  name: accounts.find((a) => a.id === b.accountId)?.name,
  used: Math.max(0, accountBalance(b.accountId, accounts, flow30)),
  budget: b.amount,
}));
console.log('\n  直近30日の予算消化');
used.forEach((u) => console.log(`    ${u.name} ${fa(u.used)} / ${fa(u.budget)}`));
check('予算の費目すべてに実績あり（直近30日）', used.every((u) => u.used > 0));

// 8. 当月の厚み。既定の期間は「今月」なので、ここが薄いと開いた直後が寂しい。
// 失敗にはしない（月初に投入すれば必ず薄くなる。帳簿の側では直しようがない）。
const thisMonth = journals.filter((j) => j.date >= start).length;
console.log(`\n  当月（${start} 以降）の仕訳 ${thisMonth} 件`);
if (thisMonth < 10) {
  console.log('  ⚠ 少ない。既定の「今月」で開くとダッシュボードが寂しく見える。');
  console.log('    提出直前に投入し直すか、審査メモで期間の切り替えに触れること。');
}

console.log(ng ? `\n${ng} 件 失敗` : '\nすべて成功');
process.exit(ng ? 1 : 0);
