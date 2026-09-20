// 定時レポートの「いつからいつまでを数えるか」と「Discord に送る文面」を決める。AWS には触れない。

import { JST_OFFSET, lastDays } from './metrics.mjs';

const DAY = 86400000;
const jstDate = (ms) => new Date(ms + JST_OFFSET).toISOString().slice(0, 10);
const at = (date, hhmm) => Date.parse(`${date}T${hhmm}:00+09:00`);
const WEEK = ['日', '月', '火', '水', '木', '金', '土'];
/** 2026-09-17 → 9/17(木) */
export const dayLabel = (date) => {
  const d = new Date(`${date}T00:00:00Z`);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${WEEK[d.getUTCDay()]})`;
};

export const SLOTS = { morning: '10:00', evening: '18:00' };

/**
 * 朝（10:00）は前日の確定値、夕方（18:00）は当日の途中経過。
 * 「前回から」は前回の送信予定時刻で区切る。値を保存しないので、1回送り損ねても次回の数字はずれない。
 * @param {'morning'|'evening'} slot
 * @param {number} now 実行時刻(ms)
 */
export function windowsOf(slot, now) {
  if (!SLOTS[slot]) throw new Error(`slot が不正です: ${slot}`);
  const today = jstDate(now);
  const yesterday = jstDate(now - DAY);
  const morning = slot === 'morning';
  return {
    slot,
    now,
    today,
    // 前回の送信予定時刻。朝→前日18:00、夕方→当日10:00
    prevAt: morning ? at(yesterday, SLOTS.evening) : at(today, SLOTS.morning),
    prevLabel: morning ? `${dayLabel(yesterday).replace(/\(.\)$/, '')} ${SLOTS.evening}` : SLOTS.morning,
    // アクセスと獲得の流れを数えるJST日
    accessDate: morning ? yesterday : today,
    accessLabel: morning ? `昨日（${dayLabel(yesterday)}）` : `今日（${dayLabel(today)} 途中）`,
    // 前日の新規登録（朝だけ）。[前日0時, 当日0時)
    yesterdayRange: morning ? [at(yesterday, '00:00'), at(today, '00:00')] : null,
    // 継続（朝だけ）。昨日までの30日
    retentionDates: morning ? lastDays(30, now - DAY) : null,
    // ログを読む範囲。自分判定に使う selftest の送信元を集めるため、朝も夕方も同じ31日＋境界ぶんを読む。
    // ファイル名はUTC日なので、JSTの31日前の0時（＝UTCで32日前の15時）まで遡る。
    logUtcDates: Array.from({ length: 33 }, (_, i) => new Date(now - i * DAY).toISOString().slice(0, 10)),
    // ログを読んで集計に使うJST日（アクセスと継続の和集合）
    analyzedDates: morning ? lastDays(30, now - DAY) : [today],
  };
}

const COLOR = { ok: 0x15a06a, warn: 0xc98a12, bad: 0xe0556a };
const MARK = { warn: '▲', bad: '✕' };
const num = (v) => (v == null ? '—' : Number(v).toLocaleString('en-US'));
const pct = (count, base) => (base ? `${Math.round((count / base) * 100)}%` : '—');

/**
 * @param {object} r buildReport の戻り値
 * @param {{ test?: boolean }} opt
 */
export function formatReport(r, { test = false } = {}) {
  const w = r.window;
  const lines = [];

  // ── 状態。問題のある行だけを並べる ──
  const bad = r.status.filter((x) => x.level === 'bad');
  const warn = r.status.filter((x) => x.level === 'warn');
  const level = bad.length ? 'bad' : (warn.length ? 'warn' : 'ok');
  lines.push(level === 'ok' ? '**異常なし**'
    : level === 'bad' ? `**要対応 ${bad.length}件**` + (warn.length ? `（注意 ${warn.length}件）` : '')
      : `**注意 ${warn.length}件**`);
  for (const x of [...bad, ...warn]) {
    lines.push(`${MARK[x.level]} ${x.label}：${x.value}` + (x.note ? `（${x.note}）` : ''));
  }

  // ── 登録者 ──
  lines.push('', '**■ 登録者**');
  const u = r.users;
  if (!u) lines.push('取得できず');
  else {
    lines.push(`累計 ${num(u.total)}人（Google ${u.google} / Apple ${u.apple} / メール ${u.email}）`);
    lines.push(`前回（${w.prevLabel}）から +${u.sincePrev}人` + (u.yesterday != null ? ` ／ 昨日 +${u.yesterday}人` : ''));
    if (u.unconfirmed) lines.push(`メール未確認 ${u.unconfirmed}件`);
  }

  // ── アクセス ──
  lines.push('', `**■ アクセス ${w.accessLabel}**`);
  const a = r.access;
  if (!a) lines.push('取得できず');
  else {
    lines.push(`実人数 ${num(a.distinct)}人 ／ 訪問 ${num(a.human)}回`);
    lines.push(`（除外：ボット ${num(a.bot)}回 ／ 自分 ${num(a.self)}回）`);
  }

  // ── 獲得の流れ（朝も夕方も）。%は前段比。等幅で揃えるためコードブロックにする ──
  lines.push('', `**■ 獲得の流れ ${w.accessLabel}**`);
  if (!r.funnel) lines.push('取得できず');
  else {
    const width = Math.max(...r.funnel.map((f) => String(f.count).length));
    const body = r.funnel.map((f, i) => {
      const n = String(f.count).padStart(width);
      if (i === 0) return `${f.label} ${n}人`;
      return `→${f.label} ${n}人（${pct(f.count, r.funnel[i - 1].count)}）`;
    });
    lines.push('```', ...body, '```');
  }

  // ── 継続（朝だけ） ──
  if (w.slot === 'morning') {
    lines.push('**■ 継続（直近30日・ゲスト開始した人が分母）**');
    if (!r.retention) lines.push('取得できず');
    else lines.push(r.retention.map((x) => `${x.label} ${x.count}人（${x.rate == null ? '—' : Math.round(x.rate) + '%'}）`).join(' ／ '));
  }

  // ── 対応待ち ──
  lines.push('', '**■ 対応待ち**');
  const p = r.pending;
  lines.push(`問い合わせ 返信待ち ${p.inquiriesWaiting == null ? '取得できず' : p.inquiriesWaiting + '件'}`
    + ` ／ ご意見 新着 ${p.feedbackNew == null ? '取得できず' : p.feedbackNew + '件'}`);

  const icon = { ok: '🟢', warn: '🟡', bad: '🔴' }[level];
  return {
    username: 'kurofukubo レポート',
    // 本文中の @everyone 等で一斉通知が飛ばないようにする
    allowed_mentions: { parse: [] },
    embeds: [{
      title: `${test ? '【テスト】' : ''}${icon} kurofukubo 定時レポート ${dayLabel(w.today)} ${SLOTS[w.slot]}`,
      description: lines.join('\n').slice(0, 4000),
      color: COLOR[level],
      footer: { text: 'アクセスログは数十分〜数時間遅れて届く' },
      timestamp: new Date(w.now).toISOString(),
    }],
  };
}

/** 集計そのものが失敗したときの通知 */
export function formatFailure(slot, now, err, { test = false } = {}) {
  return {
    username: 'kurofukubo レポート',
    allowed_mentions: { parse: [] },
    embeds: [{
      title: `${test ? '【テスト】' : ''}🔴 kurofukubo 定時レポート ${dayLabel(jstDate(now))} ${SLOTS[slot] || slot}`,
      description: `**集計に失敗しました**\n${String(err?.message || err).slice(0, 500)}`,
      color: COLOR.bad,
      timestamp: new Date(now).toISOString(),
    }],
  };
}

// ── 問い合わせ・ご意見の新着通知（レポートとは別の Webhook・別チャンネル）──────────
// レポートと違い本文を載せる。読むための通知なので、長いものは切って「続きはダッシュボード」に送る。

const BODY_LIMIT = 1500;
const EMBEDS_PER_MESSAGE = 10; // Discord の上限
const cut = (s, n = BODY_LIMIT) => (s.length > n ? `${s.slice(0, n)}…（続きはダッシュボード）` : s);
/** ISO日時 → 9/17(木) 14:05（JST） */
export const stamp = (iso) => {
  const t = Date.parse(iso) + JST_OFFSET;
  if (Number.isNaN(t)) return iso;
  const d = new Date(t);
  return `${dayLabel(d.toISOString().slice(0, 10))} ${d.toISOString().slice(11, 16)}`;
};

const message = (embeds) => ({ username: 'kurofukubo', allowed_mentions: { parse: [] }, embeds });
/** 1通に入るぶんずつ分ける */
const batch = (embeds) => {
  const out = [];
  for (let i = 0; i < embeds.length; i += EMBEDS_PER_MESSAGE) out.push(message(embeds.slice(i, i + EMBEDS_PER_MESSAGE)));
  return out;
};

/** ご意見（アプリ内アンケートの自由記述）。匿名で、誰が送ったかは分からない */
export function formatFeedbackItems(items, { test = false } = {}) {
  return batch(items.map((x) => ({
    title: `${test ? '【テスト】' : ''}🗣 新しいご意見`,
    description: cut(x.body),
    color: 0x15a06a,
    footer: { text: stamp(x.timestamp) },
  })));
}

/** 問い合わせ。新規スレッドと、利用者からの追記の両方を通知する */
export function formatInquiryItems(items, { test = false } = {}) {
  return batch(items.map((x) => ({
    title: `${test ? '【テスト】' : ''}✉ ${x.isNew ? '新しい問い合わせ' : '問い合わせに返信がありました'}`,
    description: [
      x.subject ? `**${cut(x.subject, 100)}**` : null,
      cut(x.lastBody),
      '',
      `利用者 ${x.sub} ／ 状態 ${x.status === 'closed' ? '終了' : '対応中'} ／ 返信はダッシュボードの「問い合わせ」タブから`,
    ].filter((v) => v != null).join('\n'),
    color: 0x0d9488,
    footer: { text: stamp(x.updatedAt) },
  })));
}
