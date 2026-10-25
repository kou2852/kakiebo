// 画面が使うデータの読み取り。AWS は SDK で、独立した読み取りは並べて走らせる。
// 結果は cache.mjs でしばらくとっておく（タブを切り替えるたびに取り直さない）。
// Discord 定時レポートと共有する読み取り（Cognito・SES・CloudWatch など）は report/src/collect.mjs の関数をそのまま使う。

import { mkdirSync, writeFileSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import * as collect from '../report/src/collect.mjs';
import {
  lastDays, jstDayOfIso, summarizeUsers, isWaitingInquiry, judgeChecks, judgeCsp, judgeSignals, judgeWatch,
  cspStateOf, isWriteReq, SELF_PREFIXES,
} from '../report/src/metrics.mjs';
import { s3, ddb, cmd, insights, friendly, LOGIN_HINT, isAuthError } from './aws.mjs';
import { CACHE_DIR, PF_CACHE_DIR, API_LOG_GROUP, SETTINGS_LOG_GROUP } from './config.mjs';
import { analyze } from './analyze.mjs';
import { cached, invalidate } from './cache.mjs';

const { CONFIG } = collect;
const MIN = 60000;
// 新しい専用テーブル（2026-10-12〜）。移行が済むまでは元のテーブルと両方を読む（collect.mjs と同じ扱い）
const TABLES = {
  inquiry: [CONFIG.table, CONFIG.inquiryTable],
  feedback: [CONFIG.table, CONFIG.feedbackTable],
};
const notFound = (e) => e?.name === 'ResourceNotFoundException';

/** 取得の失敗を握りつぶして fallback を返す。ただし認証切れだけは画面全体の失敗にする（「取得できず」だらけを避ける） */
function soft(promise, fallback, auth) {
  return promise.catch((e) => { if (isAuthError(e)) auth.failed = true; return fallback; });
}

// ── CloudFront ログの同期と集計 ─────────────────────────────────

/** 直近days日ぶんのログを手元に写す（増分）。ファイル名はUTC日なので、JSTの当日ぶんを取りこぼさないよう前後を余分に取る */
async function syncLogs(days) {
  mkdirSync(CACHE_DIR, { recursive: true });
  const span = new Set(lastDays(days + 1));
  span.add(new Date(Date.now() + 86400000).toISOString().slice(0, 10)); // JST当日の残り＝UTC翌日
  const objects = [];
  try {
    await Promise.all([...span].map(async (d) => {
      let token;
      do {
        const page = await s3.send(new cmd.ListObjectsV2Command({
          Bucket: CONFIG.logBucket, Prefix: `${CONFIG.logPrefix}${CONFIG.distributionId}.${d}-`, ContinuationToken: token,
        }));
        objects.push(...(page.Contents || []));
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (token);
    }));
    const todo = objects.filter((o) => {
      try { return statSync(join(CACHE_DIR, basename(o.Key))).size !== o.Size; } catch { return true; }
    });
    let i = 0;
    const worker = async () => {
      while (i < todo.length) {
        const o = todo[i++];
        const r = await s3.send(new cmd.GetObjectCommand({ Bucket: CONFIG.logBucket, Key: o.Key }));
        writeFileSync(join(CACHE_DIR, basename(o.Key)), await r.Body.transformToByteArray());
      }
    };
    await Promise.all(Array.from({ length: 16 }, worker));
    return { files: objects.length, downloaded: todo.length };
  } catch (e) { throw friendly(e, 'アクセスログの同期'); }
}

const getUsers = (fresh) => cached('users', 5 * MIN, () => collect.listUsers().catch((e) => { throw friendly(e, '登録ユーザーの取得'); }), fresh);

const jstDayStartMs = (day) => Date.parse(`${day}T00:00:00+09:00`);

/** アクセスと自前イベントの集計（成長・深掘り・今日で共有） */
export function getStats(days, fresh) {
  return cached(`stats:${days}`, 5 * MIN, async () => {
    // ログの同期とユーザーの取得は独立しているので並べる。ユーザーが取れなくても他の数字は出す
    const auth = { failed: false };
    const [, users] = await Promise.all([
      cached(`sync:${days}`, 3 * MIN, () => syncLogs(days), fresh),
      soft(getUsers(fresh).then((r) => r.value), null, auth),
    ]);
    // 期間の始まりは、アクセスの集計（lastDays）と同じ JST の暦日の 0 時にそろえる
    const registered = users ? summarizeUsers(users, jstDayStartMs(lastDays(days).at(-1))) : null;
    return analyze(days, registered);
  }, fresh);
}

// ── 状態 ──────────────────────────────────────────────────────

/** 本番が実際に返しているヘッダーを見る。設定ではなく配信結果を確認する */
async function liveHeaders() {
  try {
    const r = await fetch(CONFIG.appUrl, { method: 'HEAD' });
    return {
      csp: cspStateOf(r.headers.get('content-security-policy'), r.headers.get('content-security-policy-report-only')),
      hsts: !!r.headers.get('strict-transport-security'),
    };
  } catch { return null; }
}

function judgeHsts(headers) {
  const label = 'HSTS ヘッダー';
  if (!headers) return { level: 'warn', label, value: '取得できず', note: null };
  return headers.hsts
    ? { level: 'ok', label, value: 'あり', note: null }
    : { level: 'warn', label, value: 'なし', note: 'HTTPS への固定が効いていません' };
}

export function getStatus(fresh) {
  return cached('status', 5 * MIN, async () => {
    const now = Date.now();
    const auth = { failed: false };
    // 独立した読み取りを全部いっしょに走らせる（以前は aws cli を順番に7回以上起動していた）
    const [pool, sesProduction, users, cleanupLastTs, signals, headers, cursor, inq] = await Promise.all([
      soft(collect.getEmailConfiguration(), null, auth),
      soft(collect.getSesProduction(), null, auth),
      soft(getUsers(fresh).then((r) => r.value), null, auth),
      soft(collect.getCleanupLastTs(now), undefined, auth), // undefined = 取得できず / null = 直近3日で実行なし
      soft(collect.getSignals(now), null, auth),
      liveHeaders(),
      soft(collect.getCursor(), undefined, auth),           // undefined = 取得できず / null = 記録なし
      soft(getInquiries(fresh).then((r) => r.value), null, auth),
    ]);
    if (auth.failed) throw new Error(LOGIN_HINT);

    const unconfirmedCreated = users ? users.filter((u) => u[0] === 'UNCONFIRMED').map((u) => u[1]) : null;
    const watch = cursor === undefined
      ? { level: 'warn', label: '新着通知の前回確認', value: '取得できず', note: null }
      : judgeWatch(cursor, now);
    return {
      checks: judgeChecks({ pool, sesProduction, unconfirmedCreated, cleanupLastTs }, now),
      signals,
      headers,
      judged: { csp: judgeCsp(headers), hsts: judgeHsts(headers), watch, signals: judgeSignals(signals) },
      inquiriesWaiting: inq ? inq.waiting : null,
    };
  }, fresh);
}

// ── 問い合わせ ────────────────────────────────────────────────

/** ログイン済みユーザーとのスレッド（本文つき）。表示するのは sub の先頭8桁のみで、メールアドレスは取得しない */
export function getInquiries(fresh) {
  return cached('inquiries', 2 * MIN, async () => {
    const byId = new Map(); // 新しいテーブルを後に読み、同じ id は上書きする
    try {
      for (const table of TABLES.inquiry) {
        let start;
        do {
          let page;
          try {
            page = await ddb.send(new cmd.ScanCommand({
              TableName: table, FilterExpression: 'begins_with(SK, :p)',
              ExpressionAttributeValues: { ':p': { S: 'INQUIRY#' } }, ExclusiveStartKey: start,
            }));
          } catch (e) {
            if (table !== CONFIG.table && notFound(e)) break; // 新しいテーブルがまだ無い（sam deploy 前）
            throw e;
          }
          for (const i of page.Items || []) {
            const pk = i.PK?.S || '';
            const t = {
              table, pk, sk: i.SK?.S || '',
              // 退会した人の問い合わせは sub を外して PK=DELETED に残している
              sub: pk === 'DELETED' ? '退会済み' : pk.replace('USER#', '').slice(0, 8),
              id: i.id?.S || '', subject: i.subject?.S || '', status: i.status?.S || 'open',
              createdAt: i.createdAt?.S || '', updatedAt: i.updatedAt?.S || '',
              messages: (i.messages?.L || []).map((m) => ({
                from: m.M?.from?.S || 'user', body: m.M?.body?.S || '', at: m.M?.at?.S || '',
              })),
            };
            byId.set(t.id || `${table}|${t.sk}`, t);
          }
          start = page.LastEvaluatedKey;
        } while (start);
      }
    } catch (e) { throw friendly(e, '問い合わせの取得'); }
    const items = [...byId.values()];
    items.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    const waits = (t) => isWaitingInquiry({ status: t.status, lastFrom: t.messages.at(-1)?.from });
    items.forEach((t) => { t.waiting = waits(t); });
    return { total: items.length, waiting: items.filter((t) => t.waiting).length, items };
  }, fresh);
}

/** 運営からの返信を追記する。messages にだけ足し、他の属性は触らない。本番への書き込みはこれだけ */
export async function replyInquiry(table, pk, sk, body, close) {
  if (!TABLES.inquiry.includes(table)) throw new Error('table が不正です');
  const now = new Date().toISOString();
  try {
    await ddb.send(new cmd.UpdateItemCommand({
      TableName: table, Key: { PK: { S: pk }, SK: { S: sk } },
      ConditionExpression: 'attribute_exists(SK)',
      UpdateExpression: 'SET messages = list_append(if_not_exists(messages, :empty), :m), updatedAt = :u, #st = :s',
      ExpressionAttributeNames: { '#st': 'status' },
      ExpressionAttributeValues: {
        ':m': { L: [{ M: { from: { S: 'staff' }, body: { S: body }, at: { S: now } } }] },
        ':empty': { L: [] }, ':u': { S: now }, ':s': { S: close ? 'closed' : 'open' },
      },
    }));
  } catch (e) { throw friendly(e, '返信の保存'); }
  invalidate('inquiries'); invalidate('status'); // 返信のあとは問い合わせと返信待ちの件数だけ取り直す
  return { ok: true };
}

// ── ご意見 ────────────────────────────────────────────────────

/** アプリ内アンケートの自由記述。匿名で保存されているため、誰が送ったかは分からない */
export function getFeedback(fresh) {
  return cached('feedback', 5 * MIN, async () => {
    const seen = new Map(); // 同じ SK は1件にまとめる（新しいテーブルが後）
    try {
      for (const table of TABLES.feedback) {
        let start;
        do {
          let page;
          try {
            page = await ddb.send(new cmd.QueryCommand({
              TableName: table, KeyConditionExpression: 'PK = :pk',
              ExpressionAttributeValues: { ':pk': { S: 'FEEDBACK' } },
              ScanIndexForward: false, ExclusiveStartKey: start, // SKが FEEDBACK#<ISO日時>#<uuid> なので降順＝新しい順
            }));
          } catch (e) {
            if (table !== CONFIG.table && notFound(e)) break;
            throw e;
          }
          for (const i of page.Items || []) {
            const it = { sk: i.SK?.S || '', timestamp: i.timestamp?.S || '', body: i.body?.S || '' };
            seen.set(it.sk, it);
          }
          start = page.LastEvaluatedKey;
        } while (start);
      }
    } catch (e) { throw friendly(e, 'ご意見の取得'); }
    const items = [...seen.values()].sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''))
      .map(({ sk, ...rest }) => rest);
    // 月の区切りは日本時間（timestamp は UTC の ISO）
    const byMonth = {};
    for (const it of items) {
      const m = it.timestamp ? jstDayOfIso(it.timestamp).slice(0, 7) : '';
      if (m) byMonth[m] = (byMonth[m] || 0) + 1;
    }
    return {
      total: items.length,
      byMonth: Object.entries(byMonth).map(([month, count]) => ({ month, count })).sort((a, b) => b.month.localeCompare(a.month)),
      items,
    };
  }, fresh);
}

// ── 退会 ──────────────────────────────────────────────────────

// Insights の @timestamp は "YYYY-MM-DD hh:mm:ss.SSS"(UTC)。そのまま Date.parse するとローカル時刻と解釈される
const insightsMs = (s) => Date.parse(String(s).replace(' ', 'T') + 'Z');

/**
 * 退会の記録と、そのとき任意で書かれた理由。
 * 退会は API Gateway のアクセスログ（DELETE /prod/api/account の成功）、理由は SettingsFunction が出す
 * ACCOUNT_DELETE_REASON の行にある。両者に共通のIDは無いので時刻で突き合わせる。
 */
export function getDeletions(fresh) {
  return cached('deletions', 10 * MIN, async () => {
    const now = Date.now();
    const rows = await insights({
      groups: [API_LOG_GROUP, SETTINGS_LOG_GROUP], limit: 1000, startMs: now - 90 * 86400000, endMs: now, what: '退会記録の取得',
      query: 'fields @timestamp, @message, status, ip'
        + ' | filter @message like /ACCOUNT_DELETE_REASON/ or (method = "DELETE" and path = "/prod/api/account")'
        + ' | limit 1000',
    });
    const TAG = 'ACCOUNT_DELETE_REASON ';
    const deletions = [];
    const reasons = [];
    for (const row of rows) {
      const t = insightsMs(row['@timestamp']);
      const msg = String(row['@message'] || '');
      const i = msg.indexOf(TAG);
      if (i >= 0) {
        try { reasons.push({ t, reason: JSON.parse(msg.slice(i + TAG.length)).reason || '' }); } catch { /* 壊れた行は捨てる */ }
      } else if (String(row.status).startsWith('2')) { // 失敗した試行は退会ではない
        deletions.push({ t, self: SELF_PREFIXES.some((p) => String(row.ip || '').startsWith(p)) });
      }
    }
    // 退会1件につき、30秒以内で最も近い理由を1つだけ割り当てる
    const used = new Set();
    const jst = (t) => new Date(t + 9 * 3600000).toISOString().replace('T', ' ').slice(0, 16);
    const items = deletions.map((d) => {
      let best = -1;
      for (let i = 0; i < reasons.length; i++) {
        if (used.has(i) || Math.abs(reasons[i].t - d.t) > 30000) continue;
        if (best < 0 || Math.abs(reasons[i].t - d.t) < Math.abs(reasons[best].t - d.t)) best = i;
      }
      if (best >= 0) used.add(best);
      return { at: jst(d.t), reason: best >= 0 ? reasons[best].reason : '', self: d.self, recorded: true };
    });
    // アクセスログを取り始める前（2026-08-13 より前）の退会は記録が無い。理由だけでも捨てずに出す
    reasons.forEach((r, i) => { if (!used.has(i)) items.push({ at: jst(r.t), reason: r.reason, self: false, recorded: false }); });
    items.sort((a, b) => b.at.localeCompare(a.at));
    return {
      total: deletions.length,
      withReason: items.filter((x) => x.recorded && x.reason).length,
      self: deletions.filter((d) => d.self).length,
      items,
    };
  }, fresh);
}

// ── 端末別の利用（API Gateway のアクセスログ）─────────────────────

/**
 * どの端末から使われているか。ログには sub が載るので、アプリ更新なしで「誰が・いつ・何回」が分かる。
 * ⚠ iOS Safari の UA は Mozilla 始まりなので web。アプリ(CFNetwork/Darwin)と別物。
 */
const platformOf = (ua) => {
  if (!ua) return 'unknown';
  if (/CFNetwork|Darwin/i.test(ua)) return 'ios';
  if (/okhttp|Android/i.test(ua)) return 'android';
  if (/^Mozilla\//i.test(ua)) return 'web';
  return 'other';
};

const medianOf = (a) => {
  if (!a.length) return 0;
  const t = [...a].sort((x, y) => x - y), m = t.length >> 1;
  return t.length % 2 ? t[m] : (t[m - 1] + t[m]) / 2;
};

const INSIGHTS_LIMIT = 10000;

/** 指定区間の認証済みリクエストを取る。取得上限に達したら区間を半分に割って取り直す */
async function queryApiLogs(startMs, endMs) {
  const rows = await insights({
    groups: [API_LOG_GROUP], limit: INSIGHTS_LIMIT, startMs, endMs, what: 'APIアクセスログの取得',
    query: 'fields @timestamp, sub, ua, method, path'
      + ' | filter ispresent(sub) and sub != "-" and method != "OPTIONS"'
      + ` | limit ${INSIGHTS_LIMIT}`,
  });
  if (rows.length >= INSIGHTS_LIMIT && endMs - startMs > 3600000) {
    const mid = startMs + Math.floor((endMs - startMs) / 2);
    return [...await queryApiLogs(startMs, mid), ...await queryApiLogs(mid, endMs)];
  }
  return rows;
}

// 過ぎたJST日ぶんの集計は変わらないので、日ごとに {sub: {端末: [リクエスト, 記帳]}} を保存して取り直さない。
// 判定のルールを変えたら PF_CACHE_VERSION を上げる。版が違うキャッシュは読まず、取り直す
// （v1 は記帳の判定が /prod 付きの path に当たらず、書き込みが全て0で保存されていた）。
const PF_CACHE_VERSION = 2;
const pfCachePath = (day) => join(PF_CACHE_DIR, `${day}.json`);
const readPfCache = (day) => {
  try {
    const c = JSON.parse(readFileSync(pfCachePath(day), 'utf8'));
    return c && c.v === PF_CACHE_VERSION ? c.data : null;
  } catch { return null; }
};

export function getPlatforms(days, fresh) {
  return cached(`platforms:${days}`, 5 * MIN, async () => {
    const wanted = lastDays(days).sort(); // 古い順のJST日。期間の区切りは画面の他の数字と揃える
    const today = lastDays(1)[0];
    const perDay = {};
    const missing = [];
    for (const d of wanted) {
      const c = d === today ? null : readPfCache(d); // 当日は確定しないので毎回取り直す
      if (c) perDay[d] = c; else missing.push(d);
    }
    if (missing.length) {
      const rows = await queryApiLogs(jstDayStartMs(missing[0]), Date.now());
      // 取り直した区間は、1件も無かった日も空で上書きする（「空の日」と「未取得」を区別するため）
      const span = wanted.filter((d) => d >= missing[0]);
      for (const d of span) perDay[d] = {};
      for (const r of rows) {
        const d = jstDayOfIso(new Date(insightsMs(r['@timestamp'])).toISOString());
        if (!perDay[d]) continue; // 区間の端で期間外に落ちる行
        const slot = ((perDay[d][r.sub] ||= {})[platformOf(r.ua)] ||= [0, 0]);
        slot[0]++;
        if (isWriteReq(r.method, r.path || '')) slot[1]++;
      }
      if (!existsSync(PF_CACHE_DIR)) mkdirSync(PF_CACHE_DIR, { recursive: true });
      for (const d of span) {
        if (d !== today) writeFileSync(pfCachePath(d), JSON.stringify({ v: PF_CACHE_VERSION, data: perDay[d] }));
      }
    }
    const byPf = {};
    for (const d of wanted) {
      for (const [sub, pfs] of Object.entries(perDay[d] || {})) {
        for (const [pf, [req, wr]] of Object.entries(pfs)) {
          const e = (byPf[pf] ||= { requests: 0, writes: 0, users: new Set(), days: new Map() });
          e.requests += req;
          e.writes += wr;
          e.users.add(sub);
          if (!e.days.has(sub)) e.days.set(sub, new Set());
          e.days.get(sub).add(d);
        }
      }
    }
    const platforms = Object.entries(byPf).map(([platform, e]) => {
      const counts = [...e.days.values()].map((x) => x.size);
      return {
        platform, requests: e.requests, writes: e.writes, users: e.users.size,
        // 2日以上使った人数。母数が小さいので率ではなく実数で出す。
        returned: counts.filter((n) => n >= 2).length,
        medianDays: medianOf(counts),
      };
    }).sort((a, b) => b.users - a.users || b.requests - a.requests);
    return { platforms };
  }, fresh);
}

// ── 今日 ──────────────────────────────────────────────────────

/** 昨日（確定）と今日（途中）の主な数字と、昨日までの直近7日の平均 */
export function getToday(fresh) {
  return cached('today', 5 * MIN, async () => {
    const st = (await getStats(9, fresh)).value; // 今日 + 昨日までの8日
    const days = lastDays(9); // 新しい順: [今日, 昨日, ...]
    const ev = Object.fromEntries(st.events.byDay.map((d) => [d.date, d.counts]));
    const op = Object.fromEntries(st.byDay.map((d) => [d.date, d]));
    const reg = Object.fromEntries((st.registeredUsers?.byDay || []).map((d) => [d.date, d.count]));
    const metric = (key, label, of, note) => {
      const v = days.map(of);
      const avg = v.slice(1, 8).reduce((s, x) => s + x, 0) / 7;
      return { key, label, note: note || null, yesterday: v[1], today: v[0], avg7: Number(avg.toFixed(1)) };
    };
    const rows = [
      metric('registered', '新規登録', (d) => reg[d] || 0, 'Cognito の登録日時'),
      metric('opens', '人間のオープン', (d) => op[d]?.human || 0, 'GET のみ・bot と自分を除く'),
      metric('distinct', '実端末数', (d) => op[d]?.distinct || 0, 'IP で数えた近似'),
      metric('guest_start', 'ゲスト開始', (d) => ev[d]?.guest_start || 0, 'ウェブ'),
      metric('journal_added', 'ゲストの記帳', (d) => ev[d]?.journal_added || 0, 'ウェブ'),
      metric('m_onboard_done', 'オンボーディング完了', (d) => ev[d]?.m_onboard_done || 0, 'アプリ・新しく入れた端末'),
      metric('m_first_journal', '初回記帳', (d) => ev[d]?.m_first_journal || 0, 'アプリ・新しく入れた端末'),
    ];
    return {
      yesterday: days[1], today: days[0], rows,
      eventNames: st.events.total.map((e) => ({ name: e.name, count: e.count })), // 一覧にないイベントの検知用
      cspReports: st.events.cspReports || 0,
    };
  }, fresh);
}
