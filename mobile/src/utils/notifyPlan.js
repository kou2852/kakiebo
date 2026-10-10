// 通知の計画（いつ・何を送るか）を決める純関数。端末への予約は src/notifications.js が行う。
//
// 方針: 通知の数を増やすのではなく、「お金に動きがあったときに開く理由を作る」。
// 毎日必ず送るのをやめ、条件が合うときだけ送る。
//
// ⚠ 通知の文面に金額は入れない（ロック画面に出るため）。入れるのは、カードや定期取引の名前と日付まで。
//
// ローカル通知は「送る時点で記帳済みか」を判定できない。そこで、予約を「次の数日〜数週間分の1回きり」にして、
// 帳簿やカードの設定が変わるたび（記帳・同期・設定変更・アプリを開いたとき）に作り直す。
// 記帳できるのはこのアプリの中だけなので、記帳すれば必ず作り直しが走り、当日分が取り消される。
import { creditCardCycles, isCreditCard } from './creditCard.js';
import { advanceDate } from './autoGen.js';
import { ymd } from './format.js';

export const ID_PREFIX = 'kk_';

// 通知の許可が得られたときの初期値:
//   記帳のリマインダー=オフ／カードの引き落とし=3日前だけオン／定期取引=3日前だけオン／月次=オン／週次=オフ
// 許可が無いうちは何も予約されない（許可は、アプリを初めて開いたとき、既存の利用者はアップデート後に初めて開いたときに求める）。
export const DEFAULT_SETTINGS = {
  reminder: '',
  cardBefore: true, cardDay: false, cardOff: {},
  recBefore: true, recDay: false,
  weekly: false, monthly: true,
};

// 通知の行き先（タップしたときに開く画面）
export const ROUTES = { reminder: '/journal', card: '/credit', weekly: '/', monthly: '/reports', recurring: '/manage/recurring' };

const REMINDER_DAYS = 14;   // 記帳漏れは先の14日分を持つ（開かない日が続いても届くように）
const LEAD_DAYS = 3;        // 引き落とし・予定日の3日前
const HOUR = 9;             // 引き落とし・予定日の通知は朝9時
const AHEAD_DAYS = 21;      // 定期取引は、先の3週間分の予定を見る
const WEEKLY = { hour: 20, weeks: 4 };   // 毎週日曜の夜
const MONTHLY = { hour: 9, months: 3 };  // 毎月1日の朝
const MAX_PLAN = 60;        // iOS は予約が64件まで。余裕を持って、時刻の早いほうから60件

const at = (d, hour, minute = 0) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, minute, 0, 0);
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const fromYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const md = (d) => `${d.getMonth() + 1}/${d.getDate()}`;

/** 名前を「A・B・Cほか2件」に並べる（先頭の3つまで） */
function names(list) {
  const head = list.slice(0, 3).join('・');
  return list.length > 3 ? `${head}ほか${list.length - 3}件` : head;
}

/** 'HH:MM' → [hour, minute]。読めなければ null。 */
function parseTime(v) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v || '');
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  return h < 24 && mi < 60 ? [h, mi] : null;
}

/** 記帳漏れ: その日にまだ記帳が無いときだけ。今日の分は、今日の日付の仕訳があれば出さない。 */
function planReminder(settings, journals, now) {
  const time = parseTime(settings.reminder);
  if (!time) return [];
  const hasToday = journals.some((j) => j.date === ymd(now));
  const out = [];
  for (let i = 0; i < REMINDER_DAYS; i++) {
    const day = addDays(now, i);
    const when = at(day, time[0], time[1]);
    if (when <= now) continue;
    if (i === 0 && hasToday) continue;
    out.push({
      id: `${ID_PREFIX}rem_${ymd(day)}`, when, title: '今日の記帳', body: '今日の記帳はお済みですか？',
      route: ROUTES.reminder,
    });
  }
  return out;
}

/**
 * 同じ日の対象を1通にまとめる。{ date: 'YYYY-MM-DD', name } の配列から、3日前と当日の通知を作る。
 * @param {string} kind 'card' | 'rec'
 * @param {{before:boolean, day:boolean}} on
 */
function groupByDate(kind, items, on, now, { title, noun, route }) {
  const byDate = {};
  items.forEach((it) => { (byDate[it.date] = byDate[it.date] || []).push(it.name); });
  const out = [];
  Object.keys(byDate).sort().forEach((date) => {
    const target = fromYmd(date);
    const list = [...new Set(byDate[date])];
    if (on.before) {
      const when = at(addDays(target, -LEAD_DAYS), HOUR);
      if (when > now) {
        out.push({ id: `${ID_PREFIX}${kind}_${date}_b`, when, title, body: `${names(list)}の${noun}（${md(target)}）の${LEAD_DAYS}日前です。`, route });
      }
    }
    if (on.day) {
      const when = at(target, HOUR);
      if (when > now) out.push({ id: `${ID_PREFIX}${kind}_${date}_d`, when, title, body: `${names(list)}の${noun}です。`, route });
    }
  });
  return out;
}

/**
 * カードの引き落とし。カードごとに、これから来る引き落とし（先の2サイクル分）を数え、
 * 同じ日に複数のカードがあれば1通にまとめる。カードごとにオフにできる。
 */
function planCards(settings, journals, accounts, now) {
  if (!settings.cardBefore && !settings.cardDay) return [];
  const todayStr = ymd(now);
  const items = [];
  accounts.filter((a) => isCreditCard(a) && !a.hidden && !settings.cardOff?.[a.id]).forEach((card) => {
    creditCardCycles(card, journals, accounts)
      .filter((c) => c.settleDate >= todayStr && (c.status === 'open' || c.status === 'unsettled') && c.usage > 0)
      .sort((x, y) => (x.settleDate > y.settleDate ? 1 : -1))
      .slice(0, 2)
      .forEach((c) => items.push({ date: c.settleDate, name: card.name }));
  });
  return groupByDate('card', items, { before: settings.cardBefore, day: settings.cardDay }, now,
    { title: 'カードの引き落とし', noun: '引き落とし日', route: ROUTES.card });
}

/** その予定日が記帳済みか（autoGen.js の判定と同じ: 同日・摘要一致） */
const recorded = (r, date, journals) => journals.some((j) => j.date === date && (j.desc || '') === (r.desc || r.name));

/**
 * 定期取引の予定日。予定日の3日前と当日（どちらもオン・オフできる）。記帳は自動では行わない。
 * すでに記帳した予定日・期日を過ぎた未記帳の分は通知しない。同じ日の対象は1通にまとめる。
 */
function planRecurring(settings, journals, recurring, now) {
  if (!(settings.recBefore || settings.recDay) || !(recurring || []).length) return [];
  const todayStr = ymd(now);
  const horizon = ymd(addDays(now, AHEAD_DAYS));
  const items = [];
  recurring.forEach((r) => {
    let d = r.nextDate, g = 0;
    while (d && d < todayStr && g++ < 1200) d = advanceDate(d, r.frequency); // 過ぎた予定日は通知しない
    while (d && d <= horizon && g++ < 1200) {
      if (!recorded(r, d, journals)) items.push({ date: d, name: r.name });
      d = advanceDate(d, r.frequency);
    }
  });
  return groupByDate('rec', items, { before: settings.recBefore, day: settings.recDay }, now,
    { title: '定期取引の予定日', noun: '予定日', route: ROUTES.recurring });
}

/** 週次の純資産レポート。毎週日曜の夜。金額は書かず、アプリで見るよう促す。 */
function planWeekly(settings, journals, now) {
  if (!settings.weekly || !journals.length) return [];
  const out = [];
  let day = addDays(now, (7 - now.getDay()) % 7); // 次の日曜（今日が日曜でまだ20時前なら今日）
  for (let i = 0; i < WEEKLY.weeks; i++, day = addDays(day, 7)) {
    const when = at(day, WEEKLY.hour);
    if (when <= now) continue;
    out.push({
      id: `${ID_PREFIX}week_${ymd(day)}`, when, title: '今週の純資産',
      body: '今週の純資産の増減を確認できます。', route: ROUTES.weekly,
    });
  }
  return out;
}

/** 月次の純資産・収支レポート。毎月1日の朝。金額は書かず、アプリで見るよう促す。 */
function planMonthly(settings, journals, now) {
  if (!settings.monthly || !journals.length) return [];
  const out = [];
  for (let i = 0; i < MONTHLY.months + 1 && out.length < MONTHLY.months; i++) {
    const first = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const when = at(first, MONTHLY.hour);
    if (when <= now) continue;
    const last = addDays(first, -1); // 先月の末日
    out.push({
      id: `${ID_PREFIX}month_${ymd(first).slice(0, 7)}`, when, title: `${last.getMonth() + 1}月のまとめ`,
      body: '先月の純資産と収支を確認できます。', route: ROUTES.monthly,
    });
  }
  return out;
}

/**
 * 予約する通知の一覧。{ id, when(Date), title, body, route } の配列を、時刻の早い順に返す（最大60件）。
 * @param {{settings:object, journals:Array, accounts:Array, recurring?:Array, now?:Date}} input
 */
export function planNotifications({ settings, journals, accounts, recurring, now = new Date() }) {
  const s = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  const j = journals || [], a = accounts || [];
  return [
    ...planReminder(s, j, now),
    ...planCards(s, j, a, now),
    ...planRecurring(s, j, recurring || [], now),
    ...planWeekly(s, j, now),
    ...planMonthly(s, j, now),
  ].sort((x, y) => x.when - y.when).slice(0, MAX_PLAN);
}

/** いずれかの通知がオンか */
export const anyOn = (settings) => {
  const s = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  return !!(s.reminder || s.cardBefore || s.cardDay || s.recBefore || s.recDay || s.weekly || s.monthly);
};
