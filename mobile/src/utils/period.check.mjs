// 期間の「今日」と「今月」の違いを固定する。 node src/utils/period.check.mjs
//
// 2026-09-15、ホームの「今月」が今日までしか集計していなかったことを受けて追加した。
// 純資産のために今日で打ち切った日付を、収支にもそのまま使っていたのが原因。
// 画面には「2026-09-01 〜 2026-09-30」と出ているのに、先日付の仕訳が数字に入っていなかった。
import { accountBalance, balanceDate, calcBalances, filterByPeriod, getPeriodRange } from './bookkeeping.js';

let ng = 0;
const check = (name, ok) => { console.log((ok ? '  ok   ' : '  NG   ') + name); if (!ok) ng++; };

const now = new Date(2026, 8, 15, 12, 0, 0); // 2026-09-15（月は0始まり）
const TODAY = '2026-09-15';

console.log('getPeriodRange');
const td = getPeriodRange('today', {}, now);
const mo = getPeriodRange('month', {}, now);
const lm = getPeriodRange('lastm', {}, now);
check('今日: 今月1日〜今日', td.start === '2026-09-01' && td.end === TODAY);
check('今月: 1日〜月末', mo.start === '2026-09-01' && mo.end === '2026-09-30');
check('先月: 8月1日〜8月31日（今日を足しても既存の期間は変わらない）', lm.start === '2026-08-01' && lm.end === '2026-08-31');
check('月初の1日でも「今日」は1日〜1日', (() => {
  const r = getPeriodRange('today', {}, new Date(2026, 9, 1, 9, 0, 0));
  return r.start === '2026-10-01' && r.end === '2026-10-01';
})());

console.log('balanceDate（純資産・口座残高をいつ時点で出すか）');
check('今日: 今日時点', balanceDate('today', td.end, TODAY) === TODAY);
check('今月: 月末時点（見込み）', balanceDate('month', mo.end, TODAY) === '2026-09-30');
check('先月: 先月末時点', balanceDate('lastm', lm.end, TODAY) === '2026-08-31');
check('全期間: 今日時点（終端 2999-12-31 に意味が無い）', balanceDate('all', '2999-12-31', TODAY) === TODAY);

console.log('先日付の仕訳（25日の給与を前もって記帳してある）');
const accounts = [
  { id: 'a02', type: 'asset' }, { id: 'e01', type: 'expense' }, { id: 'i01', type: 'income' },
];
const journals = [
  { id: 'j1', date: '2026-09-03', lines: [
    { accountId: 'e01', side: 'dr', amount: 1200 }, { accountId: 'a02', side: 'cr', amount: 1200 }] },
  { id: 'j2', date: '2026-09-25', lines: [
    { accountId: 'a02', side: 'dr', amount: 300000 }, { accountId: 'i01', side: 'cr', amount: 300000 }] },
];
// ホーム画面と同じ取り方: 収支は期間で絞る、残高は時点までの仕訳で出す
const income = (p) => accountBalance('i01', accounts, calcBalances(filterByPeriod(journals, p.start, p.end), accounts));
const assetAt = (d) => accountBalance('a02', accounts, calcBalances(journals.filter((j) => j.date <= d), accounts));

check('今日: 25日の給与は収入に入らない', income(td) === 0);
check('今月: 25日の給与も収入に入る', income(mo) === 300000);
check('今日: 口座残高に25日の給与は入らない', assetAt(balanceDate('today', td.end, TODAY)) === -1200);
check('今月: 口座残高（月末見込み）には入る', assetAt(balanceDate('month', mo.end, TODAY)) === 298800);

console.log(ng ? `\n${ng} 件失敗` : '\nすべて成功');
// process.exit() は使わない（Windows の Node で終了時に落ちることがあるため）
process.exitCode = ng ? 1 : 0;
