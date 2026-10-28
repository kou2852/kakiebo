import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  datesBetween, previousRange, activeOf, usageOf, registeredIn, registeredSameTime, jstMinuteNow,
} from '../lib/derive.mjs';

test('期間: 開始日〜終了日の日付の並びと、直前の同じ長さの期間', () => {
  assert.deepEqual(datesBetween('2026-10-23', '2026-10-25'), ['2026-10-23', '2026-10-24', '2026-10-25']);
  assert.deepEqual(datesBetween('2026-10-30', '2026-11-02'), ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
  assert.throws(() => datesBetween('2026-10-25', '2026-10-24'), /開始日/);
  assert.throws(() => datesBetween('2026-01-01', '2026-12-31'), /180日/);
  // 3日間 10/23〜10/25 の直前は 10/20〜10/22
  assert.deepEqual(previousRange('2026-10-23', '2026-10-25'), ['2026-10-20', '2026-10-22']);
  assert.deepEqual(previousRange('2026-11-01', '2026-11-01'), ['2026-10-31', '2026-10-31']);
});

// perDay = { 日付: { sub: { 端末: [リクエスト数, 記帳数] } } }
const perDay = {
  '2026-10-20': { aaa: { ios: [5, 0] } },
  '2026-10-21': { aaa: { ios: [5, 1] }, bbb: { web: [3, 0] } },
  '2026-10-22': { aaa: { ios: [2, 0], web: [1, 0] }, self: { ios: [9, 9] } }, // aaa は同じ日に2端末
  '2026-10-23': { ccc: { android: [4, 2] } },
  '2026-10-24': { aaa: { ios: [1, 0] }, ccc: { android: [1, 0] } },
  '2026-10-25': { bbb: { web: [1, 0] } },                                     // 今日（途中）
};

test('稼働: 日・週・月の窓ごとに、端末別と全体を重複なしで数え、自分を除く', () => {
  const r = activeOf(perDay, { today: '2026-10-25', selfSubs: ['self'], windows: [1, 3] });
  // 確定した窓は昨日(10/24)まで。途中の窓は今日(10/25)まで
  const w1 = r.windows.find((w) => w.size === 1);
  assert.equal(w1.confirmed.all, 2);      // 10/24: aaa, ccc
  assert.equal(w1.confirmed.ios, 1);
  assert.equal(w1.confirmed.android, 1);
  assert.equal(w1.confirmed.web, 0);
  assert.equal(w1.partial.all, 1);        // 10/25: bbb
  const w3 = r.windows.find((w) => w.size === 3);
  // 10/22〜10/24: aaa, ccc（self は除外）。aaa は ios と web の両方に入るが全体では1人
  assert.equal(w3.confirmed.all, 2);
  assert.equal(w3.confirmed.ios, 1);
  assert.equal(w3.confirmed.web, 1);
  assert.equal(w3.confirmed.android, 1);
  // 書き込みのあった人: 10/23 の ccc だけ
  assert.equal(w3.confirmed.writers, 1);
  // 日別（古い順）。最後の日だけ途中
  assert.equal(r.daily.at(-1).date, '2026-10-25');
  assert.equal(r.daily.at(-1).partial, true);
  assert.equal(r.daily.find((d) => d.date === '2026-10-22').all, 1);
});

test('稼働: 粘着度は確定した窓どうしの比（分母が0なら null）', () => {
  const r = activeOf(perDay, { today: '2026-10-25', selfSubs: ['self'], windows: [1, 3] });
  assert.equal(r.stickiness.dauWau, 1);   // 3日窓の2人に対して昨日2人
  const empty = activeOf({}, { today: '2026-10-25', selfSubs: [], windows: [1, 3] });
  assert.equal(empty.stickiness.dauWau, null);
});

test('登録ユーザーの利用状況: 7日・30日以内に開いた人・書いた人は、手元のスクリプトと同じ定義', () => {
  const now = Date.parse('2026-10-25T12:00:00+09:00');
  const users = [
    ['CONFIRMED', '2026-09-01T00:00:00.000Z', 'Google_111', 'aaaaaaaa-1'],
    ['CONFIRMED', '2026-10-01T00:00:00.000Z', 'u2', 'bbbbbbbb-2'],
    ['UNCONFIRMED', '2026-10-20T00:00:00.000Z', 'u3', 'cccccccc-3'],
  ];
  const items = [
    { PK: 'USER#aaaaaaaa-1', SK: 'PROFILE', lastSeen: '2026-10-19' },               // 6日前 → 7日以内
    { PK: 'USER#aaaaaaaa-1', SK: 'JOURNAL#1', createdAt: '2026-10-10T15:30:00.000Z', updatedAt: '2026-10-10T15:30:00.000Z' }, // JST 10/11
    { PK: 'USER#aaaaaaaa-1', SK: 'JOURNAL#2', createdAt: '2026-10-12T01:00:00.000Z', updatedAt: '2026-10-12T01:00:00.000Z' }, // JST 10/12
    { PK: 'USER#bbbbbbbb-2', SK: 'PROFILE', lastSeen: '2026-10-02' },               // 23日前 → 30日以内のみ
    { PK: 'USER#bbbbbbbb-2', SK: 'ENCDATA', updatedAt: '2026-10-05T00:00:00.000Z' },
    { PK: 'USER#zzzzzzzz-9', SK: 'PROFILE', lastSeen: '2026-10-24' },               // Cognito に居ない＝孤児
  ];
  const u = usageOf(users, items, { now, selfSubs: ['bbbbbbbb'] });
  assert.equal(u.rows.length, 3);
  assert.equal(u.summary.seen7, 1);
  assert.equal(u.summary.seen30, 2);
  assert.equal(u.summary.written7, 0);     // aaa の最終書込 10/12 は13日前
  assert.equal(u.summary.written30, 2);    // aaa(10/12) と bbb(10/5)
  assert.equal(u.summary.total, 3);
  const a = u.rows.find((r) => r.sub === 'aaaaaaaa');
  assert.equal(a.journals, 2);
  assert.equal(a.journalDays, 2);
  assert.equal(a.firstJournal, '2026-10-11');
  assert.equal(a.lastJournal, '2026-10-12');
  assert.equal(a.span, 2);
  assert.equal(a.firstShare, 50);
  assert.equal(a.provider, 'google');
  assert.equal(u.rows.find((r) => r.sub === 'bbbbbbbb').enc, true);
  assert.equal(u.rows.find((r) => r.sub === 'bbbbbbbb').self, true);
  // 本人を除いて仕訳のある人: aaa だけ。2日以上記帳した人 1
  assert.equal(u.summary.journalers, 1);
  assert.equal(u.summary.journalers2days, 1);
});

test('新規登録: 期間の端は日本時間の暦日で、終了日の終わりまで', () => {
  const users = [
    ['CONFIRMED', '2026-10-24T14:59:59.000Z', 'a', 'a'], // JST 10/24 23:59:59
    ['CONFIRMED', '2026-10-24T15:00:00.000Z', 'b', 'b'], // JST 10/25 00:00:00
    ['CONFIRMED', '2026-10-25T14:59:59.000Z', 'c', 'c'], // JST 10/25 23:59:59
    ['CONFIRMED', '2026-10-25T15:00:00.000Z', 'd', 'd'], // JST 10/26 00:00:00
    ['UNCONFIRMED', '2026-10-25T01:00:00.000Z', 'e', 'e'],
  ];
  const r = registeredIn(users, '2026-10-25', '2026-10-25');
  assert.equal(r.inPeriod, 2);                         // b, c（未確認の e は除く）
  assert.deepEqual(r.byDay.map((d) => [d.date, d.count]), [['2026-10-25', 2]]);
  assert.equal(r.total, 4);
});

test('新規登録: 同じ時刻（日本時間）までの人数', () => {
  const users = [
    ['CONFIRMED', '2026-10-24T00:00:00.000Z', 'a', 'a'], // JST 10/24 09:00
    ['CONFIRMED', '2026-10-24T08:00:00.000Z', 'b', 'b'], // JST 10/24 17:00
    ['CONFIRMED', '2026-10-25T00:30:00.000Z', 'c', 'c'], // JST 10/25 09:30
  ];
  const r = registeredSameTime(users, ['2026-10-24', '2026-10-25'], 12 * 60);
  assert.deepEqual(r, { '2026-10-24': 1, '2026-10-25': 1 }); // 12時まで: 10/24 は a、10/25 は c
});

test('日本時間の経過分', () => {
  assert.equal(jstMinuteNow(Date.parse('2026-10-25T00:30:00Z')), 9 * 60 + 30);
  assert.equal(jstMinuteNow(Date.parse('2026-10-25T15:00:00Z')), 0);
});
