// hiddenAccounts.js の検証。node src/utils/hiddenAccounts.check.mjs
import { isHidden, mergeBudgets, selectable } from './hiddenAccounts.js';

let ng = 0;
const ok = (cond, name) => {
  if (cond) console.log(`  ok   ${name}`);
  else { ng++; console.log(`  NG   ${name}`); }
};

const ACC = [
  { id: 'a01', name: '現金', type: 'asset' },
  { id: 'a03', name: '売掛金', type: 'asset', hidden: 1 },
  { id: 'e01', name: '食費', type: 'expense', hidden: 0 },
  { id: 'e12', name: '雑費', type: 'expense', hidden: true },
];
const ids = (list) => list.map((a) => a.id).join(',');

console.log('非表示の判定');
ok(!isHidden(ACC[0]), 'フィールドが無い既存データは表示');
ok(isHidden(ACC[1]), 'hidden: 1 は非表示');
ok(!isHidden(ACC[2]), 'hidden: 0 は表示');
ok(isHidden(ACC[3]), 'hidden: true も非表示（ウェブから true が来ても揺れない）');

console.log('\n選択肢（selectable）');
ok(ids(selectable(ACC)) === 'a01,e01', '非表示を外す');
ok(ids(selectable(ACC, ['a03'])) === 'a01,a03,e01', 'いま選ばれている科目は非表示でも残す');
ok(ids(selectable(ACC, ['a03', '', null, undefined])) === 'a01,a03,e01', '空の選択は無視する');
ok(ids(selectable(ACC, ['a01'])) === 'a01,e01', '表示中の科目を keep に入れても重複しない');
ok(selectable(null).length === 0, '読めなかったときは空');

console.log('\n予算の保存（mergeBudgets）');
{
  const budgets = [
    { accountId: 'e01', amount: 30000 },
    { accountId: 'e12', amount: 5000 }, // 非表示の雑費に付いていた予算
  ];
  const out = mergeBudgets(budgets, ['e01'], [{ accountId: 'e01', amount: 40000 }]);
  ok(out.some((b) => b.accountId === 'e12' && b.amount === 5000), '画面に出していない費目の予算は消えない');
  ok(out.filter((b) => b.accountId === 'e01').length === 1, '画面に出した費目は入れ直した値の1件だけ');
  ok(out.find((b) => b.accountId === 'e01').amount === 40000, '入れ直した値が採られる');
  const cleared = mergeBudgets(budgets, ['e01'], []);
  ok(!cleared.some((b) => b.accountId === 'e01'), '画面で0にした費目は予算なしになる');
  ok(cleared.some((b) => b.accountId === 'e12'), 'そのときも非表示の費目の予算は残る');
}

console.log(ng ? `\n${ng} 件 NG` : '\nすべて ok');
process.exit(ng ? 1 : 0);
