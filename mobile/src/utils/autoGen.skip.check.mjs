// 定期取引のスキップ・先行記帳の検算。 node src/utils/autoGen.skip.check.mjs
import { dueRecurring, generateRecurring, nextAhead, rollbackNextDate, skipNext } from './autoGen.js';

let ng = 0;
const check = (name, ok) => { console.log((ok ? '  ok   ' : '  NG   ') + name); if (!ok) ng++; };

const rent = (nextDate, frequency = 'monthly') => ({
  id: 'r1', name: '家賃', frequency, nextDate,
  lines: [{ accountId: 'exp', side: 'dr', amount: 80000 }, { accountId: 'bank', side: 'cr', amount: 80000 }],
});
const TODAY = '2026-10-21';

// 画面と同じ手順で、記帳と保存を行う
async function run(state, opts) {
  const recurring = [...state.recurring];
  const journals = [...state.journals];
  const n = await generateRecurring({
    recurring, journals, todayStr: TODAY,
    addJournal: (d) => { const j = { id: `j${journals.length}`, ...d }; journals.push(j); return j; },
    saveRecurring: (list) => { recurring.splice(0, recurring.length, ...list); },
    ...opts,
  });
  return { n, recurring, journals };
}

console.log('スキップ（期日が来ている回）');
{
  const r = rent('2026-10-15');
  check('期日が来ている', dueRecurring([r], [], TODAY)[0]?.dates.join() === '2026-10-15');
  const s = skipNext(r, [], TODAY);
  check('飛ばした日は 10/15、次回は 11/15', s.skipped === '2026-10-15' && s.next === '2026-11-15' && s.r.nextDate === '2026-11-15');
  check('飛ばしたあとは期日が来ていない', dueRecurring([s.r], [], TODAY).length === 0);
  const after = await run({ recurring: [s.r], journals: [] }, {});
  check('飛ばした回は記帳されない（仕訳 0 件）', after.n === 0 && after.journals.length === 0);
  check('もとの定期取引は書き換えない', r.nextDate === '2026-10-15');
}

console.log('スキップ（遅れが複数ある）');
{
  const r = rent('2026-08-15');
  check('8・9・10月の3回が期日', dueRecurring([r], [], TODAY)[0].dates.length === 3);
  const s = skipNext(r, [], TODAY);
  check('1回だけ飛ばす（8/15）。残りの 9・10月は期日のまま', s.skipped === '2026-08-15'
    && dueRecurring([s.r], [], TODAY)[0].dates.join() === '2026-09-15,2026-10-15');
}

console.log('スキップ（記帳済みの日を挟む）');
{
  const r = rent('2026-10-15');
  const done = [{ id: 'x', date: '2026-10-15', desc: '家賃', lines: [] }]; // 手で同じ日に記帳済み
  const s = skipNext(r, done, TODAY);
  check('記帳済みの 10/15 は飛ばした扱いにせず、次の未記帳（11/15）を飛ばす', s.skipped === '2026-11-15' && s.next === '2026-12-15');
}

console.log('スキップ（週・年）');
check('毎週: 7日後', skipNext(rent('2026-10-26', 'weekly'), [], TODAY).next === '2026-11-02');
check('毎年: 1年後', skipNext(rent('2026-12-01', 'yearly'), [], TODAY).next === '2027-12-01');

console.log('先行記帳');
{
  const r = rent('2026-11-15');
  const a = nextAhead(r, [], TODAY);
  check('追いついていて次が未来なら、先行できる（11/15・その次は 12/15）', a?.date === '2026-11-15' && a.after === '2026-12-15');
  check('期日が来ている未記帳があるときは出さない（そちらを記帳する）', nextAhead(rent('2026-10-15'), [], TODAY) === null);
  const one = await run({ recurring: [r], journals: [] }, { preGenerate: true, onlyId: 'r1' });
  check('1件だけ、予定日 11/15 付きで記帳される', one.n === 1 && one.journals[0].date === '2026-11-15');
  check('記帳後の次回予定は 12/15', one.recurring[0].nextDate === '2026-12-15');
  const two = await run({ recurring: one.recurring, journals: one.journals }, { preGenerate: true, onlyId: 'r1' });
  check('続けて押すと、その次の 12/15 を記帳（二重に作らない）', two.n === 1 && two.journals.map((j) => j.date).join() === '2026-11-15,2026-12-15');
  const none = await run({ recurring: [r], journals: [] }, { preGenerate: false });
  check('先行記帳の指定が無ければ、未来の回は記帳されない', none.n === 0);
}

console.log('先行記帳して消す / 飛ばしてから先行');
{
  const r = rent('2026-11-15');
  const one = await run({ recurring: [r], journals: [] }, { preGenerate: true, onlyId: 'r1' });
  const back = rollbackNextDate(one.recurring, one.journals[0]);
  check('先行記帳した仕訳を消すと、次回予定が 11/15 に戻る', back[0].nextDate === '2026-11-15');
  const s = skipNext(r, [], TODAY);
  check('11/15 を飛ばした次の先行は 12/15', nextAhead(s.r, [], TODAY).date === '2026-12-15');
}

console.log(ng ? `\nNG ${ng}` : '\n全部OK');
process.exit(ng ? 1 : 0);
