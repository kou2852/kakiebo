import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseLogs, classify, countEvents, funnelOf, countCreated, judgeChecks, judgeCsp, judgeSignals, judgeWatch, isWaitingInquiry,
} from '../src/metrics.mjs';
import { windowsOf, formatReport, formatFailure, dayLabel, formatFeedbackItems, formatInquiryItems } from '../src/format.mjs';

// CloudFront 標準ログの1行（タブ区切り。使う列だけ埋める）
const line = ({ date, time, ip, uri, ua = 'Mozilla/5.0%20(iPhone;%20CPU%20iPhone%20OS%2017_0)', q = '-', ref = '-' }) =>
  [date, time, 'NRT', '100', ip, 'GET', 'app.kurofukubo.com', uri, '200', ref, ua, q].join('\t');

test('JST の 10:00 実行は前日分、18:00 実行は当日分を数える', () => {
  const morning = windowsOf('morning', Date.parse('2026-09-17T10:00:03+09:00'));
  assert.equal(morning.accessDate, '2026-09-16');
  assert.equal(morning.prevAt, Date.parse('2026-09-16T18:00:00+09:00'));
  assert.deepEqual(morning.yesterdayRange, [Date.parse('2026-09-16T00:00:00+09:00'), Date.parse('2026-09-17T00:00:00+09:00')]);
  assert.equal(morning.retentionDates.length, 30);
  assert.equal(morning.retentionDates[0], '2026-09-16');
  assert.equal(morning.retentionDates.at(-1), '2026-08-18');
  assert.equal(morning.prevLabel, '9/16 18:00');

  const evening = windowsOf('evening', Date.parse('2026-09-17T18:00:02+09:00'));
  assert.equal(evening.accessDate, '2026-09-17');
  assert.equal(evening.prevAt, Date.parse('2026-09-17T10:00:00+09:00'));
  assert.equal(evening.yesterdayRange, null);
  assert.equal(evening.retentionDates, null);

  // JST 0時台は UTC では前日。ログのファイル名(UTC日)に当日分が含まれること
  assert.ok(morning.logUtcDates.includes('2026-09-17') && morning.logUtcDates.includes('2026-08-16') && !morning.logUtcDates.includes('2026-08-15'));
  assert.throws(() => windowsOf('noon', Date.now()));
});

test('dayLabel は曜日付き', () => {
  assert.equal(dayLabel('2026-09-17'), '9/17(木)');
});

test('ログ: UTC→JST の日付振り分け、ボット・自分の除外、イベント数', () => {
  const text = [
    '#Version: 1.0',
    // JST 9/17 08:00（UTC 9/16 23:00）の人間
    line({ date: '2026-09-16', time: '23:00:00', ip: '1.1.1.1', uri: '/' }),
    line({ date: '2026-09-16', time: '23:00:05', ip: '1.1.1.1', uri: '/_e/app_first' }),
    line({ date: '2026-09-16', time: '23:01:00', ip: '1.1.1.1', uri: '/_e/guest_first' }),
    // ボットUA
    line({ date: '2026-09-16', time: '23:02:00', ip: '2.2.2.2', uri: '/', ua: 'Googlebot/2.1' }),
    // 自分（selftest を送った IP は期間外の行でも自分扱い）
    line({ date: '2026-08-01', time: '00:00:00', ip: '3.3.3.3', uri: '/', q: 'selftest=1' }),
    line({ date: '2026-09-16', time: '23:03:00', ip: '3.3.3.3', uri: '/' }),
    line({ date: '2026-09-16', time: '23:03:01', ip: '3.3.3.3', uri: '/_e/app_first' }),
    // JST 9/16（期間外）
    line({ date: '2026-09-16', time: '10:00:00', ip: '4.4.4.4', uri: '/' }),
  ].join('\n');
  const { rows, selfIps } = parseLogs([text], new Set(['2026-09-17']));
  assert.ok(selfIps.has('3.3.3.3'));
  const c = classify(rows, selfIps);
  assert.equal(c.humanOpens.length, 1);
  assert.equal(c.botOpens.length, 1);
  assert.equal(c.selfOpens.length, 1);
  const ev = countEvents(rows, c.isBot, c.isSelf);
  assert.deepEqual(ev.total, { app_first: 1, guest_first: 1 });
  const { funnel } = funnelOf(ev.total);
  assert.deepEqual(funnel.map((f) => f.count), [1, 1, 0, 0]);
});

test('同一秒に3回以上のオープンはボット扱い', () => {
  const t = { date: '2026-09-16', time: '23:00:00', ip: '5.5.5.5', uri: '/' };
  const { rows, selfIps } = parseLogs([[line(t), line(t), line(t)].join('\n')], new Set(['2026-09-17']));
  assert.equal(classify(rows, selfIps).humanOpens.length, 0);
});

test('登録数は未確認を除き、[from, to) で数える', () => {
  const users = [
    ['CONFIRMED', '2026-09-17T00:59:59.000Z', 'a'],
    ['CONFIRMED', '2026-09-17T01:00:00.000Z', 'Google_1'],
    ['UNCONFIRMED', '2026-09-17T02:00:00.000Z', 'b'],
    ['EXTERNAL_PROVIDER', '2026-09-17T08:59:59.000Z', 'SignInWithApple_1'],
    ['CONFIRMED', '2026-09-17T09:00:00.000Z', 'c'],
  ];
  // 10:00 JST = 01:00Z 〜 18:00 JST = 09:00Z
  assert.equal(countCreated(users, Date.parse('2026-09-17T01:00:00Z'), Date.parse('2026-09-17T09:00:00Z')), 2);
});

test('状態の判定', () => {
  const now = Date.parse('2026-09-17T10:00:00Z');
  const ok = judgeChecks({
    pool: { EmailSendingAccount: 'COGNITO_DEFAULT' }, sesProduction: false,
    unconfirmedCreated: [], cleanupLastTs: now - 7 * 3600000,
  }, now).checks;
  assert.deepEqual(ok.map((x) => x.level), ['ok', 'ok', 'ok']);

  const ng = judgeChecks({
    pool: { EmailSendingAccount: 'DEVELOPER' }, sesProduction: false,
    unconfirmedCreated: ['2026-09-13T00:00:00Z'], cleanupLastTs: null,
  }, now).checks;
  assert.deepEqual(ng.map((x) => x.level), ['bad', 'warn', 'warn']);

  const failed = judgeChecks({ pool: null, sesProduction: null, unconfirmedCreated: null, cleanupLastTs: undefined }, now).checks;
  assert.ok(failed.every((x) => x.level === 'warn' && x.value === '取得できず'));

  assert.equal(judgeCsp({ csp: 'enforce' }).level, 'ok');
  assert.equal(judgeCsp({ csp: 'report-only' }).level, 'bad');
  assert.equal(judgeCsp(null).level, 'warn');

  const s = { requests: 1000, err5: 1, err4: 0, p99: 1500, lambdaErrors: 0, lambdaInvocations: 900, lambdaThrottles: 0, ddbThrottles: 0, errorRate: 0.1 };
  assert.deepEqual(judgeSignals(s).map((x) => x.level), ['bad', 'warn', 'ok', 'ok', 'ok']);
  assert.equal(judgeSignals(null)[0].level, 'warn');
});

test('返信待ちは「未終了かつ最後がユーザー発言」', () => {
  assert.equal(isWaitingInquiry({ status: 'open', lastFrom: 'user' }), true);
  assert.equal(isWaitingInquiry({ status: 'open', lastFrom: 'staff' }), false);
  assert.equal(isWaitingInquiry({ status: 'closed', lastFrom: 'user' }), false);
});

const report = (slot, over = {}) => ({
  window: windowsOf(slot, Date.parse(slot === 'morning' ? '2026-09-17T10:00:00+09:00' : '2026-09-17T18:00:00+09:00')),
  status: [{ level: 'ok', label: 'x', value: 'y', note: null }],
  users: { total: 128, unconfirmed: 1, google: 71, apple: 9, email: 48, sincePrev: 2, yesterday: slot === 'morning' ? 3 : null },
  access: { human: 97, distinct: 64, bot: 212, self: 18 },
  funnel: [
    { label: '新規訪問', count: 41 }, { label: 'ゲスト開始', count: 12 },
    { label: '初めて記帳', count: 7 }, { label: '初回ログイン(端末別)', count: 3 },
  ],
  retention: slot === 'morning' ? [{ label: '1日後', count: 18, rate: 22.4 }, { label: '7日後', count: 9, rate: 11 }, { label: '30日後', count: 3, rate: 3.7 }] : null,
  pending: { inquiriesWaiting: 1, feedbackNew: 0 },
  ...over,
});

test('朝の文面: 前日・継続あり・異常なしは緑', () => {
  const p = formatReport(report('morning'));
  const e = p.embeds[0];
  assert.equal(e.title, '🟢 kurofukubo 定時レポート 9/17(木) 10:00');
  assert.equal(e.color, 0x15a06a);
  assert.deepEqual(p.allowed_mentions, { parse: [] });
  assert.match(e.description, /^\*\*異常なし\*\*/);
  assert.match(e.description, /前回（9\/16 18:00）から \+2人 ／ 昨日 \+3人/);
  assert.match(e.description, /アクセス 昨日（9\/16\(水\)）/);
  assert.match(e.description, /→ゲスト開始 12人（29%）/);
  assert.match(e.description, /1日後 18人（22%） ／ 7日後 9人（11%） ／ 30日後 3人（4%）/);
});

test('夕方の文面: 当日途中・獲得の流れあり・継続なし、注意は黄で先頭に並ぶ', () => {
  const p = formatReport(report('evening', {
    status: [{ level: 'warn', label: '未確認のまま滞留', value: '2件 / 最長 3.4日', note: '掃除ジョブが次回削除します' }],
  }), { test: true });
  const e = p.embeds[0];
  assert.equal(e.title, '【テスト】🟡 kurofukubo 定時レポート 9/17(木) 18:00');
  assert.equal(e.color, 0xc98a12);
  assert.match(e.description, /^\*\*注意 1件\*\*\n▲ 未確認のまま滞留：2件 \/ 最長 3.4日（掃除ジョブが次回削除します）/);
  assert.match(e.description, /獲得の流れ 今日（9\/17\(木\) 途中）/);
  assert.match(e.description, /前回（10:00）から \+2人\n/);
  assert.doesNotMatch(e.description, /継続/);
});

test('取得できなかった項目は「取得できず」、要対応は赤', () => {
  const p = formatReport(report('morning', {
    status: [{ level: 'bad', label: 'エラー率（5xx）', value: '0.25%', note: null }, { level: 'warn', label: 'a', value: 'b', note: null }],
    users: null, access: null, funnel: null, retention: null, pending: { inquiriesWaiting: null, feedbackNew: 2 },
  }));
  const e = p.embeds[0];
  assert.equal(e.color, 0xe0556a);
  assert.match(e.description, /^\*\*要対応 1件\*\*（注意 1件）\n✕ エラー率（5xx）：0.25%\n▲ a：b/);
  assert.equal(e.description.match(/取得できず/g).length, 5);
});

test('失敗通知', () => {
  const p = formatFailure('evening', Date.parse('2026-09-17T18:00:00+09:00'), new Error('boom'));
  assert.match(p.embeds[0].title, /18:00$/);
  assert.match(p.embeds[0].description, /集計に失敗しました\*\*\nboom/);
});

test('新着通知の文面: ご意見は本文のみ、問い合わせは件名と最後の発言', () => {
  const [fb] = formatFeedbackItems([{ sk: 'FEEDBACK#2026-09-17T05:00:00.000Z#u1', timestamp: '2026-09-17T05:00:00.000Z', body: '予算の入力がしづらい' }]);
  assert.equal(fb.embeds.length, 1);
  assert.equal(fb.embeds[0].title, '🗣 新しいご意見');
  assert.equal(fb.embeds[0].description, '予算の入力がしづらい');
  assert.equal(fb.embeds[0].footer.text, '9/17(木) 14:00'); // JST
  assert.deepEqual(fb.allowed_mentions, { parse: [] });

  const [inq] = formatInquiryItems([
    { sub: '3fa85f64', subject: 'CSVが取り込めない', status: 'open', updatedAt: '2026-09-17T05:00:00.000Z', isNew: true, lastFrom: 'user', lastBody: '文字化けします' },
    { sub: '3fa85f64', subject: 'CSVが取り込めない', status: 'open', updatedAt: '2026-09-17T06:00:00.000Z', isNew: false, lastFrom: 'user', lastBody: 'まだ直りません' },
  ]);
  assert.equal(inq.embeds.length, 2);
  assert.equal(inq.embeds[0].title, '✉ 新しい問い合わせ');
  assert.equal(inq.embeds[1].title, '✉ 問い合わせに返信がありました');
  assert.match(inq.embeds[0].description, /\*\*CSVが取り込めない\*\*\n文字化けします/);
  assert.match(inq.embeds[0].description, /利用者 3fa85f64 ／ 状態 対応中/);
});

test('長い本文は切って「続きはダッシュボード」を付ける', () => {
  const [p] = formatFeedbackItems([{ timestamp: '2026-09-17T05:00:00.000Z', body: 'あ'.repeat(2000) }]);
  assert.ok(p.embeds[0].description.length < 1600);
  assert.match(p.embeds[0].description, /…（続きはダッシュボード）$/);
});

test('11件以上は複数のメッセージに分ける（Discord の上限）', () => {
  const items = Array.from({ length: 23 }, (_, i) => ({ timestamp: '2026-09-17T05:00:00.000Z', body: `x${i}` }));
  const msgs = formatFeedbackItems(items);
  assert.deepEqual(msgs.map((m) => m.embeds.length), [10, 10, 3]);
});

test('新着通知が止まっていれば定時レポートで注意を出す', () => {
  const now = Date.parse('2026-09-17T10:00:00Z');
  assert.equal(judgeWatch({ lastRunAt: new Date(now - 10 * 60000).toISOString() }, now).level, 'ok');
  // 朝10:00のレポートから見ると前回は前日17:00（17時間前）。これは正常
  assert.equal(judgeWatch({ lastRunAt: new Date(now - 17 * 3600000).toISOString() }, now).level, 'ok');
  assert.equal(judgeWatch({ lastRunAt: new Date(now - 21 * 3600000).toISOString() }, now).level, 'warn');
  assert.equal(judgeWatch(null, now).level, 'warn');
});

test('since 指定のときはカーソルを読まず、書き戻しもしない', async () => {
  const { runWatch } = await import('../src/handler.mjs');
  const calls = [];
  const deps = {
    getCursor: async () => { calls.push('get'); return { feedback: 'x', inquiry: 'x' }; },
    putCursor: async () => { calls.push('put'); },
    listFeedbackSince: async () => [],
    listInquiriesSince: async () => [],
  };

  await runWatch(Date.now(), { since: '2026-01-01T00:00:00Z' }, deps);
  assert.deepEqual(calls, []);

  await runWatch(Date.now(), {}, deps);
  assert.deepEqual(calls, ['get', 'put']);
});

test('新着があればカーソルは最後の1件まで進む（ご意見はSK、問い合わせは更新日時）', async () => {
  const { runWatch } = await import('../src/handler.mjs');
  let saved = null;
  const deps = {
    getCursor: async () => ({ feedback: '2026-09-01T00:00:00.000Z', inquiry: '2026-09-01T00:00:00.000Z' }),
    putCursor: async (c) => { saved = c; },
    listFeedbackSince: async () => [
      { sk: 'FEEDBACK#2026-09-17T05:00:00.000Z#u1', timestamp: '2026-09-17T05:00:00.000Z', body: 'a' },
      { sk: 'FEEDBACK#2026-09-18T05:00:00.000Z#u2', timestamp: '2026-09-18T05:00:00.000Z', body: 'b' },
    ],
    listInquiriesSince: async () => [
      { sub: 'aaaaaaaa', subject: 's', status: 'open', updatedAt: '2026-09-18T06:00:00.000Z', isNew: true, lastFrom: 'user', lastBody: 'x' },
      // 運営の返信は通知しないが、カーソルはここまで進める（次回に読み直さないため）
      { sub: 'bbbbbbbb', subject: 's', status: 'open', updatedAt: '2026-09-18T07:00:00.000Z', isNew: false, lastFrom: 'staff', lastBody: 'y' },
    ],
  };

  const out = await runWatch(Date.parse('2026-09-18T08:00:00Z'), { dryRun: true }, deps);
  assert.equal(out.feedback, 2);
  assert.equal(out.inquiry, 1); // 利用者の発言だけ
  assert.equal(saved, null);    // dryRun では書かない

  const out2 = await runWatch(Date.parse("2026-09-18T08:00:00Z"), {}, { ...deps, send: async () => {} });
  assert.equal(out2.feedback, 2);
  assert.equal(saved.feedback, '2026-09-18T05:00:00.000Z#u2');
  assert.equal(saved.inquiry, '2026-09-18T07:00:00.000Z');
});
