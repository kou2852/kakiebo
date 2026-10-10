// adFree.js の検証。node src/utils/adFree.check.mjs
import { endOfDay, grant, isActive } from './adFree.js';

let ng = 0;
const ok = (cond, name) => {
  if (cond) console.log(`  ok   ${name}`);
  else { ng++; console.log(`  NG   ${name}`); }
};

const at = (y, m, d, h, mi = 0) => new Date(y, m - 1, d, h, mi).getTime();

console.log('期限');
const noon = at(2026, 10, 10, 12);
ok(endOfDay(noon) === at(2026, 10, 11, 0), '見た日の翌0時まで');
ok(endOfDay(at(2026, 10, 10, 23, 59)) === at(2026, 10, 11, 0), '23:59 に見ても翌0時（残り1分）');
ok(endOfDay(at(2026, 12, 31, 8)) === at(2027, 1, 1, 0), '年をまたぐ');

console.log('有効・無効');
const g = grant(noon);
ok(isActive(g, noon), '見た直後は有効');
ok(isActive(g, at(2026, 10, 10, 23, 59)), '夜でも当日中は有効');
ok(!isActive(g, at(2026, 10, 11, 0)), '翌0時で切れる');
ok(!isActive(g, at(2026, 10, 12, 9)), '翌日以降は無効');
ok(!isActive(null), '未保存は無効');
ok(!isActive({ until: 'x', setAt: 1 }), '壊れた値は無効');

console.log('時計の改ざん');
ok(!isActive(g, at(2026, 10, 9, 12)), '時計を前日に戻しても無効（延びない）');
ok(isActive(g, noon - 30 * 1000), '少しのずれ（30秒）は許す');
ok(!isActive({ until: at(2026, 10, 20, 0), setAt: noon }, noon), '期限が1日より先なら無効');

if (ng) { console.log(`\n${ng} 件 NG`); process.exit(1); }
console.log('\nすべて ok');
