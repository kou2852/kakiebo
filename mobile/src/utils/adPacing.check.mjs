// adPacing.js の検証。node src/utils/adPacing.check.mjs
import { EVERY, bump, isDue, left } from './adPacing.js';

let ng = 0;
const ok = (cond, name) => {
  if (cond) console.log(`  ok   ${name}`);
  else { ng++; console.log(`  NG   ${name}`); }
};

// 記帳を n 回くり返したときに広告が出た回（何件目か）を返す。
// loadedAt(i) が偽の回は読み込めなかった（失敗・時間切れ）ことにする。
const simulate = (n, { guest = true, loadedAt = () => true } = {}) => {
  let count = 0;
  const shown = [];
  for (let i = 1; i <= n; i++) {
    count = bump(count, guest);
    if (guest && isDue(count) && loadedAt(i)) { shown.push(i); count = 0; }
  }
  return shown;
};

console.log('ゲスト');
ok(EVERY === 8, '8件ごと');
ok(JSON.stringify(simulate(7)) === '[]', '7件までは出ない');
ok(JSON.stringify(simulate(8)) === '[8]', '8件目の OK で出る');
ok(JSON.stringify(simulate(24)) === '[8,16,24]', '以降も8件ごと');

console.log('あと何件');
ok(left(0) === 8 && left(1) === 7, '数え始めは8件、1件目のあとは7件');
ok(left(7) === 1, '7件目のあとはあと1件');
ok(left(8) === 0 && left(9) === 0, '出す番（持ち越しを含む）は0');
ok([...Array(EVERY + 1).keys()].every((n) => (left(n) === 0) === isDue(n)), '0 になるのは出す番のときだけ');

console.log('ログイン中');
ok(JSON.stringify(simulate(20, { guest: false })) === '[]', '何件記帳しても出ない');
ok(bump(3, false) === 3, '件数が進まない');

console.log('読み込めなかったとき');
ok(JSON.stringify(simulate(16, { loadedAt: (i) => i !== 8 })) === '[9]', '8件目で出せなければ9件目で出す');
ok(JSON.stringify(simulate(17, { loadedAt: (i) => i !== 8 })) === '[9,17]', 'そこから数え直して17件目');

console.log(ng ? `\n${ng} 件 NG` : '\nすべて ok');
process.exit(ng ? 1 : 0);
