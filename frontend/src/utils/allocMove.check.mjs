// allocMove.js の検証。node src/utils/allocMove.check.mjs
import { moveAlloc, tagLeft } from './allocMove.js';

let ng = 0;
const ok = (cond, name) => {
  if (cond) console.log(`  ok   ${name}`);
  else { ng++; console.log(`  NG   ${name}`); }
};
const amt = (list, accountId, tagId) => list.find((a) => a.accountId === accountId && a.tagId === tagId)?.amount || 0;
const sumOf = (list, accountId) => list.filter((a) => a.accountId === accountId).reduce((s, a) => s + a.amount, 0);

console.log('配分の付け替え（moveAlloc）');
{
  const allocs = [
    { accountId: 'a1', tagId: 't1', amount: 30000 },
    { accountId: 'a1', tagId: 't2', amount: 5000 },
    { accountId: 'a2', tagId: 't1', amount: 7000 },
  ];
  const r = moveAlloc(allocs, { accountId: 'a1', fromId: 't1', toId: 't2', amount: 10000 });
  ok(amt(r, 'a1', 't1') === 20000 && amt(r, 'a1', 't2') === 15000, '付け替え元が減り、付け替え先が増える（20000 / 15000）');
  ok(amt(r, 'a2', 't1') === 7000, '別の口座の配分は変わらない');
  ok(allocs[0].amount === 30000, '元の配列は書き換えない');
  ok(sumOf(r, 'a1') === sumOf(allocs, 'a1'), '口座の配分合計（＝未配分）は変わらない');

  const n = moveAlloc(allocs, { accountId: 'a1', fromId: 't1', toId: 't3', amount: 1000 });
  ok(amt(n, 'a1', 't3') === 1000 && amt(n, 'a1', 't1') === 29000, '配分のなかったタグへも付け替えられる（新しい行ができる）');

  const all = moveAlloc(allocs, { accountId: 'a1', fromId: 't1', toId: 't2', amount: 30000 });
  ok(!all.some((a) => a.accountId === 'a1' && a.tagId === 't1') && amt(all, 'a1', 't2') === 35000, 'ちょうど 0 円になった行は消える（0 を残さない）');

  ok(moveAlloc(allocs, { accountId: 'a1', fromId: 't1', toId: 't1', amount: 100 }) === null, '同じタグへは null');
  ok(moveAlloc(allocs, { accountId: 'a1', fromId: 't1', toId: 't2', amount: 0 }) === null, '0 円は null');
  ok(moveAlloc(allocs, { accountId: 'a1', fromId: 't1', toId: 't2', amount: -5 }) === null, 'マイナスの金額は null');
  ok(moveAlloc(allocs, { accountId: 'a1', fromId: 't1', toId: 't2', amount: 1.5 }) === null, '小数は null');
}

console.log('\n付け替え元のマイナス（内部的な借り入れ）');
{
  const allocs = [{ accountId: 'a1', tagId: 't1', amount: 30000 }];
  const over = moveAlloc(allocs, { accountId: 'a1', fromId: 't1', toId: 't2', amount: 50000 });
  ok(amt(over, 'a1', 't1') === -20000 && amt(over, 'a1', 't2') === 50000, '配分を超えて付け替えられる（付け替え元は -20000）');
  ok(sumOf(over, 'a1') === 30000, 'マイナスがあっても口座の配分合計は変わらない');

  const none = moveAlloc([], { accountId: 'a1', fromId: 't1', toId: 't2', amount: 8000 });
  ok(amt(none, 'a1', 't1') === -8000 && amt(none, 'a1', 't2') === 8000, '配分が無いタグからも借りられる（-8000 / +8000）');
  ok(sumOf(none, 'a1') === 0, '借りただけなら配分の合計は 0 のまま');

  const back = moveAlloc(over, { accountId: 'a1', fromId: 't2', toId: 't1', amount: 20000 });
  ok(amt(back, 'a1', 't1') === 0 && !back.some((a) => a.tagId === 't1') && amt(back, 'a1', 't2') === 30000, '返すと 0 円になって行が消える');

  const more = moveAlloc(over, { accountId: 'a1', fromId: 't1', toId: 't3', amount: 5000 });
  ok(amt(more, 'a1', 't1') === -25000 && amt(more, 'a1', 't3') === 5000, 'マイナスのタグからさらに付け替えられる');
}

console.log('\nタグの残り（tagLeft）');
{
  const allocs = [{ accountId: 'a1', tagId: 't1', amount: 30000 }];
  ok(tagLeft(allocs, {}, 'a1', 't1') === 30000, '記帳がなければ配分のまま');
  ok(tagLeft(allocs, { t1: -12000 }, 'a1', 't1') === 18000, '記帳で使った分を引く（30000 − 12000）');
  ok(tagLeft(allocs, { t1: -40000 }, 'a1', 't1') === -10000, '使いすぎはマイナス');
  ok(tagLeft(allocs, {}, 'a1', 't9') === 0, '配分も記帳も無ければ 0');
  ok(tagLeft([{ accountId: 'a1', tagId: 't1', amount: -8000 }], { t1: -2000 }, 'a1', 't1') === -10000, '借りている分に、使った分が重なる');
}

console.log(ng ? `\n${ng} 件 NG` : '\nすべて ok');
process.exit(ng ? 1 : 0);
