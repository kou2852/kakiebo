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
import { readdirSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
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
const CACHE_DIR = join(__dirname, '.cache-cflogs');

// analyze-cflogs.mjs と同一の判定ルール
// 既知の自分IPプレフィックス（変動あり）。IPv6は再接続で変わるため、増えたら追記する。
// 判定は前方一致なので、除外漏れに気づいたら `curl https://api64.ipify.org` で現IPを確認して足す。
const SELF_PREFIXES = ['240d:f:a2c:6300', '240d:1f:a2c:6300', '240f:6e:e188:'];
const BOT = /bot|spider|crawl|checker|ruby|preview|slurp|fetch|facebookexternalhit|embedly|monitoring|headless|curl|wget|python-requests|python-httpx|okhttp|axios|node-fetch|libwww|winhttp|go-http-client|scan|nmap|nikto|sqlmap|masscan|censys|shodan|palo alto networks/i;
const SUSPICIOUS_QUERY = /phpinfo|\.env(\W|$)|wp-admin|wp-login|eval\(|union(\s|%20)+select|\.\.\/|etc\/passwd/i;
const dec = (s) => { try { return decodeURIComponent(s); } catch { return s; } };
// 現行ブラウザは自動更新されるため、極端に古いバージョン文字列は偽装/スキャンツールの兆候
const isOutdatedUa = (ua) => {
  const chrome = ua.match(/Chrome\/(\d+)/);
  if (chrome && Number(chrome[1]) < 110) return true;
  const ios = ua.match(/CPU iPhone OS (\d+)_/);
  if (ios && Number(ios[1]) < 15) return true;
  return false;
};

// 直近 days 日ぶんの日付文字列(YYYY-MM-DD)を返す
function lastDays(days) {
  const out = [];
  const now = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(now.getTime() - i * 86400000);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

// S3から直近days日ぶんのログを増分同期（ファイル名: app/<distId>.YYYY-MM-DD-HH.hash.gz）
function syncLogs(days) {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
  const includes = [];
  for (const d of lastDays(days)) { includes.push('--include', `*.${d}-*.gz`); }
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

// 登録ユーザー数（Cognito）。件数のみ取得しPII(メール等)は一切扱わない。
// EstimatedNumberOfUsers はCognito側で定期更新のため数日ラグが出ることがある。
function getRegisteredUsers() {
  const r = spawnSync('aws', [
    'cognito-idp', 'describe-user-pool', '--user-pool-id', USER_POOL_ID,
    '--query', 'UserPool.EstimatedNumberOfUsers', '--output', 'text', '--profile', PROFILE,
  ], { encoding: 'utf8' });
  if (r.status !== 0) return null; // 認証切れ等でも他の数字は出す
  const n = Number((r.stdout || '').trim());
  return Number.isFinite(n) ? n : null;
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
function analyze(days) {
  const wanted = new Set(lastDays(days));
  const files = existsSync(CACHE_DIR) ? readdirSync(CACHE_DIR).filter((f) => f.endsWith('.gz')) : [];
  const rows = [];
  for (const f of files) {
    let txt;
    try { txt = gunzipSync(readFileSync(join(CACHE_DIR, f))).toString('utf8'); } catch { continue; }
    for (const line of txt.split('\n')) {
      if (!line || line[0] === '#') continue;
      const c = line.split('\t');
      if (c.length < 12) continue;
      if (!wanted.has(c[0])) continue; // 期間外を除外
      rows.push({ date: c[0], time: c[1], ip: c[4], uri: c[7], status: c[8], ref: c[9], ua: c[10], q: c[11] });
    }
  }

  // self判定: selftestクエリを送ったIP + 既知プレフィックス
  const selfIps = new Set();
  for (const r of rows) if (/selftest/i.test(dec(r.q))) selfIps.add(r.ip);
  const isSelf = (ip) => SELF_PREFIXES.some((p) => ip.startsWith(p)) || selfIps.has(ip);

  const dates = rows.map((r) => r.date).filter(Boolean).sort();
  const opens = rows.filter((r) => r.uri === '/' || r.uri === '/index.html');

  // バースト検知: 同一IP+UA+同一秒に3回以上のオープンは人間の閲覧挙動ではなく自動スキャン
  const burstKey = (r) => r.ip + '|' + r.ua + '|' + r.date + '|' + r.time;
  const burstCount = {};
  for (const r of opens) { const k = burstKey(r); burstCount[k] = (burstCount[k] || 0) + 1; }
  const isBot = (r) => BOT.test(dec(r.ua)) || SUSPICIOUS_QUERY.test(dec(r.q)) || burstCount[burstKey(r)] >= 3 || isOutdatedUa(dec(r.ua));

  const humanOpens = opens.filter((r) => !isBot(r) && !isSelf(r.ip));
  const botOpens = opens.filter((r) => isBot(r));
  const selfOpens = opens.filter((r) => !isBot(r) && isSelf(r.ip));
  const humanIps = new Set(humanOpens.map((r) => r.ip));

  // 日別オープン
  const byDayMap = {};
  for (const r of opens) {
    const d = (byDayMap[r.date] ||= { human: 0, bot: 0, self: 0 });
    if (isBot(r)) d.bot++; else if (isSelf(r.ip)) d.self++; else d.human++;
  }
  const byDay = Object.entries(byDayMap).sort().map(([date, c]) => ({ date, ...c }));

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

  // 参照元 上位
  const refCnt = {};
  for (const r of humanOpens) { const k = r.ref && r.ref !== '-' ? r.ref : '(直接/なし)'; refCnt[k] = (refCnt[k] || 0) + 1; }
  const refs = Object.entries(refCnt).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([ref, count]) => ({ ref, count }));

  // ボットUA 上位
  const botCnt = {};
  for (const r of botOpens) botCnt[r.ua] = (botCnt[r.ua] || 0) + 1;
  const botUa = Object.entries(botCnt).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([ua, count]) => ({ ua, count }));

  // 自前イベント計測(/_e/*、bot/self除外)
  const evTotal = {}, evByDayMap = {};
  for (const r of rows) {
    const m = r.uri && r.uri.match(/^\/_e\/([a-z0-9_-]+)$/i);
    if (!m || isBot(r) || isSelf(r.ip)) continue;
    const name = m[1];
    evTotal[name] = (evTotal[name] || 0) + 1;
    ((evByDayMap[r.date] ||= {})[name] = (evByDayMap[r.date][name] || 0) + 1);
  }
  const gs = evTotal['guest_start'] || 0, ja = evTotal['journal_added'] || 0;
  const n = (k) => evTotal[k] || 0;

  // 獲得ファネル。各段はブラウザごとに1回だけ発火するイベント＝「人数」として読める。
  // 起動(app_first)を分母に、どこで落ちているかを見る。
  // auth_view はここに入れない：?guest で来た人はログイン画面を通らないため、
  // 「ログイン画面を見た」は「ゲスト開始」の上位集合にならず、前段比が意味を持たない。
  const funnel = [
    { key: 'app_first', label: '起動（新規訪問）', count: n('app_first') },
    { key: 'guest_first', label: 'ゲスト開始', count: n('guest_first') },
    { key: 'first_journal', label: '初回記帳', count: n('first_journal') },
    { key: 'registered', label: '登録', count: n('registered') },
  ];
  const base = funnel[0].count;
  for (const f of funnel) f.rate = base ? Number(((f.count / base) * 100).toFixed(1)) : null;

  // 入口の内訳。ログイン画面に当たった人と、LPから ?guest で直行した人の比率。
  const av = n('auth_view');
  const entry = {
    authView: av,
    authRate: base ? Number(((av / base) * 100).toFixed(1)) : null,
    direct: Math.max(0, base - av),
    directRate: base ? Number((((base - av) / base) * 100).toFixed(1)) : null,
  };

  // 継続。分母は「ゲスト開始した人」。d1 ≥ d7 ≥ d30 の絞り込みになる。
  const gf = n('guest_first');
  const retention = [
    { key: 'retain_d1', label: '翌日以降に再訪', count: n('retain_d1') },
    { key: 'retain_d7', label: '7日以降に再訪', count: n('retain_d7') },
    { key: 'retain_d30', label: '30日以降に再訪', count: n('retain_d30') },
  ];
  for (const r of retention) r.rate = gf ? Number(((r.count / gf) * 100).toFixed(1)) : null;

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
    registeredUsers: getRegisteredUsers(),
    fileCount: files.length,
    totalRows: rows.length,
    selfIps: [...selfIps],
    opens: {
      total: opens.length, bot: botOpens.length, self: selfOpens.length,
      human: humanOpens.length, humanDistinct: humanIps.size,
    },
    byDay, bySrc, byArticle, byDevice, refs, botUa, events,
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
    <button id="tab-access" class="on">アクセス</button>
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
  registered:      {g:'獲得',    ja:'登録',                   u:'人'},
  retain_d1:       {g:'継続',    ja:'1日後に再訪',            u:'人'},
  retain_d7:       {g:'継続',    ja:'7日後に再訪',            u:'人'},
  retain_d30:      {g:'継続',    ja:'30日後に再訪',           u:'人'},
  account_deleted: {g:'継続',    ja:'退会',                   u:'人'},
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

let tab = 'access';

function setTab(t){
  tab = t;
  $('#tab-access').className = t==='access' ? 'on' : '';
  $('#tab-feedback').className = t==='feedback' ? 'on' : '';
  // 期間の切替はアクセスタブでしか意味がないため隠す
  $('#period-picker').style.display = t==='access' ? '' : 'none';
  $('#period').style.display = t==='access' ? '' : 'none';
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

async function load(){
  if(tab==='feedback') return loadFeedback();
  const days = $('#days').value;
  $('#refresh').disabled = true; $('#refresh').textContent = '取得中…';
  $('#root').innerHTML = '<p class="muted">S3からログを同期して集計中…（初回・長期間は少し時間がかかります）</p>';
  try{
    const r = await fetch('/api/stats?days='+days);
    const d = await r.json();
    if(!r.ok || d.error){ $('#root').innerHTML = '<div class="err">'+esc(d.error||'エラー')+'</div>'; return; }
    render(d);
  }catch(e){ $('#root').innerHTML = '<div class="err">'+esc(e.message)+'</div>'; }
  finally{ $('#refresh').disabled = false; $('#refresh').textContent = '更新'; }
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
  h += lead(d.registeredUsers==null?'—':d.registeredUsers, '人', '登録ユーザー数', 'Cognito（数日ラグあり）', true);
  h += lead(o.humanDistinct, '人', '実人数', '重複IPを除いた人数');
  h += lead(o.human, '回', '人間の訪問（オープン）', '1人あたり '+(o.humanDistinct?(o.human/o.humanDistinct).toFixed(1):'—')+'回');
  h += '</div>';
  h += '<div class="sub"><span class="t">ノイズ</span>'
     + '<span class="i">ボット <b>'+o.bot+'</b> 回</span>'
     + '<span class="i">self（自分） <b>'+o.self+'</b> 回</span>'
     + '<span class="i">全オープン <b>'+o.total+'</b> 回</span></div>';

  // 2. ファネルと継続
  h += '<div class="band"><h2>獲得と継続</h2><span class="hint">2026-08-02に計測開始。最初の数日は既存利用者の分が新規として上乗せされる</span></div>';
  h += funnelSection(d);

  // 3. 日別オープン（人間 / bot を別スケールで）
  h += '<div class="band"><h2>推移</h2><span class="hint">直近'+d.period.days+'日</span></div>';
  h += '<section><h3>日別オープン <small>人間（回）</small></h3>';
  if(!d.byDay.length){
    h += '<p class="muted">データなし</p>';
  }else{
    const maxH = Math.max(1, ...d.byDay.map(r=>r.human));
    const maxB = Math.max(1, ...d.byDay.map(r=>r.bot));
    h += '<div class="chart">';
    for(const r of d.byDay){
      const md = r.date.slice(5).replace('-','/');
      h += '<div class="col" title="'+r.date+' 人間'+r.human+' / bot'+r.bot+' / self'+r.self+'">'
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
  h += '</table></div></section>';
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
}

$('#refresh').addEventListener('click', load);
$('#days').addEventListener('change', load);
$('#tab-access').addEventListener('click', () => setTab('access'));
$('#tab-feedback').addEventListener('click', () => setTab('feedback'));
load();
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
