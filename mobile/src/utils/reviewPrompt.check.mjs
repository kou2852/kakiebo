// reviewPrompt.js の検証。node src/utils/reviewPrompt.check.mjs
import { MIN_DAYS_BETWEEN_ASKS, MIN_DAYS_SINCE_INSTALL, MIN_JOURNALS, installTime, shouldAsk } from './reviewPrompt.js';

let ng = 0;
const ok = (cond, name) => {
  if (cond) console.log(`  ok   ${name}`);
  else { ng++; console.log(`  NG   ${name}`); }
};

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-10-01T12:00:00Z');
const base = {
  journals: 0,
  installedAt: NOW,
  lastAskedAt: NaN,
  now: NOW,
  adShown: false,
};
const ask = (over = {}) => shouldAsk({ ...base, ...over });

console.log('どちらか一方で聞く');
ok(ask({ journals: MIN_JOURNALS }), 'インストール当日でも20件あれば聞く');
ok(!ask({ journals: MIN_JOURNALS - 1 }), '当日・19件なら聞かない');
ok(ask({ installedAt: NOW - MIN_DAYS_SINCE_INSTALL * DAY }), '0件でもインストールからちょうど3日で聞く');
ok(!ask({ installedAt: NOW - (MIN_DAYS_SINCE_INSTALL * DAY - 1) }), '3日に1ミリ秒足りず・20件未満なら聞かない');
ok(ask({ journals: MIN_JOURNALS, installedAt: NOW - 10 * DAY }), '両方満たしても聞く');

console.log('止める条件は両方の道に効く');
ok(!ask({ journals: MIN_JOURNALS, adShown: true }), '20件でも全画面広告の回は聞かない');
ok(!ask({ installedAt: NOW - 10 * DAY, adShown: true }), '3日経っても全画面広告の回は聞かない');
ok(!ask({ journals: MIN_JOURNALS, lastAskedAt: NOW - 1 * DAY }), '20件でも前回から1日なら聞かない');
ok(!ask({ installedAt: NOW - 10 * DAY, lastAskedAt: NOW - (MIN_DAYS_BETWEEN_ASKS * DAY - 1) }), '90日に1ミリ秒足りなければ聞かない');
ok(ask({ installedAt: NOW - 200 * DAY, lastAskedAt: NOW - MIN_DAYS_BETWEEN_ASKS * DAY }), 'ちょうど90日で聞く');

console.log('壊れた値');
ok(!ask({ installedAt: NaN }), 'インストール時刻が無く20件未満なら聞かない');
ok(ask({ installedAt: NaN, journals: MIN_JOURNALS }), 'インストール時刻が無くても20件あれば聞く');
ok(ask({ installedAt: NOW - 5 * DAY, lastAskedAt: undefined }), '前回が無いのは「まだ聞いていない」として扱う');

console.log('インストール時刻の決め方');
ok(installTime({ legacyFirstUse: NaN, now: NOW }) === NOW, '新しく入れた人は初回起動の時刻');
ok(installTime({ legacyFirstUse: NOW - 40 * DAY, now: NOW }) === NOW - 40 * DAY, '前から使っている人は最初に記帳した時刻（記録がある中で一番古い）');
ok(installTime({ legacyFirstUse: 0, now: NOW }) === NOW, '0 は記録なしとして扱う');
ok(installTime({ legacyFirstUse: NOW + DAY, now: NOW }) === NOW, '未来の時刻（端末の時計ずれ）は使わない');

console.log(ng ? `\n${ng} 件 NG` : '\nすべて ok');
process.exit(ng ? 1 : 0);
