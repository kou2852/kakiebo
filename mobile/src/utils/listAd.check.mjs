// 仕訳帳の広告の位置の検算。 node src/utils/listAd.check.mjs
import { adSlot, withAd } from './listAd.js';

let ng = 0;
const check = (name, ok) => { console.log((ok ? '  ok   ' : '  NG   ') + name); if (!ok) ng++; };
const rows = (n) => Array.from({ length: n }, (_, i) => ({ id: `j${i}` }));
const ids = (list) => list.map((x) => x.id).join(',');

console.log('adSlot');
check('0件は出さない', adSlot(0) === null);
check('1件は最後（1）・2件は最後（2）・3件は最後（3）', adSlot(1) === 1 && adSlot(2) === 2 && adSlot(3) === 3);
check('4件以上は先頭3件のあと（3）', adSlot(4) === 3 && adSlot(100) === 3);

console.log('withAd');
check('2件: 末尾に付く', ids(withAd(rows(2), true)) === 'j0,j1,__ad');
check('3件: 末尾に付く（広告が4行目）', ids(withAd(rows(3), true)) === 'j0,j1,j2,__ad');
check('4件: 4行目に入り、残りが続く', ids(withAd(rows(4), true)) === 'j0,j1,j2,__ad,j3');
check('1件: その後ろに付く', ids(withAd(rows(1), true)) === 'j0,__ad');
check('0件: 広告も出ない（空のまま）', withAd(rows(0), true).length === 0);
check('show が偽なら、同じ配列を返す（描き直しを増やさない）', (() => { const r = rows(5); return withAd(r, false) === r; })());
check('広告の行には印が付く', withAd(rows(5), true)[3].__ad === true);
check('仕訳は失われず、増えるのは広告の1行だけ（無作為）', (() => {
  for (let n = 0; n < 60; n++) {
    const r = rows(n);
    const out = withAd(r, true);
    const real = out.filter((x) => !x.__ad);
    if (real.length !== n || ids(real) !== ids(r) || out.length - n > 1) return false;
  }
  return true;
})());

console.log(ng ? `\nNG ${ng}` : '\n全部OK');
process.exit(ng ? 1 : 0);
