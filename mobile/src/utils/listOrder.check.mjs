// 一覧の並び順の検算。 node src/utils/listOrder.check.mjs
import { applyAccountOrder, applyOrder, dropIndex, mergeOrder, moveId, normalizeOrder } from './listOrder.js';

let ng = 0;
const check = (name, ok) => { console.log((ok ? '  ok   ' : '  NG   ') + name); if (!ok) ng++; };
const I = (...ids) => ids.map((id) => ({ id }));
const ids = (list) => list.map((x) => x.id).join('');

console.log('applyOrder');
check('並びが空なら同じ配列を返す', (() => { const a = I('a', 'b'); return applyOrder(a, []) === a; })());
check('並びのとおりに並ぶ', ids(applyOrder(I('a', 'b', 'c'), ['c', 'a', 'b'])) === 'cab');
check('並びに無い項目は、並んだ項目のあとに、もとの順で付く', ids(applyOrder(I('a', 'b', 'c', 'd'), ['c', 'a'])) === 'cabd');
check('消えた id は無視する', ids(applyOrder(I('a', 'b'), ['x', 'b', 'y', 'a'])) === 'ba');
check('項目は失われず、増えない（無作為）', (() => {
  let seed = 7;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  for (let r = 0; r < 500; r++) {
    const n = rnd(12);
    const items = I(...Array.from({ length: n }, (_, i) => `i${i}`));
    const order = Array.from({ length: rnd(15) }, () => `i${rnd(16)}`);
    const out = applyOrder(items, order);
    if (out.length !== items.length || new Set(out.map((x) => x.id)).size !== items.length) return false;
  }
  return true;
})());

console.log('applyAccountOrder');
const acc = [{ id: 'z', code: '1003' }, { id: 'x', code: '1001' }, { id: 'y', code: '1002' }];
check('並びが無ければコード順', ids(applyAccountOrder(acc, [])) === 'xyz');
check('並んだ科目が先、残りはコード順', ids(applyAccountOrder(acc, ['z'])) === 'zxy');
check('もとの配列は書き換えない', ids(acc) === 'zxy');

console.log('mergeOrder / moveId');
check('見えている分だけ入れ替え、見えていない分は残る', mergeOrder(['h', 'a', 'b'], ['b', 'a']).join('') === 'hba');
check('保存が空でも使える', mergeOrder(undefined, ['a', 'b']).join('') === 'ab');
check('下へ移す', moveId(['a', 'b', 'c'], 0, 2).join('') === 'bca');
check('上へ移す', moveId(['a', 'b', 'c'], 2, 0).join('') === 'cab');
check('同じ位置・範囲外は何もしない', moveId(['a', 'b'], 1, 1).join('') === 'ab' && moveId(['a', 'b'], 0, 5).join('') === 'ab');

console.log('normalizeOrder');
check('壊れた値は空に', (() => { const n = normalizeOrder({ tags: 'x', wallets: [1, 'a', 'a'] }); return n.tags.length === 0 && n.wallets.join() === 'a' && n.accounts.length === 0; })());
check('null でも落ちない', normalizeOrder(null).presets.length === 0);

console.log('dropIndex（高さの違う行）');
const H = [40, 60, 40, 40]; // 上端 0, 40, 100, 140
check('動かさなければ元の番号', [0, 1, 2, 3].every((f) => dropIndex(H, f, 0) === f));
check('1行目を下へ。2行目の中ほど（中心が 20→60）で2番目', dropIndex(H, 0, 40) === 1);
check('1行目を下へ。3行目に入ると3番目（中心が 20→110）', dropIndex(H, 0, 90) === 2);
check('最後を越えても最後', dropIndex(H, 0, 9999) === 3);
check('4行目を上へ。先頭を越えても先頭', dropIndex(H, 3, -9999) === 0);
check('4行目を上へ。2行目の位置で2番目', dropIndex(H, 3, -90) === 1);

console.log(ng ? `\nNG ${ng}` : '\n全部OK');
process.exit(ng ? 1 : 0);
