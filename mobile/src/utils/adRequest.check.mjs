// adRequest.js の検証。node src/utils/adRequest.check.mjs
import { COOLDOWN_MS, MAX_RETRY, RETRY_MS, cooldownLeft, retryDelay } from './adRequest.js';

let ng = 0;
const ok = (cond, name) => {
  if (cond) console.log(`  ok   ${name}`);
  else { ng++; console.log(`  NG   ${name}`); }
};

const T = 1_000_000;

console.log('前の要求からの間隔');
ok(cooldownLeft(undefined, T) === 0, 'まだ要求していなければ、すぐ要求してよい');
ok(cooldownLeft(T, T) === COOLDOWN_MS, '要求した直後は、まる1回分待つ');
ok(cooldownLeft(T, T + 20_000) === COOLDOWN_MS - 20_000, '20秒後なら、残りを待つ');
ok(cooldownLeft(T, T + COOLDOWN_MS) === 0, 'ちょうど間隔があけば、要求してよい');
ok(cooldownLeft(T, T + COOLDOWN_MS * 3) === 0, '十分にあいていれば 0（負にならない）');

// 一覧を5秒おきに作り直した場合、1分のあいだに出る要求の数
const remounts = (everyMs, spanMs) => {
  let last;
  let n = 0;
  for (let t = T; t < T + spanMs; t += everyMs) {
    if (cooldownLeft(last, t) === 0) { last = t; n++; }
  }
  return n;
};
ok(remounts(5_000, 60_000) === 1, '5秒おきに作り直しても、1分に1件だけ');
ok(remounts(5_000, 180_000) === 3, '3分なら3件');

console.log('取り直し');
ok(retryDelay(0) === RETRY_MS, '1回目の失敗のあとは60秒');
ok(retryDelay(1) === RETRY_MS * 2 && retryDelay(2) === RETRY_MS * 4, '以後は倍（120秒・240秒）');
ok(MAX_RETRY === 5, '取り直しは5回まで');
const total = [...Array(MAX_RETRY).keys()].reduce((s, a) => s + retryDelay(a), 0);
ok(total === 31 * RETRY_MS, '5回取り直すまでに31分かかる（以前は5分）');
ok(Array.from({ length: MAX_RETRY }, (_, a) => retryDelay(a)).every((d) => d >= COOLDOWN_MS), '取り直しの間隔は、要求の間隔より短くならない');

console.log(ng ? `\n${ng} 件 NG` : '\nすべて ok');
process.exit(ng ? 1 : 0);
