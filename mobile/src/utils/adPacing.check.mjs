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
ok(EVERY === 8, '8件ごと');
ok(JSON.stringify(simulate(7)) === '[]', '7件までは出ない');
ok(JSON.stringify(simulate(8)) === '[8]', '8件目の OK で出る');
ok(JSON.stringify(simulate(24)) === '[8,16,24]', '以降も8件ごと');

console.log('ログイン中');
ok(JSON.stringify(simulate(20, { guest: false })) === '[]', '何件記帳しても出ない');
ok(bump(3, false) === 3, '件数が進まない');

console.log('読み込みが間に合わなかったとき');
ok(JSON.stringify(simulate(16, { loadedAt: (i) => i !== 8 })) === '[9]', '8件目で出せなければ9件目で出す');
ok(JSON.stringify(simulate(17, { loadedAt: (i) => i !== 8 })) === '[9,17]', 'そこから数え直して17件目');

console.log('先読み');
ok(!shouldPreload(6), '6件目ではまだ読まない');
ok(shouldPreload(7), '7件目（出す番の1件前）で読み始める');
ok(shouldPreload(9), '持ち越し中も読む');

console.log(ng ? `\n${ng} 件 NG` : '\nすべて ok');
process.exit(ng ? 1 : 0);
