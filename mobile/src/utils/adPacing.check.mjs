// adPacing.js の検証。node src/utils/adPacing.check.mjs
import { EVERY, bump, isDue, shouldPreload } from './adPacing.js';

let ng = 0;
const ok = (cond, name) => {
  if (cond) console.log(`  ok   ${name}`);
  else { ng++; console.log(`  NG   ${name}`); }
};

// 保存 → 確認の OK、を n 回くり返したときに広告が出た回（何件目か）を返す。
// loadedAt(i) が偽の回は読み込みが間に合わなかったことにする。
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
ok(EVERY === 5, '5件ごと');
ok(JSON.stringify(simulate(4)) === '[]', '4件までは出ない');
ok(JSON.stringify(simulate(5)) === '[5]', '5件目の OK で出る');
ok(JSON.stringify(simulate(15)) === '[5,10,15]', '以降も5件ごと');

console.log('ログイン中');
ok(JSON.stringify(simulate(20, { guest: false })) === '[]', '何件記帳しても出ない');
ok(bump(3, false) === 3, '件数が進まない');

console.log('読み込みが間に合わなかったとき');
ok(JSON.stringify(simulate(10, { loadedAt: (i) => i !== 5 })) === '[6]', '5件目で出せなければ6件目で出す');
ok(JSON.stringify(simulate(11, { loadedAt: (i) => i !== 5 })) === '[6,11]', 'そこから数え直して11件目');

console.log('先読み');
ok(!shouldPreload(3), '3件目ではまだ読まない');
ok(shouldPreload(4), '4件目（出す番の1件前）で読み始める');
ok(shouldPreload(6), '持ち越し中も読む');

console.log(ng ? `\n${ng} 件 NG` : '\nすべて ok');
process.exit(ng ? 1 : 0);
