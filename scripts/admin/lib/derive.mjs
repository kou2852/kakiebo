// 画面用の派生の計算。AWS にも手元のファイルにも触れない純粋な関数だけを置く（テスト: test/derive.test.mjs）。
// 日付はすべて日本時間（JST）の暦日。

import { jstDayOfIso, providerOf, summarizeUsers } from '../report/src/metrics.mjs';

const DAY = 86400000;
const JST = 9 * 3600000;
const MAX_RANGE_DAYS = 180;
const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10);
const dayDiff = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / DAY);
const jstStartMs = (d) => Date.parse(d + 'T00:00:00+09:00');

/** 日本時間の 0 時からの経過分 */
export const jstMinuteNow = (ms) => { const t = new Date(ms + JST); return t.getUTCHours() * 60 + t.getUTCMinutes(); };

// ── 期間 ──────────────────────────────────────────────────────

/** 開始日〜終了日（両端を含む）の日付を古い順に返す */
export function datesBetween(from, to) {
  const n = dayDiff(from, to) + 1;
  if (!(n >= 1)) throw new Error('開始日は終了日以前にしてください');
  if (n > MAX_RANGE_DAYS) throw new Error(`期間は ${MAX_RANGE_DAYS}日までです`);
  return Array.from({ length: n }, (_, i) => addDays(from, i));
}

/** 直前の同じ長さの期間 [開始日, 終了日]（前の期間との差を出すため） */
export function previousRange(from, to) {
  const n = dayDiff(from, to) + 1;
  const prevTo = addDays(from, -1);
  return [addDays(prevTo, -(n - 1)), prevTo];
}

// ── 稼働（ログインしている人。API Gateway のアクセスログの sub）─────────────

const PFS = ['ios', 'android', 'web'];

/**
 * 日・週・月の窓ごとの稼働人数。端末別と全体（重複なし）。
 * 全体は端末別の合計ではない（同じ人が iPhone とブラウザの両方を使えば、端末別には両方に入り、全体では1人）。
 * 窓は「昨日まで」が確定、「今日まで」は途中。
 * @param {Object} perDay { 日付: { sub: { 端末: [リクエスト数, 記帳数] } } }
 * @param {{today: string, selfSubs: string[], windows?: number[], dailyDays?: number}} opts
 */
export function activeOf(perDay, { today, selfSubs, windows = [1, 7, 30], dailyDays = 30 }) {
  const isSelf = (sub) => selfSubs.some((p) => sub.startsWith(p));
  // 窓の中の人数。pf が null なら全体
  const countIn = (dates) => {
    const all = new Set(), writers = new Set(), by = { ios: new Set(), android: new Set(), web: new Set() };
    for (const d of dates) {
      for (const [sub, pfs] of Object.entries(perDay[d] || {})) {
        if (isSelf(sub)) continue;
        for (const [pf, [, wr]] of Object.entries(pfs)) {
          all.add(sub);
          if (by[pf]) by[pf].add(sub);
          if (wr > 0) writers.add(sub);
        }
      }
    }
    return { all: all.size, ios: by.ios.size, android: by.android.size, web: by.web.size, writers: writers.size };
  };
  const span = (end, size) => Array.from({ length: size }, (_, i) => addDays(end, -i)).reverse();
  const yesterday = addDays(today, -1);

  const daily = span(today, dailyDays).map((date) => ({ date, partial: date === today, ...countIn([date]) }));
  const wins = windows.map((size) => ({
    size,
    confirmed: { ...countIn(span(yesterday, size)), from: addDays(yesterday, -(size - 1)), to: yesterday },
    partial: { ...countIn(span(today, size)), from: addDays(today, -(size - 1)), to: today },
  }));
  const ratio = (a, b) => (a && b && b.confirmed.all ? Number((a.confirmed.all / b.confirmed.all).toFixed(3)) : null);
  return {
    daily, windows: wins,
    // 確定した窓どうしの比。分母が0なら null
    stickiness: { dauWau: ratio(wins[0], wins[1]), dauMau: ratio(wins[0], wins[2]), wauMau: ratio(wins[1], wins[2]) },
  };
}

// ── 登録ユーザーの利用状況（docs/design-gen/report-users.mjs・report-journal-days.mjs と同じ定義）─────

/**
 * 登録ユーザーごとに、最終利用日・最終書込日・記帳日数などを出す。
 *   最終利用日 … PROFILE.lastSeen（アプリを開いた日）
 *   最終書込日 … updatedAt の最大値を JST の日付にしたもの
 *   記帳日数   … JOURNAL# の createdAt を JST の日付にした distinct 件数（E2E 利用者の仕訳は ENCDATA の1塊で数えられない）
 * @param {Array<[status: string, createdIso: string, username: string, sub: string]>} users
 * @param {Array<{PK: string, SK: string, updatedAt?: string, lastSeen?: string, createdAt?: string}>} items
 * @param {{now: number, selfSubs: string[]}} opts
 */
export function usageOf(users, items, { now, selfSubs }) {
  const by = new Map();
  for (const [status, created, username, sub] of users) {
    by.set(sub, {
      sub: sub.slice(0, 8), created: jstDayOfIso(created), status, provider: providerOf(username),
      self: selfSubs.some((p) => sub.startsWith(p)),
      seen: null, lastIso: null, journals: 0, items: 0, enc: false, days: {},
    });
  }
  for (const it of items) {
    if (!it.PK || !it.PK.startsWith('USER#')) continue;
    const u = by.get(it.PK.slice(5));
    if (!u) continue; // Cognito に居ない＝孤児データ
    u.items++;
    if (it.SK === 'ENCDATA') u.enc = true;
    if (it.SK === 'PROFILE' && it.lastSeen) u.seen = it.lastSeen;
    if (it.updatedAt && (!u.lastIso || it.updatedAt > u.lastIso)) u.lastIso = it.updatedAt;
    if (it.SK && it.SK.startsWith('JOURNAL#')) {
      u.journals++;
      if (it.createdAt) { const d = jstDayOfIso(it.createdAt); u.days[d] = (u.days[d] || 0) + 1; }
    }
  }

  const rows = [...by.values()].map((u) => {
    const ds = Object.keys(u.days).sort();
    const first = ds[0] || null, last = ds.at(-1) || null;
    const firstN = first ? u.days[first] : 0;
    const { days, lastIso, ...rest } = u;
    return {
      ...rest,
      last: lastIso ? jstDayOfIso(lastIso) : null,
      journalDays: ds.length, firstJournal: first, lastJournal: last, firstN,
      firstShare: u.journals ? Math.round((firstN / u.journals) * 100) : 0,
      span: first && last ? dayDiff(first, last) + 1 : 0,
    };
  }).sort((a, b) => (b.seen || b.last || '').localeCompare(a.seen || a.last || ''));

  // 「N日以内」は、その日の 0 時（JST）からの経過日数が N 以下（手元のスクリプトと同じ）
  const within = (n, key) => rows.filter((r) => r[key] && (now - jstStartMs(r[key])) / DAY <= n).length;
  const real = rows.filter((r) => !r.self && r.journals > 0);
  return {
    rows,
    summary: {
      total: rows.length,
      seen7: within(7, 'seen'), seen30: within(30, 'seen'),
      written7: within(7, 'last'), written30: within(30, 'last'),
      // 本人を除き、仕訳のある人
      journalers: real.length,
      journalers2days: real.filter((r) => r.journalDays >= 2).length,
      journalersOneDay: real.filter((r) => r.journalDays === 1).length,
      allOnFirstDay: real.filter((r) => r.firstShare === 100).length,
    },
  };
}

// ── 新規登録 ──────────────────────────────────────────────────

/** 開始日〜終了日（日本時間の暦日。終了日の終わりまで）の新規登録。未確認は除く */
export function registeredIn(users, from, to) {
  const since = jstStartMs(from), until = jstStartMs(to) + DAY;
  const base = summarizeUsers(users, since);
  const inPeriod = users.filter(([s, c]) => {
    const t = Date.parse(c);
    return s !== 'UNCONFIRMED' && t >= since && t < until;
  }).length;
  return { ...base, inPeriod, byDay: base.byDay.filter((d) => d.date <= to) };
}

/** 各日の「いまと同じ時刻（日本時間）まで」の新規登録の人数 */
export function registeredSameTime(users, dates, nowMin) {
  const out = Object.fromEntries(dates.map((d) => [d, 0]));
  for (const [s, c] of users) {
    if (s === 'UNCONFIRMED') continue;
    const d = jstDayOfIso(c);
    if (!(d in out)) continue;
    if (jstMinuteNow(Date.parse(c)) <= nowMin) out[d]++;
  }
  return out;
}
