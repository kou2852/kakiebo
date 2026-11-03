// journalSort.js の検証。node src/utils/journalSort.check.mjs
import { DEFAULT_SORT, normalizeSort, sortJournals, stampLabel } from './journalSort.js';

let ng = 0;
const ok = (cond, name) => {
  if (cond) console.log(`  ok   ${name}`);
  else { ng++; console.log(`  NG   ${name}`); }
};
const ids = (list) => list.map((j) => j.id).join(',');

const list = [
  { id: 'a', date: '2026-10-10', createdAt: '2026-11-01T09:00:00.000Z', updatedAt: '2026-11-03T09:00:00.000Z' },
  { id: 'b', date: '2026-10-20', createdAt: '2026-10-21T09:00:00.000Z', updatedAt: '2026-10-21T09:00:00.000Z' },
  { id: 'c', date: '2026-10-20', createdAt: '2026-10-22T09:00:00.000Z', updatedAt: '2026-11-02T09:00:00.000Z' },
  { id: 'd', date: '2026-09-30', createdAt: '2026-09-30T09:00:00.000Z' },
];

console.log('取引日');
ok(ids(sortJournals(list, { key: 'date', dir: 'desc' })) === 'c,b,a,d', '新しい順。同じ日（b と c）は記帳が新しいほうが先');
ok(ids(sortJournals(list, { key: 'date', dir: 'asc' })) === 'd,a,b,c', '古い順。同じ日は記帳が古いほうが先');

console.log('\n記帳日');
ok(ids(sortJournals(list, { key: 'created', dir: 'desc' })) === 'a,c,b,d', '作った日時の新しい順');
ok(ids(sortJournals(list, { key: 'created', dir: 'asc' })) === 'd,b,c,a', '作った日時の古い順');

console.log('\n更新日');
ok(ids(sortJournals(list, { key: 'updated', dir: 'desc' })) === 'a,c,b,d', '更新の新しい順（a が11/3、c が11/2）');
ok(ids(sortJournals(list, { key: 'updated', dir: 'asc' })) === 'd,b,c,a', '更新の古い順');
ok(ids(sortJournals([{ id: 'x', date: '2026-01-01', createdAt: '2026-05-01T00:00:00.000Z' }, { id: 'y', date: '2026-01-01', createdAt: '2026-04-01T00:00:00.000Z', updatedAt: '2026-06-01T00:00:00.000Z' }], { key: 'updated', dir: 'desc' })) === 'y,x',
  '更新日が無い仕訳は記帳日で代用する');

console.log('\n日時の無い古い仕訳');
{
  const old = [{ id: 'p', date: '2026-02-01' }, { id: 'q', date: '2026-03-01' }, { id: 'r', date: '2026-01-01' }];
  ok(ids(sortJournals(old, { key: 'created', dir: 'desc' })) === 'q,p,r', '記帳日が無ければ取引日で並ぶ');
  ok(ids(sortJournals(old, { key: 'updated', dir: 'asc' })) === 'r,p,q', '更新日も無ければ取引日で並ぶ');
}

console.log('\n同じ値・元の配列');
{
  const same = [{ id: 'b', date: '2026-01-01' }, { id: 'a', date: '2026-01-01' }];
  ok(ids(sortJournals(same, { key: 'date', dir: 'asc' })) === 'a,b', '全部同じなら id 順（毎回同じ並びになる）');
  const before = ids(list);
  sortJournals(list, { key: 'created', dir: 'asc' });
  ok(ids(list) === before, '元の配列は書き換えない');
  ok(ids(sortJournals([], DEFAULT_SORT)) === '', '空でも落ちない');
}

console.log('\n保存値の読み戻し');
ok(JSON.stringify(normalizeSort({ key: 'created', dir: 'asc' })) === JSON.stringify({ key: 'created', dir: 'asc' }), '正しい値はそのまま');
ok(JSON.stringify(normalizeSort(null)) === JSON.stringify(DEFAULT_SORT), '無ければ初期値（取引日・新しい順）');
ok(JSON.stringify(normalizeSort({ key: 'zzz', dir: 'up' })) === JSON.stringify(DEFAULT_SORT), '壊れた値は初期値');
ok(normalizeSort({ key: 'updated' }).dir === 'desc', '向きだけ無ければ新しい順');

console.log('\n並びに対応する日時の表示（stampLabel）');
{
  const j = { id: 'a', date: '2026-10-10', createdAt: '2026-11-01T00:30:00.000Z', updatedAt: '2026-11-03T05:05:00.000Z' };
  const m = (label) => /^(記帳|更新) \d\d\/\d\d \d\d:\d\d$/.test(label);
  ok(stampLabel(j, { key: 'date', dir: 'desc' }) === '', '取引日の並びでは出さない');
  ok(m(stampLabel(j, { key: 'created', dir: 'desc' })) && stampLabel(j, { key: 'created' }).startsWith('記帳 '), '記帳日の並びでは「記帳 月/日 時:分」');
  ok(m(stampLabel(j, { key: 'updated', dir: 'asc' })) && stampLabel(j, { key: 'updated' }).startsWith('更新 '), '更新日の並びでは「更新 月/日 時:分」');
  ok(stampLabel({ id: 'x', date: '2026-01-01' }, { key: 'created' }) === '', '日時が無い古い仕訳は何も出さない');
  ok(stampLabel({ id: 'x', date: '2026-01-01', createdAt: '2026-05-01T00:00:00.000Z' }, { key: 'updated' }).startsWith('更新 '), '更新日が無ければ記帳日で代用');
  ok(stampLabel({ id: 'x', createdAt: 'zzz' }, { key: 'created' }) === '', '壊れた日時は出さない');
}

console.log(ng ? `\n${ng} 件 NG` : '\nすべて ok');
process.exit(ng ? 1 : 0);
