// ローカル管理者ダッシュボード（localhost限定）。
// CloudFront(app)のアクセスログをS3から取得し、いつもログで確認している数字だけを画面表示する。
// アドバイス・解釈はしない（数字のみ）。解釈はLLM側で行う方針。
//
// 使い方:  aws sso login --profile kakeibo-prod  (未ログイン時)
//          node scripts/admin/server.mjs
//          → http://localhost:8787 を開く
//
// 依存パッケージなし（Node標準 + aws cli のみ）。ログ解析ロジックは docs/design-gen/analyze-cflogs.mjs と同一。

import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 8787;
const PROFILE = process.env.AWS_PROFILE || 'kakeibo-prod';
const LOG_BUCKET = 'kakeibo-cf-logs-117953360790';
const LOG_PREFIX = 'app/'; // app.kurofukubo.com のCloudFrontログ
const USER_POOL_ID = 'ap-northeast-1_ddBDF3HKK'; // kakeibo-users-prod
const TABLE = 'kakeibo-prod'; // DynamoDB（ご意見は固定PK 'FEEDBACK' 配下）
// 未確認サインアップの掃除ジョブ。設定ではなく実行ログを見て「本当に動いたか」を確認する
const CLEANUP_LOG_GROUP = '/aws/lambda/kakeibo-saas-prod-CleanupUnconfirmedFunction-GvWvO3WXvqhh';
const API_LOG_GROUP = '/aws/apigateway/kakeibo-saas-prod'; // API Gatewayのアクセスログ（保持90日）
const CACHE_DIR = join(__dirname, '.cache-cflogs');
const PF_CACHE_DIR = join(__dirname, '.cache-platforms'); // 端末別集計の日別キャッシュ

// 判定ルール（ボット・自分IP・ファネル・状態の基準）は Discord 定時レポートと共有している。
// 自分IPプレフィックス SELF_PREFIXES もそちらにある。
import {
  BOT, SUSPICIOUS_QUERY, dec, isOutdatedUa, jstDayOfIso, lastDays, parseLogs, classify, countEvents, funnelOf,
  summarizeUsers, isWaitingInquiry, judgeChecks, judgeCsp, judgeSignals, signalsOf, signalQueries, cspStateOf,
} from './report/src/metrics.mjs';

// S3から直近days日ぶんのログを増分同期（ファイル名: app/<distId>.YYYY-MM-DD-HH.hash.gz）
// ファイル名はUTC日なので、JSTの当日ぶんを取りこぼさないよう前後1日を余分に取る。
function syncLogs(days) {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
  const includes = [];
  const span = new Set(lastDays(days + 1));
  span.add(new Date(Date.now() + 86400000).toISOString().slice(0, 10)); // JST当日の残り＝UTC翌日
  for (const d of span) { includes.push('--include', `*.${d}-*.gz`); }
  const args = [
    's3', 'sync', `s3://${LOG_BUCKET}/${LOG_PREFIX}`, CACHE_DIR,
    '--exclude', '*', ...includes, '--profile', PROFILE,
  ];
  const r = spawnSync('aws', args, { encoding: 'utf8' });
  if (r.status !== 0) {
    const err = (r.stderr || r.error?.message || '').trim();
    const needLogin = /token|expired|sso|credential|Unable to locate/i.test(err);
    throw new Error(needLogin
      ? `AWS認証が切れています。ターミナルで実行してください:\n  aws sso login --profile ${PROFILE}`
      : `aws s3 sync 失敗:\n${err.slice(0, 500)}`);
  }
}

// 登録ユーザー数（Cognito）。状態別に数えたいので list-users を使う（実数なのでラグが無い）。
// --attributes-to-get sub でメール等の属性はCognito側で除外される＝PIIは受け取らない。
// UserStatus は属性ではなく上位フィールドなので、この指定でも取得できる。
// UNCONFIRMED＝メール登録で確認コードを通していない人。利用に至っていないため本数から除く。
function getRegisteredUsers(days) {
  let users;
  try {
    users = awsJson([
      'cognito-idp', 'list-users', '--user-pool-id', USER_POOL_ID,
      '--attributes-to-get', 'sub', '--query', 'Users[].[UserStatus,UserCreateDate,Username]',
    ], '登録ユーザー数の取得');
  } catch { return null; } // 認証切れ等でも他の数字は出す
  if (!Array.isArray(users)) return null;
  return summarizeUsers(users, days ? Date.now() - days * 86400000 : null);
}

// ── 「状態」タブ ──────────────────────────────────────────────
// この製品は静かに壊れる事故を繰り返している（確認メールが7日間1通も出ていない、
// プリセットのタグが記帳に載らない、削除が保存されない、CSPが記録のみで強制されていない）。
// いずれも画面上は正常に見えるため、指標を眺めるだけでは気づけない。
// そこで「常に真であるべきこと」を明示的に検証する。1つでも赤ければ即調べる。

const iso = (d) => new Date(d).toISOString().slice(0, 19);

/** 監視の4指標（遅延・流量・エラー・飽和）を CloudWatch から1回で取る */
/**
 * どの端末から使われているかを、API Gatewayのアクセスログから出す。
 *
 * なぜAPIログか: モバイルアプリには計測を入れていないが、APIは叩いている。
 * ログには sub が載るので、アプリ更新なしで「誰が・いつ・何回」が分かる。
 *
 * ⚠ ua はログ書式に後から足した項目。追加より前の行には無く unknown に落ちる。
 *    「iOSが0件」と「まだ記録していない」を混同しないこと。
 * ⚠ iOS Safari の UA は Mozilla 始まりなので web。アプリ(CFNetwork/Darwin)と別物。
 */
const platformOf = (ua) => {
  if (!ua) return 'unknown';
  if (/CFNetwork|Darwin/i.test(ua)) return 'ios';
  if (/okhttp|Android/i.test(ua)) return 'android';
  if (/^Mozilla\//i.test(ua)) return 'web';
  return 'other';
};

// ⚠ E2E暗号化を使っている人の書き込みは /api/journals を通らず /api/encdata に入る。
//    片方だけ数えると暗号化利用者の記帳が丸ごと抜ける。
const isWriteReq = (m, path) => (m === 'POST' || m === 'PUT')
  && (/^\/api\/journals/.test(path) || /^\/api\/encdata/.test(path));

const medianOf = (a) => {
  if (!a.length) return 0;
  const t = [...a].sort((x, y) => x - y), m = t.length >> 1;
  return t.length % 2 ? t[m] : (t[m - 1] + t[m]) / 2;
};

// APIアクセスログは CloudWatch Logs Insights で取る。
// 以前は filter-log-events をページごとに aws CLI を起動し直して読んでいたが、ログ全体が1MBでも
// 45〜91ページに分かれ、14日で54秒・30日で121秒かかっていた（1ページあたり CLI起動0.6秒＋API）。
// Insights はサーバー側で絞り込むので、同じ期間が2.5〜4.4秒で返る。
const INSIGHTS_LIMIT = 10000;

// Insights の @timestamp は "YYYY-MM-DD hh:mm:ss.SSS"(UTC)。そのまま Date.parse すると
// ローカル時刻と解釈されてJSTが二重に足されるため、明示的にUTCとして読む。
const insightsMs = (s) => Date.parse(String(s).replace(' ', 'T') + 'Z');
const jstDayStartMs = (day) => Date.parse(`${day}T00:00:00+09:00`);

/** 指定区間の認証済みリクエストを取る。取得上限に達したら区間を半分に割って取り直す */
function queryApiLogs(startMs, endMs) {
  const q = 'fields @timestamp, sub, ua, method, path'
    + ' | filter ispresent(sub) and sub != "-" and method != "OPTIONS"'
    + ` | limit ${INSIGHTS_LIMIT}`;
  const started = awsJson(['logs', 'start-query', '--log-group-name', API_LOG_GROUP,
    '--start-time', String(Math.floor(startMs / 1000)), '--end-time', String(Math.floor(endMs / 1000)),
    '--query-string', q, '--limit', String(INSIGHTS_LIMIT)], 'APIアクセスログの取得');
  let r;
  for (let i = 0; ; i++) {
    r = awsJson(['logs', 'get-query-results', '--query-id', started.queryId], 'APIアクセスログの取得');
    if (r.status !== 'Running' && r.status !== 'Scheduled') break;
    if (i > 60) throw new Error('APIアクセスログの取得が終わりません'); // 1回0.6秒程度なので実質40秒で打ち切り
  }
  if (r.status !== 'Complete') throw new Error(`APIアクセスログの取得に失敗しました（${r.status}）`);
  // 値が無い項目は行ごと欠ける（ua は書式に追加する前の行に存在しない）
  const rows = (r.results || []).map((fields) => Object.fromEntries(fields.map((f) => [f.field, f.value])));
  if (rows.length >= INSIGHTS_LIMIT && endMs - startMs > 3600000) {
    const mid = startMs + Math.floor((endMs - startMs) / 2);
    return [...queryApiLogs(startMs, mid), ...queryApiLogs(mid, endMs)];
  }
  return rows;
}

// 過ぎたJST日ぶんの集計は変わらないので、日ごとに {sub: {端末: [リクエスト, 記帳]}} を保存して取り直さない。
// 当日は確定しないため毎回問い合わせる。sub はこのファイルにも入るが、元のログにあるもの以上は持たない。
const pfCachePath = (day) => join(PF_CACHE_DIR, `${day}.json`);
const readPfCache = (day) => {
  try { return JSON.parse(readFileSync(pfCachePath(day), 'utf8')); } catch { return null; }
};

function getPlatforms(days) {
  const wanted = lastDays(days).sort(); // 古い順のJST日。期間の区切りは画面の他の数字と揃える
  const today = lastDays(1)[0];
  const perDay = {};
  const missing = [];
  for (const d of wanted) {
    const c = d === today ? null : readPfCache(d); // 当日は確定しないので毎回取り直す
    if (c) perDay[d] = c; else missing.push(d);
  }

  if (missing.length) {
    let rows;
    try { rows = queryApiLogs(jstDayStartMs(missing[0]), Date.now()); } catch { return null; }
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
    for (const d of span) { if (d !== today) writeFileSync(pfCachePath(d), JSON.stringify(perDay[d])); }
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

  const out = Object.entries(byPf).map(([platform, e]) => {
    const counts = [...e.days.values()].map((x) => x.size);
    return {
      platform,
      requests: e.requests,
      writes: e.writes,
      users: e.users.size,
      // 2日以上使った人数。母数が小さいので率ではなく実数で出す。
      returned: counts.filter((n) => n >= 2).length,
      medianDays: medianOf(counts),
    };
  });
  return out.sort((a, b) => b.users - a.users || b.requests - a.requests);
}

function getSignals() {
  let r;
  try {
    r = awsJson(['cloudwatch', 'get-metric-data', '--region', 'ap-northeast-1',
      '--start-time', iso(Date.now() - 86400000), '--end-time', iso(Date.now()),
      '--metric-data-queries', JSON.stringify(signalQueries('kakeibo-saas-prod', TABLE)),
    ], '監視指標の取得');
  } catch { return null; }
  const v = {};
  for (const m of r.MetricDataResults || []) v[m.Id] = m.Values?.[0] ?? 0;
  return signalsOf(v);
}

// 当月のAWS費用の表示は撤去した。Cost Explorer API は1リクエスト $0.01 の従量課金で、
// この画面を開くだけで請求の最大費目になっていた（2026-08は21回で$0.21）。費用は
// Billing コンソール（無料）か Budgets のアラートで見る。

/** 前提チェック。ok / warn / bad と、判断に使った実測値を返す（判定の基準は metrics.mjs の judgeChecks） */
function getChecks() {
  let pool = null; let ses = null;
  try {
    pool = awsJson(['cognito-idp', 'describe-user-pool', '--user-pool-id', USER_POOL_ID,
      '--query', 'UserPool.EmailConfiguration'], 'メール設定の取得');
  } catch { /* 認証切れ等 */ }
  try {
    ses = awsJson(['sesv2', 'get-account', '--region', 'ap-northeast-1',
      '--query', '{prod:ProductionAccessEnabled}'], 'SES状態の取得');
  } catch { /* noop */ }

  let unconfirmedCreated = null;
  try {
    unconfirmedCreated = awsJson(['cognito-idp', 'list-users', '--user-pool-id', USER_POOL_ID,
      '--query', 'Users[?UserStatus==`UNCONFIRMED`].UserCreateDate'], '未確認ユーザーの取得') || [];
  } catch { /* 取得できず */ }

  let cleanupLastTs; // undefined = 取得できず / null = 直近3日で実行なし
  try {
    cleanupLastTs = awsJson(['logs', 'filter-log-events',
      '--log-group-name', CLEANUP_LOG_GROUP, '--filter-pattern', 'CLEANUP_UNCONFIRMED',
      '--start-time', String(Date.now() - 3 * 86400000), '--region', 'ap-northeast-1',
      '--query', 'events[-1].timestamp'], '掃除ジョブの確認') || null;
  } catch { /* 取得できず */ }

  return judgeChecks({ pool, sesProduction: ses?.prod ?? null, unconfirmedCreated, cleanupLastTs }, Date.now());
}

/** 本番が実際に返しているヘッダーを見る。設定ではなく配信結果を確認する */
async function getLiveHeaders() {
  try {
    const r = await fetch('https://app.kurofukubo.com/', { method: 'HEAD' });
    const csp = r.headers.get('content-security-policy');
    const ro = r.headers.get('content-security-policy-report-only');
    return {
      csp: cspStateOf(csp, ro),
      hsts: !!r.headers.get('strict-transport-security'),
      bundle: null,
    };
  } catch { return null; }
}

// aws cli 実行の共通ラッパ。日本語が届くため UTF-8 を強制する（Windows既定の cp932 だと落ちる）。
function awsJson(args, what) {
  const r = spawnSync('aws', [...args, '--output', 'json', '--profile', PROFILE, '--region', 'ap-northeast-1'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
  });
  if (r.status !== 0) {
    const err = (r.stderr || r.error?.message || '').trim();
    const needLogin = /token|expired|sso|credential|Unable to locate/i.test(err);
    throw new Error(needLogin
      ? `AWS認証が切れています。ターミナルで実行してください:\n  aws sso login --profile ${PROFILE}`
      : `${what}に失敗しました:\n${err.slice(0, 500)}`);
  }
  return JSON.parse(r.stdout || '{}');
}

// ログイン済みユーザーからの問い合わせスレッド。USER#<sub> 配下に散っているので scan で拾う。
// ここは件数だけでなく本文も扱う（サポート窓口なので中身を読まないと返信できない）。
// 表示するのは sub の先頭8桁のみで、メールアドレスは取得しない。
function getInquiries() {
  const out = [];
  let start = null;
  do {
    const args = ['dynamodb', 'scan', '--table-name', TABLE,
      '--filter-expression', 'begins_with(SK, :p)',
      '--expression-attribute-values', '{":p":{"S":"INQUIRY#"}}'];
    if (start) args.push('--exclusive-start-key', JSON.stringify(start));
    const page = awsJson(args, '問い合わせの取得');
    for (const i of page.Items || []) {
      out.push({
        pk: i.PK?.S || '', sk: i.SK?.S || '',
        sub: (i.PK?.S || '').replace('USER#', '').slice(0, 8),
        id: i.id?.S || '', subject: i.subject?.S || '',
        status: i.status?.S || 'open',
        createdAt: i.createdAt?.S || '', updatedAt: i.updatedAt?.S || '',
        messages: (i.messages?.L || []).map((m) => ({
          from: m.M?.from?.S || 'user', body: m.M?.body?.S || '', at: m.M?.at?.S || '',
        })),
      });
    }
    start = page.LastEvaluatedKey || null;
  } while (start);

  out.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  // 最後がユーザー発言＝こちらの返信待ち
  const waiting = out.filter((t) => isWaitingInquiry({ status: t.status, lastFrom: t.messages.at(-1)?.from })).length;
  return { total: out.length, waiting, items: out, generatedAt: new Date().toISOString().replace('T', ' ').slice(0, 19) };
}

// 運営からの返信を追記する。update-item で messages にだけ足し、他の属性は触らない。
function replyInquiry(pk, sk, body, close) {
  const msg = { M: { from: { S: 'staff' }, body: { S: body }, at: { S: new Date().toISOString() } } };
  const values = {
    ':m': { L: [msg] },
    ':empty': { L: [] },
    ':u': { S: new Date().toISOString() },
    ':s': { S: close ? 'closed' : 'open' },
  };
  awsJson(['dynamodb', 'update-item', '--table-name', TABLE,
    '--key', JSON.stringify({ PK: { S: pk }, SK: { S: sk } }),
    '--condition-expression', 'attribute_exists(SK)',
    '--update-expression', 'SET messages = list_append(if_not_exists(messages, :empty), :m), updatedAt = :u, #st = :s',
    '--expression-attribute-names', '{"#st":"status"}',
    '--expression-attribute-values', JSON.stringify(values),
  ], '返信の保存');
  return { ok: true };
}

// アプリ内アンケートで送られたご意見。固定PK 'FEEDBACK' 配下を新しい順に取得する。
// 匿名で保存されているため、誰が送ったかは分からない（userIdは常に 'guest'）。
function getFeedback() {
  const r = spawnSync('aws', [
    'dynamodb', 'query',
    '--table-name', TABLE,
    '--key-condition-expression', 'PK = :pk',
    '--expression-attribute-values', '{":pk":{"S":"FEEDBACK"}}',
    '--no-scan-index-forward', // SKが FEEDBACK#<ISO日時>#<uuid> なので降順＝新しい順
    '--output', 'json', '--profile', PROFILE, '--region', 'ap-northeast-1',
  ], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    // ご意見は日本語で届く。aws cli(Python) の既定出力は Windows だと cp932 になり、
    // 日本語や絵文字を出力できずエラー終了するため UTF-8 を強制する。
    env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
  });
  if (r.status !== 0) {
    const err = (r.stderr || r.error?.message || '').trim();
    const needLogin = /token|expired|sso|credential|Unable to locate/i.test(err);
    throw new Error(needLogin
      ? `AWS認証が切れています。ターミナルで実行してください:\n  aws sso login --profile ${PROFILE}`
      : `ご意見の取得に失敗しました:\n${err.slice(0, 500)}`);
  }
  const items = (JSON.parse(r.stdout || '{}').Items || []).map((i) => ({
    timestamp: i.timestamp?.S || '',
    body: i.body?.S || '',
  }));
  // 月別の件数（どの回のアンケートで多く集まったかを見る）
  const byMonth = {};
  for (const it of items) {
    const m = (it.timestamp || '').slice(0, 7);
    if (m) byMonth[m] = (byMonth[m] || 0) + 1;
  }
  return {
    total: items.length,
    byMonth: Object.entries(byMonth).map(([month, count]) => ({ month, count })).sort((a, b) => b.month.localeCompare(a.month)),
    items,
    generatedAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
  };
}

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

function analyze(days) {
  const wanted = new Set(lastDays(days));
  const files = existsSync(CACHE_DIR) ? readdirSync(CACHE_DIR).filter((f) => f.endsWith('.gz')) : [];
  const texts = function* () {
    for (const f of files) {
      try { yield gunzipSync(readFileSync(join(CACHE_DIR, f))).toString('utf8'); } catch { /* 壊れたファイルは飛ばす */ }
    }
  };
  const { rows, selfIps } = parseLogs(texts(), wanted);
  const { isBot, isSelf, isBurst, opens, humanOpens, botOpens, selfOpens } = classify(rows, selfIps);

  const dates = rows.map((r) => r.date).filter(Boolean).sort();
  const humanIps = new Set(humanOpens.map((r) => r.ip));

  // 除外の理由別内訳。「人間0」のときに何で弾かれたのかを追えるようにする
  // （合算して「ボット」とだけ出していると、原因にたどり着けない）。
  // 判定順は上の分類と揃える。最初に該当した理由に1件だけ数える。
  const excludeReason = (r) => {
    const ua = dec(r.ua);
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
  const { total: evTotal, byDay: evByDayMap } = countEvents(rows, isBot, isSelf);
  const gs = evTotal['guest_start'] || 0, ja = evTotal['journal_added'] || 0;
  const n = (k) => evTotal[k] || 0;
  const { funnel, entry, retention } = funnelOf(evTotal);

  const events = {
    total: Object.entries(evTotal).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })),
    activation: gs ? Number((ja / gs).toFixed(2)) : null,
    byDay: Object.entries(evByDayMap).sort().map(([date, m]) => ({ date, counts: m })),
    funnel, entry, retention,
    appOpen: n('app_open'), guestReturn: n('guest_return'),
  };

  return {
    generatedAt: new Date().toISOString(),
    period: { from: dates[0] || null, to: dates[dates.length - 1] || null, days },
    journeys: buildJourneys(rows, isBot, isSelf),
    registeredUsers: getRegisteredUsers(days),
    fileCount: files.length,
    totalRows: rows.length,
    selfIps: [...selfIps],
    opens: {
      total: opens.length, bot: botOpens.length, self: selfOpens.length,
      human: humanOpens.length, humanDistinct: humanIps.size,
    },
    byDay, bySrc, byArticle, byDevice, byPlatform, excluded, refs, botUa, events,
  };
}

const HTML = /* html */ `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>kurofukubo 管理ダッシュボード</title>
<style>
  /* kurofukubo ライトテーマ配色（frontend/src/styles/variables.css と同一） */
  :root{--bg:#e8eaed;--bg1:#ffffff;--bg2:#ffffff;--bg3:#f8fafa;--bd:#e6ebec;--bd2:#d7dde0;--tx:#23262d;--tx2:#71767f;--tx3:#93a09e;--ac:#0d9488;--ac2:#0b7d72;--acb:rgba(13,148,136,.10);--actx:#ffffff;--grn:#15a06a;--red:#e0556a;}
  *{box-sizing:border-box}
  body{margin:0;font-family:system-ui,"Segoe UI",sans-serif;background:var(--bg);color:var(--tx);font-size:14px;line-height:1.6;-webkit-text-size-adjust:100%}
  header{position:sticky;top:0;display:flex;align-items:center;flex-wrap:wrap;gap:10px 14px;padding:12px 20px;background:var(--bg1);border-bottom:1px solid var(--bd);z-index:5}
  header h1{font-size:15px;margin:0;font-weight:800;letter-spacing:-.01em}
  header .meta{font-size:12px;color:var(--tx3)}
  .grow{flex:1}
  select,button{font-family:inherit;font-size:13px;background:var(--bg);color:var(--tx);border:1px solid var(--bd);border-radius:8px;padding:7px 12px;cursor:pointer}
  button.primary{background:var(--ac);color:var(--actx);border-color:var(--ac);font-weight:700}
  button.primary:hover{background:var(--ac2);border-color:var(--ac2)}
  button:disabled{opacity:.5;cursor:default}
  main{padding:20px 20px 60px;max-width:1180px;margin:0 auto}

  /* ── 見出し階層 ── */
  .band{display:flex;align-items:baseline;gap:10px;margin:30px 2px 12px}
  .band:first-child{margin-top:4px}
  .band h2{font-size:12px;margin:0;color:var(--tx2);font-weight:800;letter-spacing:.12em}
  .band .hint{font-size:11px;color:var(--tx3)}
  section{background:var(--bg2);border:1px solid var(--bd);border-radius:14px;padding:16px 18px;margin-bottom:14px;box-shadow:0 1px 2px rgba(20,24,40,.04),0 14px 30px -20px rgba(20,24,40,.20)}
  section h3{font-size:12px;margin:0 0 12px;color:var(--tx2);font-weight:700;letter-spacing:.04em;display:flex;align-items:baseline;gap:8px}
  section h3 small{font-weight:500;color:var(--tx3);letter-spacing:0}

  /* ── 主要KPI ── */
  .lead{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:14px}
  .lead .kpi{background:var(--bg2);border:1px solid var(--bd);border-radius:14px;padding:16px 18px;box-shadow:0 1px 2px rgba(20,24,40,.04),0 14px 30px -20px rgba(20,24,40,.20)}
  .lead .kpi .l{font-size:12px;color:var(--tx2);font-weight:700}
  .lead .kpi .n{font-size:40px;font-weight:800;letter-spacing:-.03em;line-height:1.15;margin-top:2px;font-variant-numeric:tabular-nums}
  .lead .kpi .n u{font-size:15px;font-weight:700;text-decoration:none;color:var(--tx2);margin-left:3px}
  .lead .kpi .s{font-size:11px;color:var(--tx3);margin-top:2px}
  .lead .kpi.acc{border-color:var(--ac);box-shadow:0 1px 2px rgba(13,148,136,.10),0 14px 30px -20px rgba(13,148,136,.5)}
  .lead .kpi.acc .n{color:var(--ac)}

  /* 副次（小さく端に） */
  .sub{display:flex;flex-wrap:wrap;gap:8px 22px;align-items:baseline;padding:9px 16px;border:1px dashed var(--bd2);border-radius:10px;background:var(--bg3);margin-bottom:6px}
  .sub .t{font-size:11px;color:var(--tx3);letter-spacing:.06em;font-weight:700}
  .sub .i{font-size:12px;color:var(--tx2)}
  .sub .i b{font-variant-numeric:tabular-nums;font-size:13px;color:var(--tx)}

  /* ── 2カラム ── */
  .cols{display:grid;grid-template-columns:1.35fr 1fr;gap:14px;align-items:start}
  /* ── 状態タブ ── */
  .verdict{display:flex;align-items:baseline;gap:12px;border-radius:10px;padding:13px 17px;margin-bottom:14px;border:1px solid}
  .verdict b{font-size:17px;font-weight:800}
  .verdict span{font-size:12.5px;color:var(--tx2)}
  .v-ok{background:rgba(21,160,106,.08);border-color:var(--grn)}   .v-ok b{color:var(--grn)}
  .v-warn{background:rgba(224,160,32,.10);border-color:#c98a12}    .v-warn b{color:#c98a12}
  .v-bad{background:rgba(224,85,106,.08);border-color:var(--red)}  .v-bad b{color:var(--red)}
  .chk{display:grid;grid-template-columns:18px 1fr auto;gap:10px;align-items:baseline;
    padding:7px 0;border-bottom:1px solid var(--bd);font-size:13px}
  .chk:last-child{border-bottom:0}
  .chk-v{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:11.5px;color:var(--tx2);white-space:nowrap}
  .chk-note{font-size:11px;color:var(--tx3);line-height:1.6}
  .st-ok{color:var(--grn)} .st-warn{color:#c98a12} .st-bad{color:var(--red)}
  /* ── 深掘り：訪問者の行動 ── */
  .drop-row{display:grid;grid-template-columns:52px 1fr auto;gap:9px;align-items:center;
    padding:5px 7px;border-radius:6px;cursor:pointer;font-size:12.5px;transition:.12s}
  .drop-row:hover{background:var(--bg3)}
  .drop-row.on{background:var(--acb);outline:1px solid var(--ac)}
  .drop-n{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:11.5px;color:var(--tx2);text-align:right}
  .drop-bar{height:14px;background:var(--bg3);border-radius:3px;overflow:hidden}
  .drop-bar i{display:block;height:100%;background:var(--ac);border-radius:3px}
  .drop-e{color:var(--tx2);white-space:nowrap}
  .btn-clear{font:inherit;font-size:11.5px;border:1px solid var(--bd2);background:var(--bg1);
    color:var(--tx2);border-radius:6px;padding:4px 11px;cursor:pointer}
  .btn-clear:hover{border-color:var(--ac);color:var(--ac)}
  .jrow{padding:8px 0;border-bottom:1px solid var(--bd)}
  .jrow:last-child{border-bottom:0}
  .jmeta{display:flex;gap:9px;flex-wrap:wrap;align-items:center;font-size:11px;color:var(--tx3);margin-bottom:4px}
  .jmeta .jref{color:var(--tx2)}
  .jb{font-size:9.5px;font-weight:700;border-radius:3px;padding:1px 6px}
  .jb-reg{background:rgba(13,148,136,.14);color:var(--ac)}
  .jb-w{background:rgba(21,160,106,.14);color:var(--grn)}
  .jseq{display:flex;flex-wrap:wrap;gap:3px;align-items:center;font-size:11px;line-height:1.9}
  .jseq i{color:var(--tx3);font-style:normal}
  .jev{background:var(--bg3);border:1px solid var(--bd);border-radius:4px;padding:1px 6px;color:var(--tx2);white-space:nowrap}
  .cols3{display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:start}

  /* ── ファネル ── */
  .fn{display:grid;gap:9px}
  .fn-r{display:grid;grid-template-columns:132px minmax(120px,1fr) 74px 58px 96px;align-items:center;gap:10px}
  .fn-l{font-size:13px;color:var(--tx);font-weight:600}
  .fn-b{background:var(--bg);border-radius:6px;height:26px;overflow:hidden}
  .fn-b span{display:block;height:100%;background:var(--ac);border-radius:6px}
  .fn-n,.fn-p{text-align:right;font-variant-numeric:tabular-nums;font-size:13px}
  .fn-n{font-weight:800}
  .fn-n u{text-decoration:none;font-weight:600;font-size:11px;color:var(--tx3);margin-left:2px}
  .fn-p{color:var(--tx2);font-weight:700}
  .fn-hd{display:grid;grid-template-columns:132px minmax(120px,1fr) 74px 58px 96px;gap:10px;font-size:11px;color:var(--tx3);margin-bottom:2px}
  .fn-hd div:nth-child(3),.fn-hd div:nth-child(4),.fn-hd div:nth-child(5){text-align:right}
  .fn-s{text-align:right;font-variant-numeric:tabular-nums;font-size:13px;font-weight:700;color:var(--tx2)}
  .fn-s u{display:block;text-decoration:none;font-size:10px;font-weight:600;color:var(--red);margin-top:-3px}
  .fn-s.first{color:var(--tx3);font-weight:500}
  .headline{display:flex;align-items:baseline;gap:8px 16px;margin:14px 0 0;padding-top:12px;border-top:1px solid var(--bd);flex-wrap:wrap}
  .pair{display:inline-flex;align-items:baseline;gap:6px;white-space:nowrap}
  .headline .k{font-size:12px;color:var(--tx2)}
  .headline .v{font-size:26px;font-weight:800;color:var(--ac);font-variant-numeric:tabular-nums;letter-spacing:-.02em}
  .headline .f{font-size:11px;color:var(--tx3);font-variant-numeric:tabular-nums}

  /* ── 継続 ── */
  .ret{display:grid;gap:10px}
  .ret-r{display:grid;grid-template-columns:110px 1fr 76px;gap:10px;align-items:center}
  .ret-l{font-size:13px;color:var(--tx)}
  .ret-b{background:var(--bg);border-radius:6px;height:10px;overflow:hidden}
  .ret-b span{display:block;height:100%;background:var(--grn);border-radius:6px}
  .ret-v{text-align:right;font-variant-numeric:tabular-nums;font-size:13px;font-weight:700}
  .ret-v u{text-decoration:none;font-weight:500;color:var(--tx3);font-size:11px;margin-left:4px}

  /* ── 日別チャート ── */
  .chart{display:flex;align-items:flex-end;gap:3px}
  .col{flex:1 1 0;min-width:0;display:flex;flex-direction:column;align-items:center;gap:3px}
  .col .v{font-size:10px;color:var(--tx2);font-variant-numeric:tabular-nums;height:13px}
  .col .track{width:100%;height:104px;display:flex;align-items:flex-end}
  .col .b{width:100%;background:var(--ac);border-radius:3px 3px 0 0;min-height:2px}
  .col .b.bot{background:var(--bd2);border-radius:2px 2px 0 0}
  .col .x{font-size:9px;color:var(--tx3);white-space:nowrap;font-variant-numeric:tabular-nums}
  .chart.mini .track{height:34px}
  .chart.rate .track{height:56px;position:relative}
  .chart.rate .b{background:var(--bd2);position:relative;display:flex;align-items:flex-end}
  .chart.rate .b i{display:block;width:100%;background:var(--ac);border-radius:3px 3px 0 0;min-height:2px}
  .chart.rate .v{color:var(--ac);font-weight:700}
  .chart.rate .v.zero{color:var(--tx3);font-weight:400}
  .chart.mini .v{font-size:9px;color:var(--tx3)}
  .peak{color:var(--red)!important;font-weight:700}
  .legend{display:flex;gap:14px;font-size:11px;color:var(--tx3);margin-top:10px;flex-wrap:wrap}
  .legend i{display:inline-block;width:9px;height:9px;border-radius:2px;background:var(--ac);margin-right:5px}
  .legend i.g{background:var(--bd2)}

  /* ── イベント一覧 ── */
  .grp{margin-bottom:14px}
  .grp:last-child{margin-bottom:0}
  .grp .gt{font-size:11px;font-weight:800;color:var(--ac);letter-spacing:.08em;padding-bottom:5px;border-bottom:1px solid var(--bd);margin-bottom:6px}
  .ev{display:grid;grid-template-columns:1fr auto 62px;gap:10px;align-items:baseline;padding:4px 0}
  .ev .n{font-size:13px}
  .ev .n code{font-size:11px;color:var(--tx3);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;margin-left:6px;word-break:break-all}
  .ev .u{font-size:10px;color:var(--tx3);border:1px solid var(--bd2);border-radius:999px;padding:0 6px;white-space:nowrap}
  .ev .c{text-align:right;font-variant-numeric:tabular-nums;font-weight:700;font-size:14px}
  .ev .c em{font-style:normal;font-size:10px;color:var(--tx3);font-weight:500;margin-left:2px}

  /* ── 日別の内訳（チップ） ── */
  .day{display:grid;grid-template-columns:64px 1fr;gap:10px;padding:8px 0;border-bottom:1px solid var(--bd)}
  .day:last-child{border-bottom:0}
  .day .d{font-size:12px;color:var(--tx2);font-variant-numeric:tabular-nums;white-space:nowrap}
  .chips{display:flex;flex-wrap:wrap;gap:5px}
  .chip{display:inline-flex;align-items:baseline;gap:5px;background:var(--bg3);border:1px solid var(--bd);border-radius:999px;padding:1px 9px;font-size:12px;color:var(--tx2);max-width:100%}
  .chip b{font-variant-numeric:tabular-nums;color:var(--tx)}
  .chip.k{background:var(--acb);border-color:rgba(13,148,136,.25);color:var(--ac2)}
  .chip.k b{color:var(--ac2)}
  details.tour{border:0;background:none;margin:0;display:inline-block}
  details.tour>summary{padding:1px 9px;border:1px dashed var(--bd2);border-radius:999px;background:transparent;font-size:12px;color:var(--tx3);font-weight:500;display:inline-flex;gap:5px;align-items:baseline}
  details.tour>summary::before{font-size:9px}
  details.tour>summary b{font-variant-numeric:tabular-nums;color:var(--tx2)}
  details.tour .chips{margin-top:5px}

  /* ── テーブル ── */
  table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
  th,td{text-align:left;padding:6px 10px;border-bottom:1px solid var(--bd);white-space:nowrap}
  tr:last-child td{border-bottom:0}
  th{color:var(--tx3);font-weight:600;font-size:11px;letter-spacing:.04em}
  td.num,th.num{text-align:right}
  .bar{display:inline-block;height:8px;background:var(--ac);border-radius:4px;vertical-align:middle;margin-right:6px}
  .muted{color:var(--tx3)}
  .err{background:rgba(224,85,106,.10);border:1px solid var(--red);color:#a3243a;padding:14px 16px;border-radius:12px;white-space:pre-wrap;font-size:13px}
  .wrap{overflow-x:auto}
  .ref{white-space:normal;word-break:break-all;color:var(--tx2);font-size:12px}
  .tabs{display:flex;gap:4px}
  .tabs button{border-radius:999px}
  .tabs button.on{background:var(--acb);border-color:var(--ac);color:var(--ac);font-weight:700}

  /* ── 折りたたみ ── */
  details{border:1px solid var(--bd);border-radius:12px;background:var(--bg2);margin-bottom:10px}
  details summary{cursor:pointer;list-style:none;padding:11px 16px;font-size:12px;color:var(--tx2);font-weight:700;display:flex;align-items:center;gap:8px}
  details summary::-webkit-details-marker{display:none}
  details summary::before{content:"▸";color:var(--tx3);font-size:10px}
  details[open] summary::before{content:"▾"}
  details summary span{font-weight:500;color:var(--tx3)}
  details .in{padding:0 16px 14px}
  .iplist{display:flex;flex-wrap:wrap;gap:4px 6px;font-size:11px;color:var(--tx2);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-all}
  .iplist span{background:var(--bg3);border:1px solid var(--bd);border-radius:6px;padding:1px 6px}
  .foot{font-size:11px;color:var(--tx3);margin:14px 2px 0;display:flex;flex-wrap:wrap;gap:4px 18px}

  /* ── ご意見 ── */
  .fb{border:1px solid var(--bd);border-left:3px solid var(--acb);border-radius:12px;background:var(--bg2);padding:14px 18px;margin-bottom:10px}
  .fb .when{font-size:11px;color:var(--tx3);margin-bottom:6px;font-variant-numeric:tabular-nums}
  .fb .body{white-space:pre-wrap;word-break:break-word;font-size:15px;line-height:1.95;max-width:64ch;text-wrap:pretty}
  .months{display:flex;flex-wrap:wrap;gap:8px}
  .month{border:1px solid var(--bd);border-radius:10px;padding:8px 14px;background:var(--bg3);font-size:12px;color:var(--tx2)}
  .month b{display:block;font-size:20px;font-weight:800;color:var(--tx);font-variant-numeric:tabular-nums;line-height:1.2}

  @media(max-width:1180px){
    .fn-r,.fn-hd{grid-template-columns:112px minmax(120px,1fr) 64px 88px}
    .fn-p,.fn-hd div:nth-child(4){display:none}
  }
  @media(max-width:900px){
    .cols,.cols3{grid-template-columns:1fr}
    .lead{grid-template-columns:1fr 1fr}
    .fn-r,.fn-hd{grid-template-columns:132px minmax(120px,1fr) 74px 58px 96px}
    .fn-p,.fn-hd div:nth-child(4){display:block}
  }
  @media(max-width:640px){
    main{padding:14px 12px 48px}
    header{padding:10px 12px}
    .lead{grid-template-columns:1fr;gap:10px}
    .lead .kpi{padding:12px 14px}
    .lead .kpi .n{font-size:32px}
    .fn-r,.fn-hd{grid-template-columns:84px minmax(60px,1fr) 52px 84px;gap:6px}
    .fn-p,.fn-hd div:nth-child(4){display:none}
    .fn-l{font-size:12px}
    .ret-r{grid-template-columns:92px 1fr 66px}
    .col .v{display:none}
    .col .x{font-size:8px}
    .day{grid-template-columns:1fr;gap:4px}
    .ev{grid-template-columns:1fr auto 52px}
    .ev .n code{display:none}
    section{padding:14px}
  }
</style></head><body>
<header>
  <h1>kurofukubo 管理ダッシュボード</h1>
  <span class="tabs">
    <button id="tab-status" class="on">状態</button>
    <button id="tab-access">成長</button>
    <button id="tab-deep">深掘り</button>
    <button id="tab-inquiry">問い合わせ</button>
    <button id="tab-feedback">ご意見</button>
  </span>
  <span class="meta" id="period">—</span>
  <span class="grow"></span>
  <label class="meta" id="period-picker">期間
    <select id="days">
      <option value="7">7日</option>
      <option value="14" selected>14日</option>
      <option value="30">30日</option>
      <option value="90">90日</option>
    </select>
  </label>
  <button class="primary" id="refresh">更新</button>
</header>
<main id="root"><p class="muted">読み込み中…</p></main>
<script>
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

// 主要KPI（大きく出す用）。unit は数字の後ろに付く小さい単位。
function lead(n, unit, l, s, accent){
  return '<div class="kpi'+(accent?' acc':'')+'"><div class="l">'+l+'</div>'
       + '<div class="n">'+n+(unit?'<u>'+unit+'</u>':'')+'</div>'
       + (s?'<div class="s">'+s+'</div>':'')+'</div>';
}

/* ── 自前イベント識別子の日本語化 ────────────────────────
   unit: '人' = ブラウザごとに1回だけ送るイベント / '回' = 毎回送るイベント */
const TOUR_STEP = {'welcome':'ようこそ','account-add':'口座の追加','networth':'純資産','done':'完了','sample':'サンプル'};
const EV_MAP = {
  app_open:        {g:'獲得',    ja:'起動',                   u:'回'},
  app_first:       {g:'獲得',    ja:'初回起動（新規訪問者）', u:'人'},
  auth_view:       {g:'獲得',    ja:'ログイン画面を見た',     u:'人'},
  guest_start:     {g:'獲得',    ja:'ゲスト開始',             u:'回'},
  guest_first:     {g:'獲得',    ja:'ゲスト開始',             u:'人'},
  guest_return:    {g:'継続',    ja:'既存ゲストの再訪',       u:'回'},
  journal_added:   {g:'獲得',    ja:'ゲストの記帳',           u:'回'},
  first_journal:   {g:'獲得',    ja:'初回記帳',               u:'人'},
  registered:      {g:'獲得',    ja:'初回ログイン(端末別)',    u:'回'},
  retain_d1:       {g:'継続',    ja:'1日後に再訪',            u:'人'},
  retain_d7:       {g:'継続',    ja:'7日後に再訪',            u:'人'},
  retain_d30:      {g:'継続',    ja:'30日後に再訪',           u:'人'},
  account_deleted: {g:'継続',    ja:'退会',                   u:'人'},
  ios_badge_click: {g:'獲得',    ja:'App Storeへ（更新情報から）', u:'回'},
  ios_soon_shown:  {g:'獲得',    ja:'アプリ準備中の案内を表示', u:'人'},
  ios_promo_shown: {g:'獲得',    ja:'アプリ案内を表示',        u:'人'},
  ios_promo_click: {g:'獲得',    ja:'App Storeへ（案内から）', u:'人'},
  ios_preorder_click:{g:'獲得',  ja:'予約注文へ（アプリ内から）', u:'回'},
  feedback_shown:  {g:'アンケート', ja:'アンケート表示',      u:'回'},
  feedback_shown_monthly:{g:'アンケート', ja:'月次アンケート表示', u:'回'},
  feedback_sent:   {g:'アンケート', ja:'アンケート送信',      u:'回'},
  tour_done:       {g:'ツアー',  ja:'ツアー完走',             u:'回'},
  tour_done_acted: {g:'ツアー',  ja:'完走かつ記帳',           u:'回'},
  tour_sample:     {g:'ツアー',  ja:'サンプル閲覧',           u:'回'}
};
function evInfo(name){
  if(EV_MAP[name]) return EV_MAP[name];
  if(name.indexOf('tour_step_')===0){
    const k = name.slice(10);
    return {g:'ツアー', ja:'到達: '+(TOUR_STEP[k]||k), u:'回'};
  }
  if(name.indexOf('tour_skip_')===0){
    const k = name.slice(10);
    return {g:'ツアー', ja:'離脱: '+(TOUR_STEP[k]||k), u:'回'};
  }
  return {g:'その他', ja:name, u:'回'};
}
const GROUPS = ['獲得','ツアー','継続','アンケート','その他'];
// ⚠ iOS Safari は「Web」に入る。ここでいう iOSアプリ は App Store 版のこと。
const PF_JA = {ios:'iPhoneアプリ', android:'Androidアプリ', web:'ブラウザ', unknown:'不明（UA未記録）', other:'その他'};

// 状態=毎日30秒（壊れていないか） / 成長=週1回（伸びているか）
// 深掘り=必要時（なぜそうなったか） / 問い合わせ=毎日（返信する）
let tab = 'status';
let statsCache = null; // 成長と深掘りは同じデータを使うので取り直さない
let pfCache = {};      // 端末別は期間ごとに別取得（深掘りの絞り込みで何度も描き直すため）
// 読み込みは数秒〜数十秒かかる。待っている間にタブを切り替えると、
// 後から返ってきた古い応答が新しい画面を上書きしてしまう。世代番号で捨てる。
let gen = 0;
const stale = (g) => g !== gen;

function setTab(t){
  tab = t;
  gen++; // 進行中の読み込みの結果を無効にする
  for (const k of ['status','access','deep','inquiry','feedback'])
    $('#tab-'+(k==='access'?'access':k)).className = t===k ? 'on' : '';
  // 期間の切替が意味を持つのは成長と深掘りだけ
  const showPeriod = (t==='access' || t==='deep');
  $('#period-picker').style.display = showPeriod ? '' : 'none';
  $('#period').style.display = showPeriod ? '' : 'none';
  load();
}

async function loadFeedback(){
  $('#refresh').disabled = true; $('#refresh').textContent = '取得中…';
  $('#root').innerHTML = '<p class="muted">DynamoDBから取得中…</p>';
  try{
    const r = await fetch('/api/feedback');
    const d = await r.json();
    if(!r.ok || d.error){ $('#root').innerHTML = '<div class="err">'+esc(d.error||'エラー')+'</div>'; return; }
    renderFeedback(d);
  }catch(e){ $('#root').innerHTML = '<div class="err">'+esc(e.message)+'</div>'; }
  finally{ $('#refresh').disabled = false; $('#refresh').textContent = '更新'; }
}

function renderFeedback(d){
  let h = '<div class="band"><h2>ご意見</h2><span class="hint">アプリ内アンケートの自由記述</span></div>';
  h += '<div class="lead" style="grid-template-columns:repeat(2,minmax(0,1fr))">';
  h += lead(d.total, '件', 'ご意見の総数', '全期間', true);
  h += lead(d.byMonth[0] ? d.byMonth[0].count : 0, '件', '今月分', d.byMonth[0] ? d.byMonth[0].month : '—');
  h += '</div>';

  if(d.byMonth.length){
    h += '<section><h3>月別の件数</h3><div class="months">';
    for(const m of d.byMonth) h += '<div class="month"><b>'+m.count+'</b>'+esc(m.month)+'</div>';
    h += '</div></section>';
  }

  h += '<div class="band"><h2>本文（新しい順）</h2></div>';
  if(!d.items.length){
    h += '<section><p class="muted">まだ届いていません。</p></section>';
  }else{
    for(const it of d.items){
      h += '<div class="fb"><div class="when">'+esc((it.timestamp||'').replace('T',' ').slice(0,16))+'</div>'
         + '<div class="body">'+esc(it.body)+'</div></div>';
    }
  }
  h += '<p class="foot"><span>匿名で保存されているため、送信者は特定できません。</span><span>取得時刻: '+esc(d.generatedAt)+'</span></p>';
  $('#root').innerHTML = h;
}

async function loadInquiries(){
  $('#refresh').disabled = true; $('#refresh').textContent = '取得中…';
  $('#root').innerHTML = '<p class="muted">DynamoDBから取得中…</p>';
  try{
    const r = await fetch('/api/inquiries');
    const d = await r.json();
    if(!r.ok || d.error){ $('#root').innerHTML = '<div class="err">'+esc(d.error||'エラー')+'</div>'; return; }
    renderInquiries(d);
  }catch(e){ $('#root').innerHTML = '<div class="err">'+esc(e.message)+'</div>'; }
  finally{ $('#refresh').disabled = false; $('#refresh').textContent = '更新'; }
}

function renderInquiries(d){
  let h = '<div class="band"><h2>問い合わせ</h2><span class="hint">ログイン済みユーザーとのやり取り（メールアドレスは保持していない）</span></div>';
  h += '<div class="lead" style="grid-template-columns:repeat(2,minmax(0,1fr))">';
  h += lead(d.waiting, '件', '返信待ち', 'こちらの返答が必要', true);
  h += lead(d.total, '件', 'スレッド総数', '全期間');
  h += '</div>';
  if(!d.items.length){
    h += '<section><p class="muted">まだ届いていません。</p></section>';
  }else{
    for(const t of d.items){
      const waiting = t.status!=='closed' && t.messages.length && t.messages[t.messages.length-1].from==='user';
      h += '<div class="fb"><div class="when">'+esc(t.sub)+'… ／ '+esc((t.updatedAt||'').replace('T',' ').slice(0,16))
         + (waiting ? ' ／ <b style="color:#e0a020">返信待ち</b>' : '')
         + (t.status==='closed' ? ' ／ 終了' : '') + '</div>';
      h += '<div class="body"><b>'+esc(t.subject||'（件名なし）')+'</b></div>';
      for(const m of t.messages){
        h += '<div class="body" style="margin-top:6px;padding-left:10px;border-left:3px solid '
           + (m.from==='staff' ? '#0d9488' : '#c9d2d4') + '"><span class="muted">'
           + (m.from==='staff' ? '運営' : 'ユーザー') + ' '+esc((m.at||'').replace('T',' ').slice(0,16))
           + '</span><br>'+esc(m.body)+'</div>';
      }
      if(t.status!=='closed'){
        h += '<div style="margin-top:8px"><textarea class="rp" rows="3" style="width:100%" '
           + 'data-pk="'+esc(t.pk)+'" data-sk="'+esc(t.sk)+'" placeholder="返信を書く"></textarea>'
           + '<button class="rp-send" data-pk="'+esc(t.pk)+'" data-sk="'+esc(t.sk)+'">返信する</button> '
           + '<label class="muted"><input type="checkbox" class="rp-close" data-sk="'+esc(t.sk)+'"> 送信して終了にする</label></div>';
      }
      h += '</div>';
    }
  }
  h += '<p class="foot"><span>本文はサポート対応のため表示している。メールアドレスは保持していない（表示は sub の先頭8桁）。</span><span>取得時刻: '+esc(d.generatedAt)+'</span></p>';
  $('#root').innerHTML = h;

  document.querySelectorAll('.rp-send').forEach(function(btn){
    btn.addEventListener('click', async function(){
      const sk = btn.dataset.sk;
      const ta = document.querySelector('textarea.rp[data-sk="'+CSS.escape(sk)+'"]');
      const close = document.querySelector('.rp-close[data-sk="'+CSS.escape(sk)+'"]').checked;
      if(!ta.value.trim()) return;
      btn.disabled = true; btn.textContent = '送信中…';
      try{
        const r = await fetch('/api/inquiry-reply', { method:'POST', headers:{'content-type':'application/json'},
          body: JSON.stringify({ pk: btn.dataset.pk, sk, body: ta.value, close }) });
        const j = await r.json();
        if(!r.ok || j.error) throw new Error(j.error||'失敗');
        loadInquiries();
      }catch(e){ alert(e.message); btn.disabled = false; btn.textContent = '返信する'; }
    });
  });
}

// 毎日30秒で見る画面。壊れていないかだけを判定する。
// この製品は「静かに壊れる」事故を繰り返しているので、指標を眺めるのではなく
// 常に真であるべきことを明示的に検証して、緑／黄／赤で出す。
async function loadStatus(){
  const g = gen;
  $('#refresh').disabled = true; $('#refresh').textContent = '取得中…';
  $('#root').innerHTML = '<p class="muted">AWSに問い合わせ中…（数秒かかります）</p>';
  try{
    const r = await fetch('/api/status');
    const d = await r.json();
    if(stale(g)) return; // 待っている間にタブが変わった
    if(!r.ok || d.error){ $('#root').innerHTML = '<div class="err">'+esc(d.error||'エラー')+'</div>'; return; }
    renderStatus(d);
  }catch(e){ if(!stale(g)) $('#root').innerHTML = '<div class="err">'+esc(e.message)+'</div>'; }
  finally{ if(!stale(g)){ $('#refresh').disabled = false; $('#refresh').textContent = '更新'; } }
}

function renderStatus(d){
  const ico = { ok:'<span class="st-ok">●</span>', warn:'<span class="st-warn">▲</span>', bad:'<span class="st-bad">✕</span>' };
  const row = (lv,label,val,note) =>
    '<div class="chk">'+ico[lv]+'<span>'+esc(label)+(note?'<br><span class="chk-note">'+esc(note)+'</span>':'')+'</span>'
    + '<span class="chk-v">'+esc(String(val))+'</span></div>';

  const c = d.checks||{}; const s = d.signals;
  const worst = (c.checks||[]).reduce((m,x)=> x.level==='bad'?'bad':(x.level==='warn'&&m!=='bad'?'warn':m), 'ok');

  let h = '';
  // 総合判定を最初に出す。緑ならここで閉じてよい、が設計意図。
  const okAll = worst==='ok' && s && s.err5===0 && s.lambdaErrors===0;
  h += '<div class="verdict '+(okAll?'v-ok':(worst==='bad'?'v-bad':'v-warn'))+'">'
     + '<b>'+(okAll?'異常なし':(worst==='bad'?'要対応':'注意'))+'</b>'
     + '<span>'+(okAll?'このまま閉じて構いません':'下の赤／黄を確認してください')+'</span></div>';

  h += '<div class="cols">';
  h += '<section><h3>前提チェック</h3><p class="hint">常に真であるべきこと。画面が正常に見えても、ここが崩れると静かに壊れる</p>';
  for (const x of (c.checks||[])) h += row(x.level, x.label, x.value, x.note);
  const cs = d.judged.csp;
  h += row(cs.level, cs.label, cs.value, cs.note);
  h += '</section>';

  h += '<section><h3>監視の4指標（24時間）</h3><p class="hint">遅延・流量・エラー・飽和。1つのシステムで4つしか測れないならこの4つ</p>';
  if(!s) h += '<p class="muted">取得できませんでした</p>';
  else for (const x of d.judged.signals) h += row(x.level, x.label, x.value, x.note);
  h += row(d.inquiriesWaiting>0?'warn':'ok', '返信待ちの問い合わせ', (d.inquiriesWaiting??'—')+' 件',
        d.inquiriesWaiting>0 ? '「問い合わせ」タブで返信してください' : null);
  h += '</section></div>';

  h += '<p class="foot"><span>緑がすべてなら、この画面を閉じて構いません。'
     + '赤・黄が出たときだけ「深掘り」へ。</span><span>取得時刻: '+esc(d.generatedAt)+'</span></p>';
  $('#root').innerHTML = h;
}

async function load(){
  if(tab==='status') return loadStatus();
  if(tab==='feedback') return loadFeedback();
  if(tab==='inquiry') return loadInquiries();
  const days = $('#days').value;
  // 成長と深掘りは同じ集計を使う。期間が同じなら取り直さない（S3同期が重いため）
  if(statsCache && statsCache.__days === days){
    return tab==='deep' ? renderDeep(statsCache) : render(statsCache);
  }
  const g = gen;
  $('#refresh').disabled = true; $('#refresh').textContent = '取得中…';
  $('#root').innerHTML = '<p class="muted">S3からログを同期して集計中…（初回・長期間は少し時間がかかります）</p>';
  try{
    const r = await fetch('/api/stats?days='+days);
    const d = await r.json();
    d.__days = days; statsCache = d; // 取得自体は無駄にしない（次のタブで使う）
    if(stale(g)) return;
    if(!r.ok || d.error){ $('#root').innerHTML = '<div class="err">'+esc(d.error||'エラー')+'</div>'; return; }
    if(tab==='deep') renderDeep(d); else render(d);
  }catch(e){ if(!stale(g)) $('#root').innerHTML = '<div class="err">'+esc(e.message)+'</div>'; }
  finally{ if(!stale(g)){ $('#refresh').disabled = false; $('#refresh').textContent = '更新'; } }
}

// 獲得ファネルと継続。人数は「ブラウザごとに1回だけ送るイベント」の数。
function funnelSection(d){
  const f = d.events.funnel || [];
  // 先頭（起動）が0なら分母が無く率を出せない。配信直後は registered など既存イベントだけが
  // 値を持ち、それが満杯のバーとして描かれて誤読を招くため、揃うまでは表示しない。
  const has = f.length > 0 && f[0].count > 0;
  const ev = Object.fromEntries(d.events.total.map(e=>[e.name,e.count]));
  let h = '<div class="cols">';
  h += '<section><h3>獲得ファネル <small>人数（ブラウザ単位）／ 起動を100%とした割合</small></h3>';
  if(!has){
    h += '<p class="muted">計測イベントの配信直後です。数字が入るまで1日ほどお待ちください。'
       + '（判定に使う localStorage のキーは計測導入時点では誰も持っていないため、'
       + '長く使っている人も次の訪問で1回ずつ計上されます。最初の数日は新規訪問者が'
       + '実態より多く出ます）</p>';
  }else{
    const max = Math.max(...f.map(x=>x.count), 1);
    h += '<div class="fn-hd"><div>段階</div><div></div><div>人数</div><div>起動比</div><div>前段比</div></div><div class="fn">';
    let prev = null;
    for(const s of f){
      const w = Math.round((s.count / max) * 100);
      let step = '<div class="fn-s first">—</div>';
      if(prev!=null && prev>0){
        const sr = Math.round(s.count / prev * 1000) / 10;
        const drop = prev - s.count;
        step = '<div class="fn-s">'+sr+'%'+(drop>0?'<u>-'+drop+'人</u>':'')+'</div>';
      }
      h += '<div class="fn-r"><div class="fn-l">'+esc(s.label)+'</div>'
         + '<div class="fn-b"><span style="width:'+w+'%"></span></div>'
         + '<div class="fn-n">'+s.count+'<u>人</u></div>'
         + '<div class="fn-p">'+(s.rate==null?'—':s.rate+'%')+'</div>'
         + step+'</div>';
      prev = s.count;
    }
    h += '</div>';
    const en = d.events.entry;
    if(en && en.authRate!=null){
      // ログイン画面は ?guest で来た人が通らないため、ファネルの段には入れず内訳として出す
      h += '<div class="headline"><span class="pair"><span class="k">ログイン画面に当たった</span>'
         + '<span class="v" style="font-size:20px">'+en.authRate+'%</span><span class="f">'+en.authView+'人</span></span>'
         + '<span class="pair"><span class="k">LPから直行（?guest）</span>'
         + '<span class="v" style="font-size:20px">'+en.directRate+'%</span><span class="f">'+en.direct+'人</span></span></div>';
    }
  }
  h += '</section>';

  const r = d.events.retention || [];
  h += '<div>';
  h += '<section><h3>継続 <small>ゲスト開始した人が分母</small></h3>';
  if(!r.some(x=>x.count>0)){
    h += '<p class="muted">まだ計測できていません。retain_d1 は配信の翌日以降、d7 は7日後以降に出はじめます。</p>';
  }else{
    const rmax = Math.max(...r.map(x=>x.rate==null?0:x.rate), 1);
    h += '<div class="ret">';
    for(const x of r){
      const w = Math.round(((x.rate==null?0:x.rate) / rmax) * 100);
      h += '<div class="ret-r"><div class="ret-l">'+esc(x.label)+'</div>'
         + '<div class="ret-b"><span style="width:'+w+'%"></span></div>'
         + '<div class="ret-v">'+(x.rate==null?'—':x.rate+'%')+'<u>'+x.count+'人</u></div></div>';
    }
    h += '</div>';
  }
  h += '<div class="headline">'
     + '<span class="pair"><span class="k">起動 app_open</span><span class="v" style="font-size:20px">'+(d.events.appOpen||0)+'</span><span class="f">回</span></span>'
     + '<span class="pair"><span class="k">既存ゲストの再訪 guest_return</span><span class="v" style="font-size:20px">'+(d.events.guestReturn||0)+'</span><span class="f">回</span></span></div>';
  h += '</section>';

  h += '<section><h3>アクティベーション <small>記帳イベント ÷ ゲスト開始（どちらも回数。人あたりではなく訪問あたり）</small></h3>';
  h += '<div class="headline" style="margin:0;padding:0;border:0">'
     + '<span class="v" style="font-size:34px">'+(d.events.activation==null?'—':d.events.activation)+'</span>'
     + '<span class="f">＝ 記帳イベント(journal_added) '+(ev.journal_added||0)+'回 ÷ ゲスト開始(guest_start) '+(ev.guest_start||0)+'回</span></div>';
  h += '</section></div></div>';
  return h;
}

function render(d){
  $('#period').textContent = d.period.from ? (d.period.from+' 〜 '+d.period.to+'（直近'+d.period.days+'日）') : 'データなし';
  const o = d.opens;
  const ev = Object.fromEntries(d.events.total.map(e=>[e.name,e.count]));

  // 1. 主役の数字
  let h = '<div class="band"><h2>いま</h2><span class="hint">bot・self を除いた人間のアクセス</span></div>';
  h += '<div class="lead">';
  const ru = d.registeredUsers;
  // 「この期間に何人増えたか」。ログのビーコン(registered)ではなく Cognito の登録日時を数える。
  // ビーコンは Google の別端末ログインも拾うので獲得数としては使えない。
  h += lead(ru==null||ru.inPeriod==null?'—':ru.inPeriod, '人', 'この期間の新規登録', 'Cognito の登録日時', true);
  h += lead(ru==null?'—':ru.total, '人', '登録ユーザー数（累計）',
    ru==null ? 'Cognito' : 'Google '+ru.google+' / Apple '+ru.apple+' / メール '+ru.email+(ru.unconfirmed?'（未確認 '+ru.unconfirmed+'）':''));
  h += lead(o.humanDistinct, '人', '実人数', '重複IPを除いた人数');
  h += lead(o.human, '回', '人間の訪問（オープン）', '1人あたり '+(o.humanDistinct?(o.human/o.humanDistinct).toFixed(1):'—')+'回');
  h += '</div>';
  h += '<div class="sub"><span class="t">ノイズ</span>'
     + '<span class="i">ボット <b>'+o.bot+'</b> 回</span>'
     + '<span class="i">self（自分） <b>'+o.self+'</b> 回</span>'
     + '<span class="i">全オープン <b>'+o.total+'</b> 回</span></div>';

  // 除外の内訳。「人間0」のとき何で弾かれたのかをここで確認できる
  if(d.excluded && d.excluded.length){
    h += '<details><summary>除外の内訳 <span>'+(o.total-o.human)+'回を除外（人間 '+o.human+'回）</span></summary><div class="in"><div class="wrap">'
       + '<table><tr><th>理由</th><th class="num">件数</th><th>代表的なUser-Agent</th></tr>';
    for(const r of d.excluded){
      h += '<tr><td>'+esc(r.reason)+'</td><td class="num">'+r.count+'</td><td class="ref">'+esc(r.ua||'')+'</td></tr>';
    }
    h += '</table></div></div></details>';
  }

  // 2. ファネルと継続
  h += '<div class="band"><h2>獲得と継続</h2><span class="hint">2026-08-02に計測開始。最初の数日は既存利用者の分が新規として上乗せされる</span></div>';
  h += funnelSection(d);

  // 3. 日別オープン（人間 / bot を別スケールで）
  h += '<div class="band"><h2>推移</h2><span class="hint">直近'+d.period.days+'日</span></div>';

  // 日別の新規登録。件数が少ないので棒グラフにせず、登録があった日だけを新しい順に並べる。
  if(ru && ru.byDay){
    h += '<section><h3>日別の新規登録 <small>Cognito の登録日時（UTC）。未確認は除く</small></h3>';
    if(!ru.byDay.length){
      h += '<p class="muted">この期間の登録はありません</p>';
    }else{
      h += '<div class="chips">';
      for(const r of [...ru.byDay].reverse()){
        h += '<span class="chip k">'+r.date.slice(5).replace('-','/')+' <b>'+r.count+'</b>'
           + '<span style="color:var(--tx3);font-size:11px">'
           + (r.google?' Google'+r.google:'') + (r.apple?' Apple'+r.apple:'') + (r.email?' メール'+r.email:'') + '</span></span>';
      }
      h += '</div>';
    }
    h += '</section>';
  }

  // 日別の実端末数（DAUの近似）。棒＝端末数、数字も端末数。回数は下の帯で見る。
  h += '<section><h3>日別の実端末数 <small>重複IPを除いた台数。DAUの近似（IPが入れ替わる分やや多め）</small></h3>';
  if(!d.byDay.length){
    h += '<p class="muted">データなし</p>';
  }else{
    const maxD = Math.max(1, ...d.byDay.map(r=>r.distinct||0));
    h += '<div class="chart">';
    for(const r of d.byDay){
      h += '<div class="col" title="'+r.date+' 実端末'+(r.distinct||0)+'台 / 訪問'+r.human+'回">'
         + '<div class="v">'+(r.distinct||0)+'</div>'
         + '<div class="track"><div class="b" style="height:'+Math.max(2,Math.round((r.distinct||0)/maxD*100))+'%"></div></div>'
         + '<div class="x">'+r.date.slice(5).replace('-','/')+'</div></div>';
    }
    h += '</div>';
    const ds = d.byDay.map(r=>r.distinct||0);
    const fixed = ds.slice(0,-1); // 当日は集計途中なので平均・最大から外す
    h += '<div class="sub" style="margin-top:12px"><span class="t">実端末数</span>'
       + '<span class="i">直近（確定日） <b>'+(fixed.length?fixed[fixed.length-1]:'—')+'</b> 台</span>'
       + '<span class="i">平均 <b>'+(fixed.length?(fixed.reduce((a,b)=>a+b,0)/fixed.length).toFixed(1):'—')+'</b> 台</span>'
       + '<span class="i">最大 <b>'+(fixed.length?Math.max(...fixed):'—')+'</b> 台</span>'
       + '<span class="i muted">当日は集計途中のため平均・最大から除外</span></div>';
  }
  h += '</section>';

  h += '<section><h3>日別オープン <small>人間（回）</small></h3>';
  if(!d.byDay.length){
    h += '<p class="muted">データなし</p>';
  }else{
    const maxH = Math.max(1, ...d.byDay.map(r=>r.human));
    const maxB = Math.max(1, ...d.byDay.map(r=>r.bot));
    h += '<div class="chart">';
    for(const r of d.byDay){
      const md = r.date.slice(5).replace('-','/');
      h += '<div class="col" title="'+r.date+' 人間'+r.human+'回 / 実端末'+(r.distinct||0)+'台 / bot'+r.bot+'">'
         + '<div class="v">'+r.human+'</div>'
         + '<div class="track"><div class="b" style="height:'+Math.max(2,Math.round(r.human/maxH*100))+'%"></div></div>'
         + '<div class="x">'+md+'</div></div>';
    }
    h += '</div>';
    h += '<h3 style="margin:20px 0 8px">bot・self <small>人間とは別スケール</small></h3>';
    h += '<div class="chart mini">';
    for(const r of d.byDay){
      h += '<div class="col" title="'+r.date+' bot'+r.bot+' / self'+r.self+'">'
         + '<div class="v'+(r.bot===maxB?' peak':'')+'">'+r.bot+'</div>'
         + '<div class="track"><div class="b bot" style="height:'+Math.max(2,Math.round(r.bot/maxB*100))+'%"></div></div>'
         + '</div>';
    }
    h += '</div>';
    h += '<div class="legend"><span><i></i>人間（回）</span><span><i class="g"></i>bot（回）</span>'
       + '<span>self 合計 '+o.self+'回</span></div>';
  }
  h += '</section>';

  // 「成長」はここまで。以降は「深掘り」タブへ分離した（毎週見る数字と、
  // 疑問が出たときだけ掘る材料を同じ画面に混ぜない）。
  $('#root').innerHTML = h;
}

// 深掘り：なぜそうなったかを調べに来る場所。普段は開かない。
let jFilter = null; // 「どこで消えたか」で選んだ最後のイベント。null = 絞り込みなし

function journeySection(d){
  const j = d.journeys;
  if(!j || !j.visitors.length) return '';
  // 起動しただけで何もしなかった人は行動列から外す（読んでも情報が無いため）。
  // 「どこで消えたか」の集計には残す。そこでは「起動で消えた人数」自体が知りたい数字なので。
  const acted = j.visitors.filter(v=>v.seq.some(s=>s.e!=='app_open'));
  const skipped = j.visitors.length - acted.length;
  const vis = jFilter ? acted.filter(v=>v.last===jFilter) : acted;
  const total = acted.length;

  let h = '<div class="band"><h2>訪問者の行動</h2><span class="hint">'
        + '率では「どこで何をして帰ったか」が分からない。1行＝1人の実際の順序</span></div>';
  h += '<div class="cols">';

  // どこで消えたか（クリックで下の一覧を絞る）
  h += '<section><h3>どこで消えたか</h3><p class="hint">最後に記録されたイベント。クリックでその人たちだけに絞る</p>';
  const max = Math.max(...j.dropoff.map(x=>x.n), 1);
  for(const x of j.dropoff){
    const on = jFilter===x.e;
    h += '<div class="drop-row'+(on?' on':'')+'" data-ev="'+esc(x.e)+'">'
       + '<span class="drop-n">'+x.n+'人</span>'
       + '<span class="drop-bar"><i style="width:'+Math.round(x.n/max*100)+'%"></i></span>'
       + '<span class="drop-e">'+esc(evInfo(x.e).ja)+'</span></div>';
  }
  if(jFilter) h += '<div style="margin-top:8px"><button class="btn-clear" id="j-clear">絞り込みを解除</button></div>';
  h += '</section>';

  // 行動列
  h += '<section><h3>行動列'+(jFilter?'（絞り込み中 '+vis.length+'/'+total+'人）':'（'+total+'人）')+'</h3>';
  h += '<p class="hint">新しい順。IPは表示しない。同一人物の判定はIPなので厳密ではない'
     + (skipped?'／起動しただけの '+skipped+'人は除外（「どこで消えたか」には含む）':'')+'</p>';
  if(!vis.length) h += '<p class="muted">該当なし</p>';
  for(const v of vis.slice(0,25)){
    const badge = v.registered ? '<span class="jb jb-reg">登録</span>'
                : v.writes ? '<span class="jb jb-w">記帳'+v.writes+'</span>' : '';
    h += '<div class="jrow"><div class="jmeta">'
       + '<span>'+esc(v.first.slice(5,16))+'</span>'
       + '<span>'+(v.mobile?'スマホ':'PC')+'</span>'
       + '<span>'+v.days+'日</span>'
       + '<span>'+v.minutes+'分'+(v.sessions>1?'／'+v.sessions+'回':'')+'</span>'
       + '<span class="jref">'+esc(v.ref)+'</span>'
       + badge + '</div><div class="jseq">'
       + v.seq.map(s=>'<span class="jev">'+esc(evInfo(s.e).ja)+(s.n>1?' ×'+s.n:'')+'</span>').join('<i>→</i>')
       + '</div></div>';
  }
  if(vis.length>25) h += '<p class="muted">ほか '+(vis.length-25)+'人</p>';
  h += '</section></div>';
  return h;
}

function platformHtml(p){
  if(!p) return '<p class="muted">APIアクセスログを取得できませんでした</p>';
  if(!p.length) return '<p class="muted">この期間の記録がありません</p>';
  let h = '<div class="wrap"><table><tr><th>端末</th><th class="num">利用者</th><th class="num">記帳</th>'
     + '<th class="num">2日以上使った人</th><th class="num">利用日数の中央値</th><th class="num">リクエスト</th></tr>';
  for(const r of p){
    h += '<tr><td>'+esc(PF_JA[r.platform]||r.platform)+'</td>'
       + '<td class="num">'+r.users+'</td><td class="num">'+r.writes+'</td>'
       + '<td class="num">'+r.returned+'</td><td class="num">'+r.medianDays+'</td>'
       + '<td class="num">'+r.requests+'</td></tr>';
  }
  h += '</table></div>';
  if(p.some(r=>r.platform==='unknown')){
    h += '<p class="hint">「不明」はアクセスログに User-Agent を記録する前の行です。iOSが0件という意味ではありません。</p>';
  }
  return h;
}

// 端末別だけは本体の描画を待たせずに後から入れる（取得に数秒かかるため）
async function loadPlatforms(days){
  const put = (html) => { const el = $('#pf'); if(el) el.innerHTML = html; };
  if(pfCache[days] !== undefined) return put(platformHtml(pfCache[days]));
  const g = gen;
  try{
    const r = await fetch('/api/platforms?days='+days);
    const d = await r.json();
    if(stale(g)) return;
    if(!r.ok || d.error) return put('<div class="err">'+esc(d.error||'エラー')+'</div>');
    pfCache[days] = d.platforms;
    put(platformHtml(d.platforms));
  }catch(e){ if(!stale(g)) put('<div class="err">'+esc(e.message)+'</div>'); }
}

function renderDeep(d){
  let h = journeySection(d);

  // 3.5 端末別（API Gatewayのアクセスログ）
  h += '<div class="band"><h2>端末別の利用</h2><span class="hint">APIアクセスログ（認証済みのみ／OPTIONS除外）</span></div>';
  h += '<div id="pf"><p class="muted">APIアクセスログを取得中…</p></div>';

  // 4. 自前イベント（種類ごと）
  h += '<div class="band"><h2>自前イベント計測</h2><span class="hint">/_e/*（bot・self除外）／「人」= ブラウザごとに1回、「回」= 毎回</span></div>';
  h += '<div class="cols">';
  h += '<section><h3>期間合計</h3>';
  if(!d.events.total.length){
    h += '<p class="muted">まだイベントがありません</p>';
  }else{
    const byGroup = {};
    for(const e of d.events.total){
      const info = evInfo(e.name);
      (byGroup[info.g] = byGroup[info.g] || []).push({e:e, i:info});
    }
    for(const g of GROUPS){
      const rows = byGroup[g];
      if(!rows) continue;
      h += '<div class="grp"><div class="gt">'+g+'</div>';
      for(const r of rows){
        h += '<div class="ev"><div class="n">'+esc(r.i.ja)+'<code>'+esc(r.e.name)+'</code></div>'
           + '<div class="u">'+r.i.u+'</div>'
           + '<div class="c">'+r.e.count+'<em>'+r.i.u+'</em></div></div>';
      }
      h += '</div>';
    }
  }
  h += '</section>';

  // 5. 日別の内訳（チップ）
  h += '<section><h3>日別のゲスト開始と記帳 <small>棒=ゲスト開始（回）／濃色=記帳／数字=記帳率</small></h3>';
  if(!d.events.byDay.length){
    h += '<p class="muted">データなし</p>';
  }else{
    const gmax = Math.max(1, ...d.events.byDay.map(r=>r.counts.guest_start||0));
    h += '<div class="chart rate">';
    for(const r of d.events.byDay){
      const g = r.counts.guest_start || 0;
      const j = r.counts.journal_added || 0;
      const rate = g ? Math.round(j/g*1000)/10 : null;
      h += '<div class="col" title="'+r.date+' ゲスト開始'+g+'回 / 記帳'+j+'回">'
         + '<div class="v'+(j?'':' zero')+'">'+(rate==null?'—':rate+'%')+'</div>'
         + '<div class="track"><div class="b" style="height:'+Math.max(2,Math.round(g/gmax*100))+'%">'
         + (j?'<i style="height:'+Math.min(100,Math.round(j/Math.max(g,1)*100))+'%"></i>':'')+'</div></div>'
         + '<div class="x">'+r.date.slice(5).replace('-','/')+'</div></div>';
    }
    h += '</div>';

    h += '<h3 style="margin:20px 0 8px">日別の内訳</h3>';
    for(const r of d.events.byDay){
      const entries = Object.entries(r.counts).sort((a,b)=>b[1]-a[1]);
      const main = entries.filter(en=>evInfo(en[0]).g!=='ツアー');
      const tour = entries.filter(en=>evInfo(en[0]).g==='ツアー');
      const tourSum = tour.reduce((a,en)=>a+en[1], 0);
      h += '<div class="day"><div class="d">'+r.date.slice(5).replace('-','/')+'</div><div class="chips">';
      for(const en of main){
        const info = evInfo(en[0]);
        const key = (en[0]==='guest_start'||en[0]==='journal_added'||en[0]==='registered');
        h += '<span class="chip'+(key?' k':'')+'" title="'+esc(en[0])+'">'+esc(info.ja)+' <b>'+en[1]+'</b></span>';
      }
      if(tour.length){
        h += '<details class="tour"><summary>ツアー '+tour.length+'種 <b>'+tourSum+'</b></summary><div class="chips">';
        for(const en of tour){
          h += '<span class="chip" title="'+esc(en[0])+'">'+esc(evInfo(en[0]).ja)+' <b>'+en[1]+'</b></span>';
        }
        h += '</div></details>';
      }
      h += '</div></div>';
    }
  }
  h += '</section></div>';

  // 6. 流入
  h += '<div class="band"><h2>流入</h2></div>';
  h += '<div class="cols3">';
  h += '<section><h3>媒体別 <small>utm_sourceのみ。タグ無しは媒体不明</small></h3><div class="wrap"><table><tr><th>媒体</th><th class="num">件数</th><th class="num">実人数</th></tr>';
  for(const r of d.bySrc){ h += '<tr><td>'+esc(r.src)+'</td><td class="num">'+r.count+'</td><td class="num muted">'+r.distinct+'</td></tr>'; }
  if(!d.bySrc.length) h += '<tr><td class="muted" colspan="3">データなし</td></tr>';
  h += '</table></div></section>';

  h += '<section><h3>参照元 上位</h3><div class="wrap"><table><tr><th class="num">件数</th><th>Referer</th></tr>';
  for(const r of d.refs){ h += '<tr><td class="num">'+r.count+'</td><td class="ref">'+esc(r.ref)+'</td></tr>'; }
  if(!d.refs.length) h += '<tr><td class="muted" colspan="2">データなし</td></tr>';
  h += '</table></div></section>';
  h += '</div>';

  // 6-2. 記事別のアプリ流入（utm_content）とデバイス別
  h += '<div class="cols3">';
  h += '<section><h3>記事別のアプリ流入 <small>LPのCTA経由（utm_content）。GA4の記事別PVで割るとCTRになる</small></h3>';
  if(!d.byArticle || !d.byArticle.length){
    h += '<p class="muted">まだありません。LPのCTAにutmを付けて配信した後、記事から実際にクリックされると出ます。</p>';
  }else{
    h += '<div class="wrap"><table><tr><th>記事</th><th class="num">クリック</th><th class="num">実人数</th></tr>';
    for(const r of d.byArticle){ h += '<tr><td>'+esc(r.slug)+'</td><td class="num">'+r.count+'</td><td class="num muted">'+r.distinct+'</td></tr>'; }
    h += '</table></div>';
  }
  h += '</section>';

  h += '<section><h3>デバイス別 <small>人間の起動（UA判定）</small></h3><div class="wrap"><table><tr><th>デバイス</th><th class="num">起動</th><th class="num">実人数</th><th class="num">構成比</th></tr>';
  const devTotal = (d.byDevice||[]).reduce((s,x)=>s+x.count,0);
  for(const r of (d.byDevice||[])){
    h += '<tr><td>'+esc(r.name)+'</td><td class="num">'+r.count+'</td><td class="num muted">'+r.distinct+'</td>'
       + '<td class="num">'+(devTotal?(r.count/devTotal*100).toFixed(0)+'%':'—')+'</td></tr>';
  }
  if(!devTotal) h += '<tr><td class="muted" colspan="4">データなし</td></tr>';
  h += '</table></div>';

  // プラットフォーム別。ネイティブアプリの判断に iOS / Android の比率を見る
  h += '<h3 style="margin:20px 0 8px">プラットフォーム別 <small>OS判定。「判定不能」はアプリ内ブラウザ等でUAが削られたもの</small></h3>';
  const pf = d.byPlatform||[];
  const pfTotal = pf.reduce((s,x)=>s+x.count,0);
  if(!pfTotal){
    h += '<p class="muted">データなし</p>';
  }else{
    const mob = pf.filter(r=>/iPhone|iPad|Android/.test(r.name)).reduce((s,x)=>s+x.count,0);
    const ios = pf.filter(r=>/iPhone|iPad/.test(r.name)).reduce((s,x)=>s+x.count,0);
    h += '<div class="wrap"><table><tr><th>プラットフォーム</th><th class="num">起動</th><th class="num">実人数</th><th class="num">構成比</th></tr>';
    for(const r of pf){
      h += '<tr><td>'+esc(r.name)+'</td><td class="num">'+r.count+'</td><td class="num muted">'+r.distinct+'</td>'
         + '<td class="num">'+(r.count/pfTotal*100).toFixed(0)+'%</td></tr>';
    }
    h += '</table></div>';
    h += '<div class="sub" style="margin-top:10px"><span class="t">モバイル</span>'
       + '<span class="i">全体に占める割合 <b>'+(mob/pfTotal*100).toFixed(0)+'%</b></span>'
       + '<span class="i">うち iOS <b>'+(mob?(ios/mob*100).toFixed(0):'—')+'%</b></span>'
       + '<span class="i">うち Android <b>'+(mob?((mob-ios)/mob*100).toFixed(0):'—')+'%</b></span></div>';
  }
  h += '</section>';
  h += '</div>';

  // 7. 参考情報（折りたたみ）
  h += '<div class="band"><h2>参考</h2></div>';
  h += '<details><summary>ボットUA 上位 <span>'+d.botUa.length+'件</span></summary><div class="in"><div class="wrap"><table><tr><th class="num">件数</th><th>User-Agent</th></tr>';
  for(const r of d.botUa){ h += '<tr><td class="num">'+r.count+'</td><td class="ref">'+esc(r.ua)+'</td></tr>'; }
  if(!d.botUa.length) h += '<tr><td class="muted" colspan="2">データなし</td></tr>';
  h += '</table></div></div></details>';

  h += '<details><summary>自分IP <span>'+d.selfIps.length+'件</span></summary><div class="in"><div class="iplist">';
  for(const ip of d.selfIps) h += '<span>'+esc(ip)+'</span>';
  if(!d.selfIps.length) h += '<span class="muted">なし</span>';
  h += '</div></div></details>';

  h += '<p class="foot"><span>集計時刻 '+esc(d.generatedAt)+'</span><span>対象ログファイル '+d.fileCount+'件・'+d.totalRows+'行</span><span>自分IP '+d.selfIps.length+'件</span></p>';
  $('#root').innerHTML = h;

  // 「どこで消えたか」を押すと行動列をその集団だけに絞る。
  // 同じ行を押したら解除（トグル）。データは取り直さず描き直すだけ。
  document.querySelectorAll('.drop-row').forEach(el=>{
    el.addEventListener('click', ()=>{
      jFilter = (jFilter === el.dataset.ev) ? null : el.dataset.ev;
      renderDeep(d);
    });
  });
  const clr = $('#j-clear');
  if(clr) clr.addEventListener('click', ()=>{ jFilter = null; renderDeep(d); });
  loadPlatforms($('#days').value);
}

// 「更新」は明示的な取り直し。キャッシュを捨ててから読む
$('#refresh').addEventListener('click', () => { statsCache = null; pfCache = {}; load(); });
$('#days').addEventListener('change', load); // 期間が変わればキャッシュのキーが外れる
$('#tab-status').addEventListener('click', () => setTab('status'));
$('#tab-access').addEventListener('click', () => setTab('access'));
$('#tab-deep').addEventListener('click', () => setTab('deep'));
$('#tab-feedback').addEventListener('click', () => setTab('feedback'));
$('#tab-inquiry').addEventListener('click', () => setTab('inquiry'));
// 初期表示も setTab を通す。直接 load() を呼ぶと期間セレクタの出し分けが効かない
setTab('status');
</script></body></html>`;

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  // localhost限定（外部バインド防止のためlistenも127.0.0.1）
  if (url.pathname === '/' || url.pathname === '/index.html') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(HTML);
    return;
  }
  if (url.pathname === '/api/feedback') {
    try {
      // 先に取得してから書き出す（writeHead の後に例外が出るとヘッダ二重送信で落ちるため）
      const data = getFeedback();
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(data));
    } catch (e) {
      res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }
  // 「状態」タブ。壊れていないかを1画面で見るための束ね。
  // AWS への問い合わせが複数走るため数秒かかる（毎日1回開くだけの想定）。
  if (url.pathname === '/api/status') {
    (async () => {
      try {
        const inq = (() => { try { return getInquiries(); } catch { return null; } })();
        const signals = getSignals();
        const headers = await getLiveHeaders();
        const data = {
          checks: getChecks(),
          signals,
          headers,
          judged: { csp: judgeCsp(headers), signals: judgeSignals(signals) },
          inquiriesWaiting: inq ? inq.waiting : null,
          generatedAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
        };
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(data));
      } catch (e) {
        res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: e.message }));
      }
    })();
    return;
  }
  if (url.pathname === '/api/inquiries') {
    try {
      const data = getInquiries();
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(data));
    } catch (e) {
      res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }
  if (url.pathname === '/api/inquiry-reply' && req.method === 'POST') {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 20000) req.destroy(); });
    req.on('end', () => {
      try {
        const b = JSON.parse(raw || '{}');
        if (!b.pk || !b.sk || !String(b.body || '').trim()) throw new Error('pk / sk / body が必要です');
        const data = replyInquiry(b.pk, b.sk, String(b.body).trim().slice(0, 2000), !!b.close);
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(data));
      } catch (e) {
        res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }
  // 端末別の利用。アクセスタブでは使わないので /api/stats とは別にした
  if (url.pathname === '/api/platforms') {
    const days = Math.min(180, Math.max(1, Number(url.searchParams.get('days')) || 14));
    try {
      const data = { platforms: getPlatforms(days) };
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(data));
    } catch (e) {
      res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }
  if (url.pathname === '/api/stats') {
    const days = Math.min(180, Math.max(1, Number(url.searchParams.get('days')) || 14));
    try {
      syncLogs(days);
      const data = analyze(days);
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(data));
    } catch (e) {
      res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }
  res.writeHead(404); res.end('not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  kurofukubo 管理ダッシュボード（localhost限定）`);
  console.log(`  → http://localhost:${PORT}`);
  console.log(`  AWSプロファイル: ${PROFILE}（未認証なら: aws sso login --profile ${PROFILE}）\n`);
});
