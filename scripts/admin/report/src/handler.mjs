// Discord 定時レポート。EventBridge Scheduler から 10:00 / 18:00(JST) に {"slot":"morning"|"evening"} で起動する。
// 送るのは集計した数字だけ。ご意見・問い合わせの本文、IP、sub、参照元URL、User-Agent は送らない。
//
// 13:00 と 17:00 には {"slot":"watch"} で起動し、問い合わせ・ご意見の新着をそれぞれ別のチャンネルへ送る。
// 新着が無ければ何も送らない。本文は載せる（読むための通知のため）。どこまで送ったかは SSM の
// カーソルに残すので、失敗した回があっても次の回で取りこぼさない。
//
// 手動実行の追加入力:
//   at      実行時刻を上書き（ISO文字列）。朝の文面を夜に試すとき用
//   dryRun  true なら送信せず、組み立てた文面を返す
//   since   watch のとき、この日時以降を対象にする（カーソルは動かさない。文面の確認用）
//   test    true ならタイトルに【テスト】を付ける

import * as collect from './collect.mjs';
import {
  parseLogs, classify, countEvents, funnelOf, summarizeUsers, countCreated, isWaitingInquiry,
  judgeChecks, judgeCsp, judgeSignals, judgeWatch,
} from './metrics.mjs';
import {
  windowsOf, formatReport, formatFailure, formatFeedbackItems, formatInquiryItems,
} from './format.mjs';

const FUNNEL_LABEL = {
  app_first: '新規訪問', guest_first: 'ゲスト開始', first_journal: '初めて記帳', registered: '初回ログイン(端末別)',
};
const RETENTION_LABEL = { retain_d1: '1日後', retain_d7: '7日後', retain_d30: '30日後' };

/** 失敗しても他の項目は出す。失敗は null で返し、理由はログに残す */
const safe = async (name, fn) => {
  try { return await fn(); } catch (e) { console.error(`[${name}]`, e); return null; }
};

export async function buildReport(w) {
  const { now } = w;
  const [texts, users, pool, sesProduction, cleanupLastTs, signals, headers, feedbackNew, inquiries, cursor] = await Promise.all([
    safe('logs', () => collect.readLogs(w.logUtcDates)),
    safe('users', () => collect.listUsers()),
    safe('emailConfig', () => collect.getEmailConfiguration()),
    safe('ses', () => collect.getSesProduction()),
    // null（実行なし）と取得失敗を分けるため、失敗は undefined にする
    collect.getCleanupLastTs(now).catch((e) => { console.error('[cleanup]', e); return undefined; }),
    safe('signals', () => collect.getSignals(now)),
    safe('headers', () => collect.getLiveHeaders()),
    safe('feedback', () => collect.countFeedback(w.prevAt, now)),
    safe('inquiries', () => collect.listInquiries()),
    safe('cursor', () => collect.getCursor()),
  ]);

  const { checks } = judgeChecks({
    pool, sesProduction,
    unconfirmedCreated: users ? users.filter(([s]) => s === 'UNCONFIRMED').map(([, c]) => c) : null,
    cleanupLastTs,
  }, now);
  const status = [...checks, judgeCsp(headers), ...judgeSignals(signals), judgeWatch(cursor, now)];
  // 数字の取得に失敗したら「異常なし」にしない（取れなかった0を正常と読まないため）
  const missing = [[texts, 'アクセスログ'], [users, '登録ユーザー'], [feedbackNew, 'ご意見'], [inquiries, '問い合わせ']]
    .filter(([v]) => v == null).map(([, name]) => name);
  if (missing.length) status.push({ level: 'warn', label: 'レポートの集計', value: `${missing.join('・')}が取得できず`, note: null });

  let access = null, funnel = null, retention = null;
  if (texts) {
    const { rows, selfIps } = parseLogs(texts, new Set(w.analyzedDates));
    const { isBot, isSelf, humanOpens, botOpens, selfOpens } = classify(rows, selfIps);
    const onDay = (r) => r.date === w.accessDate;
    const human = humanOpens.filter(onDay);
    access = {
      human: human.length,
      distinct: new Set(human.map((r) => r.ip)).size,
      bot: botOpens.filter(onDay).length,
      self: selfOpens.filter(onDay).length,
    };
    funnel = funnelOf(countEvents(rows.filter(onDay), isBot, isSelf).total).funnel
      .map((f) => ({ label: FUNNEL_LABEL[f.key], count: f.count }));
    if (w.retentionDates) {
      retention = funnelOf(countEvents(rows, isBot, isSelf).total).retention
        .map((x) => ({ label: RETENTION_LABEL[x.key], count: x.count, rate: x.rate }));
    }
  }

  return {
    window: w,
    status,
    users: users && {
      ...summarizeUsers(users, null),
      sincePrev: countCreated(users, w.prevAt, now),
      yesterday: w.yesterdayRange ? countCreated(users, ...w.yesterdayRange) : null,
    },
    access, funnel, retention,
    pending: {
      inquiriesWaiting: inquiries ? inquiries.filter(isWaitingInquiry).length : null,
      feedbackNew,
    },
  };
}

async function send(payload, webhookParam) {
  const url = await collect.getWebhookUrl(webhookParam);
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    if (r.ok) return;
    // 送信しすぎ（429）は指定時間だけ待って1回だけ再送する
    if (r.status === 429 && attempt === 0) {
      const body = await r.json().catch(() => ({}));
      await new Promise((ok) => setTimeout(ok, Math.min(10, Number(body.retry_after) || 2) * 1000));
      continue;
    }
    // URL（トークン入り）はエラーに含めない
    throw new Error(`Discord への送信に失敗しました: HTTP ${r.status}`);
  }
}

/**
 * 問い合わせ・ご意見の新着をそれぞれのチャンネルへ送る。
 * 送れたところまでカーソルを進める。送信に失敗したら進めないので、次の回で送り直す。
 * @param deps AWS 呼び出しの差し替え口（テスト用。既定は collect.mjs）
 */
export async function runWatch(now, { dryRun = false, test = false, since } = {}, deps = collect) {
  const iso = new Date(now).toISOString();
  // since は文面を見るための上書き。カーソルは読まず、書き戻しもしない
  // （書き戻すと「どこまで送ったか」が過去に巻き戻り、次の回で同じものを送ってしまう）
  const keepCursor = !!since;
  const cursor = since ? { feedback: since, inquiry: since } : await deps.getCursor();
  if (!cursor) {
    // 初回。過去ぶんを一気に流さないよう、いまを起点にする
    if (!dryRun) await deps.putCursor({ feedback: iso, inquiry: iso, lastRunAt: iso });
    return { initialized: true, feedback: 0, inquiry: 0 };
  }

  const post = deps.send ?? send; // テストでは送信を差し替える
  const next = { ...cursor, lastRunAt: iso };
  const out = { feedback: 0, inquiry: 0, payloads: [] };

  const feedback = await deps.listFeedbackSince(cursor.feedback);
  if (feedback.length) {
    const payloads = formatFeedbackItems(feedback, { test });
    if (dryRun) out.payloads.push(...payloads);
    else for (const p of payloads) await post(p, collect.CONFIG.webhookParamFeedback);
    // カーソルは SK の FEEDBACK# を外した部分（<ISO日時>#<uuid>）。時刻だけだと同じ件を次回も拾ってしまう
    next.feedback = feedback.at(-1).sk.replace('FEEDBACK#', '') || cursor.feedback;
    out.feedback = feedback.length;
  }

  const threads = await deps.listInquiriesSince(cursor.inquiry);
  // 運営が返信した動きは通知しない（利用者の発言だけが対応の必要なもの）
  const fromUser = threads.filter((t) => t.lastFrom === 'user');
  if (fromUser.length) {
    const payloads = formatInquiryItems(fromUser, { test });
    if (dryRun) out.payloads.push(...payloads);
    else for (const p of payloads) await post(p, collect.CONFIG.webhookParamInquiry);
    out.inquiry = fromUser.length;
  }
  if (threads.length) next.inquiry = threads.at(-1).updatedAt || cursor.inquiry;

  if (!dryRun && !keepCursor) await deps.putCursor(next);
  return out;
}

export async function handler(event = {}) {
  const now = event.at ? Date.parse(event.at) : Date.now();
  const opt = { test: !!event.test };
  try {
    if (event.slot === 'watch') return await runWatch(now, { dryRun: !!event.dryRun, test: opt.test, since: event.since });
    const w = windowsOf(event.slot, now);
    const payload = formatReport(await buildReport(w), opt);
    if (event.dryRun) return payload;
    await send(payload);
    return { ok: true, level: payload.embeds[0].color };
  } catch (e) {
    console.error(e);
    // watch の失敗をそのつど通知するとレポート用チャンネルが荒れる。定時レポートの「新着通知」の行で気づく作りにする
    if (!event.dryRun && event.slot !== 'watch') {
      // 失敗も通知する（届かない＝異常なし、と誤読されないように）。送信自体の失敗はここでは救えない
      await send(formatFailure(event.slot, now, e, opt)).catch((e2) => console.error('[notify failure]', e2));
    }
    throw e;
  }
}
