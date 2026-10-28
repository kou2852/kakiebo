// CloudFront ログ（手元の写し）から、アクセスと自前イベントの数字を組み立てる。AWS には触れない。
// 判定のルール（ボット・自分IP・ファネル）は report/src/metrics.mjs にあり、Discord 定時レポートと共有している。

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import {
  BOT, SUSPICIOUS_QUERY, dec, isOutdatedUa, lastDays, parseLogs, classify, countEvents, funnelOf,
} from '../report/src/metrics.mjs';
import { CACHE_DIR } from './config.mjs';

// キャッシュ内の.gzを全パースし、直近days日で集計
/**
 * 訪問者ごとに計測イベントを時系列で並べる。
 * 「32%が記帳に到達」のような率は、どこで何をして帰ったかまでは教えてくれない。
 * D30が0%という状況では、率よりも一人ひとりの実際の順序のほうが答えに近い。
 *
 * 同一人物の判定はIP。IPv6は再接続で変わり、モバイル回線は共有されるため厳密ではない。
 * IPは画面へ返さない（個人特定を避けるため通し番号に置き換える）。
 */
// 実際に触っていた時間。最初と最後の差を取ると離席がそのまま入るため
// （例: 5分使って2時間放置し1分使った人が「128分」になっていた）、
// 30分以上あいたらセッションの切れ目とみなし、各セッションの長さを足す。
const SESSION_GAP_MS = 30 * 60 * 1000;
function sessionTime(times) {
  const t = [...times].sort((a, b) => a - b);
  if (!t.length) return { minutes: 0, sessions: 0 };
  let total = 0, start = t[0], prev = t[0], sessions = 1;
  for (const x of t) {
    if (x - prev > SESSION_GAP_MS) { total += prev - start; start = x; sessions++; }
    prev = x;
  }
  total += prev - start;
  return { minutes: Math.round(total / 60000), sessions };
}

function buildJourneys(rows, isBot, isSelf) {
  const byIp = new Map();
  for (const r of rows) {
    if (isBot(r) || isSelf(r.ip)) continue;
    const p = byIp.get(r.ip) || {
      ev: [], days: new Set(), times: [], first: `${r.date} ${r.time}`, last: `${r.date} ${r.time}`,
      ref: '', mobile: /Mobile|Android|iPhone/.test(dec(r.ua)),
    };
    p.days.add(r.date);
    const at = `${r.date} ${r.time}`;
    if (at > p.last) p.last = at;
    if (at < p.first) p.first = at; // ログの読み込み順に依存しないよう最小値を取る
    p.times.push(Date.parse(`${r.date}T${r.time}Z`)); // 滞在時間の算出用
    if (!p.ref) {
      const ref = dec(r.ref || '');
      if (ref && ref !== '-' && !ref.includes('app.kurofukubo')) {
        try { p.ref = new URL(ref).hostname; } catch { /* 不正なURLは無視 */ }
      }
    }
    const m = dec(r.uri).match(/^\/_e\/([\w.-]+)/);
    // ts は並べ替え用（日付を含む）。t は表示用の時刻のみ
    if (m && m[1] !== 'csp-report') p.ev.push({ e: m[1], t: r.time.slice(0, 5), ts: at });
    byIp.set(r.ip, p);
  }

  const list = [];
  let n = 0;
  for (const p of byIp.values()) {
    if (!p.ev.length) continue; // 計測イベントが1つも無い＝アプリを開いていない
    // 日付込みで並べる。時刻だけで並べると、複数日にまたがる訪問者の順序が入れ替わる
    p.ev.sort((a, b) => a.ts.localeCompare(b.ts));
    // 同じイベントの連続は1つに畳む（journal_added ×48 のような繰り返しを読みやすくする）
    const seq = [];
    for (const x of p.ev) {
      const last = seq[seq.length - 1];
      if (last && last.e === x.e) last.n++;
      else seq.push({ e: x.e, n: 1 });
    }
    list.push({
      id: ++n,
      first: p.first, days: p.days.size,
      ...sessionTime(p.times),
      mobile: p.mobile, ref: p.ref || '直接',
      seq, last: p.ev[p.ev.length - 1].e,
      writes: p.ev.filter((x) => x.e === 'journal_added').length,
      registered: p.ev.some((x) => x.e === 'registered'),
    });
  }
  // 初回アクセスの新しい順。最近の訪問者が上に来る
  list.sort((a, b) => b.first.localeCompare(a.first));

  // 最後のイベント別＝どこで消えたか
  const dropoff = {};
  for (const p of list) dropoff[p.last] = (dropoff[p.last] || 0) + 1;

  return {
    visitors: list,
    dropoff: Object.entries(dropoff).map(([e, n2]) => ({ e, n: n2 })).sort((a, b) => b.n - a.n),
  };
}

// ── 追加の集計（純粋な関数。テストあり）──────────────────────────

const jstMinuteOf = (r) => ((Number(r.time.slice(0, 2)) + 9) % 24) * 60 + Number(r.time.slice(3, 5));

/** 人間のオープンを日本時間の時間帯（0〜23時）ごとに数える。count は回数、distinct は IP の数 */
export function hourlyOf(humanOpens) {
  const out = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0, ips: new Set() }));
  for (const r of humanOpens) {
    const h = (Number(r.time.slice(0, 2)) + 9) % 24;
    out[h].count++;
    out[h].ips.add(r.ip);
  }
  return out.map(({ hour, count, ips }) => ({ hour, count, distinct: ips.size }));
}

/**
 * アプリが送る段のイベント（m_*）を端末ごとに数える。端末は UA の末尾 (ios) / (android)。
 * 段には順序が決まっていない（スキップした端末でも、帳簿の状態から m_opening などは届く）ので、
 * ファネルにせず段ごとの人数で出す。
 */
export function appStagesOf(rows, isBot, isSelf) {
  const out = {};
  for (const r of rows) {
    const m = r.uri && r.uri.match(/^\/_e\/(m_[a-z0-9_]+)$/i);
    if (!m || isBot(r) || isSelf(r.ip)) continue;
    const ua = dec(r.ua);
    const pf = /\(ios\)/i.test(ua) ? 'ios' : /\(android\)/i.test(ua) ? 'android' : 'other';
    const e = (out[m[1]] ||= { ios: 0, android: 0, other: 0 });
    e[pf]++;
  }
  return out;
}

/**
 * 各日の「いまと同じ時刻（日本時間）まで」の人間のオープン数・IP数・イベント数。
 * 途中の今日を、丸1日の過去と比べて落ち込んだと誤読しないためのもの。
 * @param {Set<object>} humanSet classify の humanOpens（rows の要素そのもの）
 * @param {number} nowMin 日本時間の 0 時からの経過分
 */
export function sameTimeOf(rows, humanSet, isBot, isSelf, nowMin) {
  const out = {};
  for (const r of rows) {
    if (jstMinuteOf(r) > nowMin) continue;
    const e = (out[r.date] ||= { opens: 0, ips: new Set(), events: {} });
    if (humanSet.has(r)) { e.opens++; e.ips.add(r.ip); continue; }
    const m = r.uri && r.uri.match(/^\/_e\/([a-z0-9_-]+)$/i);
    if (m && m[1] !== 'csp-report' && !isBot(r) && !isSelf(r.ip)) e.events[m[1]] = (e.events[m[1]] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(out).map(([d, e]) => [d, { opens: e.opens, distinct: e.ips.size, events: e.events }]));
}

/**
 * @param {string[]} dayList 集計する日本時間の日付（YYYY-MM-DD）。連続していなくてもよい
 * @param {{sameTimeAt?: number}} opts sameTimeAt = 日本時間の 0 時からの経過分。指定すると同時刻までの集計も返す
 */
export function analyze(dayList, registeredUsers, opts = {}) {
  const days = dayList.length;
  const wanted = new Set(dayList);
  const files = existsSync(CACHE_DIR) ? readdirSync(CACHE_DIR).filter((f) => f.endsWith('.gz')) : [];
  const texts = function* () {
    for (const f of files) {
      try { yield gunzipSync(readFileSync(join(CACHE_DIR, f))).toString('utf8'); } catch { /* 壊れたファイルは飛ばす */ }
    }
  };
  const { rows, selfIps } = parseLogs(texts(), wanted);
  const { isBot, isSelf, isBurst, isNonGet, opens, humanOpens, botOpens, selfOpens } = classify(rows, selfIps);

  const dates = rows.map((r) => r.date).filter(Boolean).sort();
  const humanIps = new Set(humanOpens.map((r) => r.ip));

  // 除外の理由別内訳。「人間0」のときに何で弾かれたのかを追えるようにする
  // （合算して「ボット」とだけ出していると、原因にたどり着けない）。
  // 判定順は上の分類と揃える。最初に該当した理由に1件だけ数える。
  const excludeReason = (r) => {
    const ua = dec(r.ua);
    if (isNonGet(r)) return 'GET以外（監視のHEAD・POSTなど）';
    if (BOT.test(ua)) return 'UAがボット';
    if (SUSPICIOUS_QUERY.test(dec(r.q))) return '不審なクエリ';
    if (isBurst(r)) return '同一秒に3回以上';
    if (isOutdatedUa(ua)) return '古すぎるUA';
    if (isSelf(r.ip)) return '自分IP';
    return null;
  };
  const exCnt = {}, exUa = {};
  for (const r of opens) {
    const w = excludeReason(r);
    if (!w) continue;
    exCnt[w] = (exCnt[w] || 0) + 1;
    // 理由ごとの代表UA（何を弾いているか分かるように）
    if (!exUa[w]) exUa[w] = dec(r.ua).slice(0, 80);
  }
  const excluded = Object.entries(exCnt).sort((a, b) => b[1] - a[1])
    .map(([reason, count]) => ({ reason, count, ua: exUa[reason] }));

  // 日別オープン
  const byDayMap = {};
  for (const r of opens) {
    const d = (byDayMap[r.date] ||= { human: 0, bot: 0, self: 0, ips: new Set() });
    if (isBot(r)) d.bot++; else if (isSelf(r.ip)) d.self++; else { d.human++; d.ips.add(r.ip); }
  }
  // 日別の実端末数。IPは日をまたぐ名寄せには使えない（IPv6が入れ替わる）が、
  // 1日のうちなら概ね端末数に対応する。DAUの近似としてここで出す。
  // 同一日・同一UAで別IPになる組が2割ほどあるため、真値よりやや大きく出る。
  const byDay = Object.entries(byDayMap).sort()
    .map(([date, c]) => ({ date, human: c.human, bot: c.bot, self: c.self, distinct: c.ips.size }));

  // 媒体別(utm_source)。タグなし＝Xとは限らない（アプリ内ブラウザ等でリファラ/UTMが落ちるSNS全般が該当しうる）
  const srcOf = (r) => {
    const m = dec(r.q).match(/utm_source=([a-z0-9_]+)/i);
    return m ? m[1].toLowerCase() : '(utm無し・媒体不明)';
  };
  const bySrcCnt = {}, bySrcIps = {};
  for (const r of humanOpens) {
    const s = srcOf(r);
    bySrcCnt[s] = (bySrcCnt[s] || 0) + 1;
    (bySrcIps[s] ||= new Set()).add(r.ip);
  }
  const bySrc = Object.entries(bySrcCnt).sort((a, b) => b[1] - a[1])
    .map(([src, count]) => ({ src, count, distinct: bySrcIps[src].size }));

  // 記事別のアプリ流入（utm_content）。LPのCTAに付けたページ名が入る。
  // これが「記事→アプリのクリック数」で、GA4の記事別PVと突き合わせるとCTRが出る。
  // slug にはハイフンが入るため [a-z0-9_-] で拾う。
  const byArticleCnt = {}, byArticleIps = {};
  for (const r of humanOpens) {
    const m = dec(r.q).match(/utm_content=([a-z0-9_-]+)/i);
    if (!m) continue;
    const a = m[1].toLowerCase();
    byArticleCnt[a] = (byArticleCnt[a] || 0) + 1;
    (byArticleIps[a] ||= new Set()).add(r.ip);
  }
  const byArticle = Object.entries(byArticleCnt).sort((a, b) => b[1] - a[1])
    .map(([slug, count]) => ({ slug, count, distinct: byArticleIps[slug].size }));

  // デバイス別。モバイル最適化（FAB・ボトムシート）の効果を見るために分ける。
  const isMobile = (ua) => /iphone|ipod|android.*mobile|windows phone/i.test(ua);
  const isTablet = (ua) => /ipad|android(?!.*mobile)|tablet/i.test(ua);
  const devCnt = { モバイル: 0, タブレット: 0, PC: 0 };
  const devIps = { モバイル: new Set(), タブレット: new Set(), PC: new Set() };
  for (const r of humanOpens) {
    const ua = dec(r.ua);
    const k = isMobile(ua) ? 'モバイル' : isTablet(ua) ? 'タブレット' : 'PC';
    devCnt[k]++; devIps[k].add(r.ip);
  }
  const byDevice = Object.entries(devCnt).map(([name, count]) => ({ name, count, distinct: devIps[name].size }));

  // プラットフォーム別。ネイティブアプリを作るかの判断に、iOS と Android の比率が要る。
  // UA削減でOSのバージョンは丸められるため、細かい版の分布は取れない（種別までが限界）。
  const platform = (ua) => {
    if (/iphone|ipod/i.test(ua)) return 'iPhone';
    if (/ipad/i.test(ua)) return 'iPad';
    if (/android/i.test(ua)) return /mobile/i.test(ua) ? 'Android スマホ' : 'Android タブレット';
    if (/macintosh|mac os x/i.test(ua)) return 'Mac';
    if (/windows/i.test(ua)) return 'Windows';
    if (/linux|cros/i.test(ua)) return 'Linux / ChromeOS';
    return '判定不能'; // アプリ内ブラウザやUAを削る設定。実態のモバイル比率はこの分だけ高い可能性がある
  };
  const pfCnt = {}, pfIps = {};
  for (const r of humanOpens) {
    const k = platform(dec(r.ua));
    pfCnt[k] = (pfCnt[k] || 0) + 1;
    (pfIps[k] ||= new Set()).add(r.ip);
  }
  const byPlatform = Object.entries(pfCnt).sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count, distinct: pfIps[name].size }));

  // 参照元 上位
  const refCnt = {};
  for (const r of humanOpens) { const k = r.ref && r.ref !== '-' ? r.ref : '(直接/なし)'; refCnt[k] = (refCnt[k] || 0) + 1; }
  const refs = Object.entries(refCnt).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([ref, count]) => ({ ref, count }));

  // ボットUA 上位
  const botCnt = {};
  for (const r of botOpens) botCnt[r.ua] = (botCnt[r.ua] || 0) + 1;
  const botUa = Object.entries(botCnt).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([ua, count]) => ({ ua, count }));

  // 自前イベント計測(/_e/*、bot/self除外)
  const { total: evTotal, byDay: evByDayMap, cspReports } = countEvents(rows, isBot, isSelf);
  const gs = evTotal['guest_start'] || 0, ja = evTotal['journal_added'] || 0;
  const n = (k) => evTotal[k] || 0;
  const { funnel, entry, retention } = funnelOf(evTotal);

  const events = {
    total: Object.entries(evTotal).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })),
    activation: gs ? Number((ja / gs).toFixed(2)) : null,
    byDay: Object.entries(evByDayMap).sort().map(([date, m]) => ({ date, counts: m })),
    funnel, entry, retention,
    appOpen: n('app_open'), guestReturn: n('guest_return'),
    cspReports,
  };

  return {
    generatedAt: new Date().toISOString(),
    // from/to は実際にデータがある範囲、requested は頼まれた範囲（データが無い日があっても変わらない）
    period: { from: dates[0] || null, to: dates[dates.length - 1] || null, days, requested: [dayList.slice().sort()[0], dayList.slice().sort()[days - 1]] },
    journeys: buildJourneys(rows, isBot, isSelf),
    registeredUsers,
    fileCount: files.length,
    totalRows: rows.length,
    selfIps: [...selfIps],
    opens: {
      total: opens.length, bot: botOpens.length, self: selfOpens.length,
      human: humanOpens.length, humanDistinct: humanIps.size,
    },
    byDay, bySrc, byArticle, byDevice, byPlatform, excluded, refs, botUa, events,
    byHour: hourlyOf(humanOpens),
    appStages: appStagesOf(rows, isBot, isSelf),
    sameTime: opts.sameTimeAt == null ? null : sameTimeOf(rows, new Set(humanOpens), isBot, isSelf, opts.sameTimeAt),
  };
}
