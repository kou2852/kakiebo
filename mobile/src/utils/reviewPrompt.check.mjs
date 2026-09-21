// reviewPrompt.js の検証。node src/utils/reviewPrompt.check.mjs
import { MIN_DAYS_BETWEEN_ASKS, MIN_DAYS_SINCE_FIRST_USE, MIN_JOURNALS, shouldAsk } from './reviewPrompt.js';

let ng = 0;
const ok = (cond, name) => {
  if (cond) console.log(`  ok   ${name}`);
  else { ng++; console.log(`  NG   ${name}`); }
};

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-10-01T12:00:00Z');
const base = {
  journals: MIN_JOURNALS,
  firstUseAt: NOW - 10 * DAY,
  lastAskedAt: NaN,
  now: NOW,
  adShown: false,
};
const ask = (over = {}) => shouldAsk({ ...base, ...over });

console.log('条件');
ok(ask(), '20件・10日目・未実施なら聞く');
ok(!ask({ journals: MIN_JOURNALS - 1 }), '19件では聞かない');
ok(!ask({ firstUseAt: NOW - (MIN_DAYS_SINCE_FIRST_USE * DAY - 1) }), '使い始めて3日未満なら聞かない');
ok(ask({ firstUseAt: NOW - MIN_DAYS_SINCE_FIRST_USE * DAY }), 'ちょうど3日で聞く');
ok(!ask({ adShown: true }), '全画面広告を出した回は聞かない');

console.log('間隔');
ok(!ask({ lastAskedAt: NOW - 1 * DAY }), '前回から1日なら聞かない');
ok(!ask({ lastAskedAt: NOW - (MIN_DAYS_BETWEEN_ASKS * DAY - 1) }), '90日に1ミリ秒足りなければ聞かない');
ok(ask({ lastAskedAt: NOW - MIN_DAYS_BETWEEN_ASKS * DAY }), 'ちょうど90日で聞く');

console.log('壊れた値');
ok(!ask({ firstUseAt: NaN }), '使い始めが記録されていなければ聞かない');
ok(ask({ lastAskedAt: undefined }), '前回が無いのは「まだ聞いていない」として扱う');

console.log(ng ? `\n${ng} 件 NG` : '\nすべて ok');
process.exit(ng ? 1 : 0);
