// netWorthSets.js の検証。node src/utils/netWorthSets.check.mjs
import { ALL, MAX_SHOWN, accountsFor, activeSet, normalizeSets, removeSet, selectSet, shownPages, toggleShown, upsertSet } from './netWorthSets.js';
import { balanceSheet } from './bookkeeping.js';

let ng = 0;
const ok = (cond, name) => {
  if (cond) console.log(`  ok   ${name}`);
  else { ng++; console.log(`  NG   ${name}`); }
};

const accounts = [
  { id: 'bank', type: 'asset', name: '普通預金' },
  { id: 'temp', type: 'asset', name: '仮口座' },
  { id: 'stock', type: 'asset', name: '有価証券' },
  { id: 'card', type: 'liability', name: 'カード' },
  { id: 'eq', type: 'equity', name: '開始残高' },
  { id: 'food', type: 'expense', name: '食費' },
];
const j = (id, date, dr, cr, amount) => ({ id, date, lines: [{ accountId: dr, side: 'dr', amount }, { accountId: cr, side: 'cr', amount }] });
const journals = [
  j('1', '2026-10-01', 'bank', 'eq', 300000),
  j('2', '2026-10-01', 'temp', 'eq', 50000),
  j('3', '2026-10-01', 'stock', 'eq', 100000),
  j('4', '2026-10-01', 'eq', 'card', 30000),
  j('5', '2026-10-02', 'food', 'card', 2000),
];
const nw = (set) => balanceSheet(journals, accountsFor(accounts, set), '2026-10-31').netWorth;

console.log('計算');
ok(nw(null) === 418000, 'すべての科目: 30万+5万+10万−3.2万');
ok(nw({ exclude: ['temp'] }) === 368000, '仮口座を外す');
ok(nw({ exclude: ['temp', 'stock'] }) === 268000, '仮口座と投資を外す');
ok(nw({ exclude: ['card'] }) === 450000, 'カード（負債）を外すと未払いを引かない');
ok(accountsFor(accounts, { exclude: ['food', 'eq'] }).length === accounts.length, '収益・費用・純資産の科目は外さない');
ok(accountsFor(accounts, { exclude: [] }) === accounts, '外す科目が無ければそのまま');

console.log('保存の形');
ok(JSON.stringify(normalizeSets(null)) === `{"active":null,"shown":["${ALL}"],"sets":[]}`, '空なら「すべての科目」だけ');
ok(normalizeSets({ active: 'x', sets: [{ id: 'a', name: 'A', exclude: ['temp'] }] }).active === null, '無い組み合わせを選んでいたら外す');
ok(normalizeSets({ sets: [{ id: 1, name: 'A' }, { id: 'b', name: 'B', exclude: 'temp' }] }).sets.length === 1, '壊れた行は捨て、exclude は配列にする');
const old = normalizeSets({ active: 'b', sets: ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id, name: id, exclude: [] })) });
ok(old.shown.length === MAX_SHOWN && old.shown[0] === ALL, '前の版の保存（shown 無し）は先頭から5個');
ok(normalizeSets({ shown: [], sets: [] }).shown[0] === ALL, '選んだものが空なら「すべての科目」');

console.log('操作');
let s = normalizeSets(null);
s = upsertSet(s, { id: 'a', name: '現金だけ', exclude: ['temp', 'stock'] });
ok(s.shown.join() === `${ALL},a`, '保存した組み合わせはホームに出る');
s = upsertSet(s, { id: 'a', name: '現金と預金', exclude: ['temp'] });
ok(s.sets.length === 1 && s.sets[0].name === '現金と預金', '同じ id は置き換え');
['b', 'c', 'd', 'e'].forEach((id) => { s = upsertSet(s, { id, name: id, exclude: [] }); });
ok(s.shown.length === MAX_SHOWN && !s.shown.includes('e'), '5個を超える分は保存してもホームに出さない');
ok(toggleShown(s, 'e') === s, '5個選んでいるときは足せない');
s = toggleShown(s, 'b');
ok(!s.shown.includes('b'), '外せる');
s = toggleShown(s, 'e');
ok(s.shown.join() === `${ALL},a,c,d,e`, '空いたら足せる。並びは保存した順');
s = toggleShown(s, ALL);
ok(!s.shown.includes(ALL), '「すべての科目」も外せる');
let one = normalizeSets({ shown: ['a'], sets: [{ id: 'a', name: 'A', exclude: [] }] });
ok(toggleShown(one, 'a') === one, '最後の1つは外せない');
ok(shownPages(s).map((x) => (x ? x.id : ALL)).join() === 'a,c,d,e', 'カードのページは選んだものだけ');
s = selectSet(s, 'c');
ok(activeSet(s).id === 'c', '止めたページを覚える');
ok(selectSet(s, 'b').active === null, 'カードに出ていない組み合わせは覚えない');
s = removeSet(s, 'c');
ok(s.active === null && !s.shown.includes('c') && s.sets.length === 4, '消すとカードからも外れる');

console.log(ng ? `\n${ng} 件 NG` : '\nすべて ok');
process.exit(ng ? 1 : 0);
