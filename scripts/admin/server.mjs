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
const SELF_PREFIXES = ['240d:f:a2c:6300', '240d:1f:a2c:6300']; // 既知の自分IPプレフィックス（変動あり）
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
  const funnel = [
    { key: 'app_first', label: '起動（新規訪問）', count: n('app_first') },
    { key: 'auth_view', label: 'ログイン画面を見た', count: n('auth_view') },
    { key: 'guest_first', label: 'ゲスト開始', count: n('guest_first') },
    { key: 'first_journal', label: '初回記帳', count: n('first_journal') },
    { key: 'registered', label: '登録', count: n('registered') },
  ];
  const base = funnel[0].count;
  for (const f of funnel) f.rate = base ? Number(((f.count / base) * 100).toFixed(1)) : null;
  // ゲスト開始した人のうち記帳まで行った割合（入口を通過した後の詰まり具合）
  const gf = n('guest_first');
  const journalOfGuest = gf ? Number(((n('first_journal') / gf) * 100).toFixed(1)) : null;

  // 継続。分母は「ゲスト開始した人」。d1 ≥ d7 ≥ d30 の絞り込みになる。
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
    funnel, journalOfGuest, retention,
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
    byDay, bySrc, refs, botUa, events,
  };
}

const HTML = /* html */ `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>kurofukubo 管理ダッシュボード</title>
<style>
  /* kurofukubo ライトテーマ配色（frontend/src/styles/variables.css と同一） */
  :root{--bg:#e8eaed;--bg1:#ffffff;--bg2:#ffffff;--bg3:#f8fafa;--bd:#e6ebec;--bd2:#d7dde0;--tx:#23262d;--tx2:#71767f;--tx3:#93a09e;--ac:#0d9488;--ac2:#0b7d72;--acb:rgba(13,148,136,.10);--actx:#ffffff;--grn:#15a06a;--red:#e0556a;}
  *{box-sizing:border-box}
  body{margin:0;font-family:system-ui,"Segoe UI",sans-serif;background:var(--bg);color:var(--tx);font-size:14px;line-height:1.6}
  header{position:sticky;top:0;display:flex;align-items:center;gap:14px;padding:14px 20px;background:var(--bg1);border-bottom:1px solid var(--bd);z-index:5}
  header h1{font-size:16px;margin:0;font-weight:800}
  header .meta{font-size:12px;color:var(--tx3)}
  .grow{flex:1}
  select,button{font-family:inherit;font-size:13px;background:var(--bg);color:var(--tx);border:1px solid var(--bd);border-radius:8px;padding:7px 12px;cursor:pointer}
  button.primary{background:var(--ac);color:var(--actx);border-color:var(--ac);font-weight:700}
  button.primary:hover{background:var(--ac2);border-color:var(--ac2)}
  button:disabled{opacity:.5;cursor:default}
  main{padding:20px;max-width:1000px;margin:0 auto}
  .kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:22px}
  .kpi{background:var(--bg2);border:1px solid var(--bd);border-radius:14px;padding:14px 16px;box-shadow:0 1px 2px rgba(20,24,40,.04),0 14px 30px -20px rgba(20,24,40,.20)}
  .kpi .n{font-size:26px;font-weight:800;letter-spacing:-.02em;color:var(--tx)}
  .kpi .l{font-size:12px;color:var(--tx2);margin-top:2px}
  .kpi .s{font-size:11px;color:var(--tx3);margin-top:4px}
  section{background:var(--bg2);border:1px solid var(--bd);border-radius:14px;padding:16px 18px;margin-bottom:18px;box-shadow:0 1px 2px rgba(20,24,40,.04),0 14px 30px -20px rgba(20,24,40,.20)}
  section h2{font-size:13px;margin:0 0 12px;color:var(--tx2);font-weight:700;letter-spacing:.03em}
  table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
  th,td{text-align:left;padding:6px 10px;border-bottom:1px solid var(--bd);white-space:nowrap}
  th{color:var(--tx3);font-weight:600;font-size:12px}
  td.num,th.num{text-align:right}
  .bar{display:inline-block;height:8px;background:var(--ac);border-radius:4px;vertical-align:middle;margin-right:6px}
  .muted{color:var(--tx3)}
  .err{background:rgba(224,85,106,.10);border:1px solid var(--red);color:#a3243a;padding:14px 16px;border-radius:12px;white-space:pre-wrap;font-size:13px}
  .wrap{overflow-x:auto}
  .ref{white-space:normal;word-break:break-all;color:var(--tx2);font-size:12px}
  .tabs{display:flex;gap:4px}
  .tabs button{border-radius:999px}
  .tabs button.on{background:var(--acb);border-color:var(--ac);color:var(--ac);font-weight:700}
  .fb{border-bottom:1px solid var(--bd);padding:12px 0}
  .fb:last-child{border-bottom:0}
  .fb .when{font-size:11px;color:var(--tx3);margin-bottom:4px}
  .fb .body{white-space:pre-wrap;word-break:break-word;font-size:14px;line-height:1.8}
  .fn{display:grid;gap:8px}
  .fn-r{display:grid;grid-template-columns:150px 1fr 60px 60px;align-items:center;gap:10px}
  .fn-l{font-size:13px;color:var(--tx2)}
  .fn-b{background:var(--bg);border-radius:6px;height:22px;overflow:hidden}
  .fn-b span{display:block;height:100%;background:var(--ac);border-radius:6px}
  .fn-n,.fn-p{text-align:right;font-variant-numeric:tabular-nums;font-size:13px}
  .fn-n{font-weight:700}
  .fn-p{color:var(--tx3)}
  @media(max-width:640px){.fn-r{grid-template-columns:110px 1fr 48px 52px;gap:6px}.fn-l{font-size:12px}}
</style></head><body>
<header>
  <h1>📊 kurofukubo 管理ダッシュボード</h1>
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
function kpi(n, l, s){ return '<div class="kpi"><div class="n">'+n+'</div><div class="l">'+l+'</div>'+(s?'<div class="s">'+s+'</div>':'')+'</div>'; }

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
  let h = '<div class="kpis">';
  h += kpi(d.total, 'ご意見の総数', 'アプリ内アンケート');
  h += kpi(d.byMonth[0] ? d.byMonth[0].count : 0, '今月分', d.byMonth[0] ? d.byMonth[0].month : '—');
  h += '</div>';

  if(d.byMonth.length){
    h += '<section><h2>月別の件数</h2><div class="wrap"><table><tr><th>月</th><th class="num">件数</th></tr>';
    for(const m of d.byMonth) h += '<tr><td>'+esc(m.month)+'</td><td class="num">'+m.count+'</td></tr>';
    h += '</table></div></section>';
  }

  h += '<section><h2>ご意見（新しい順）</h2>';
  if(!d.items.length){
    h += '<p class="muted">まだ届いていません。</p>';
  }else{
    for(const it of d.items){
      h += '<div class="fb"><div class="when">'+esc((it.timestamp||'').replace('T',' ').slice(0,16))+'</div>'
         + '<div class="body">'+esc(it.body)+'</div></div>';
    }
  }
  h += '</section>';
  h += '<p class="muted" style="font-size:12px">匿名で保存されているため、送信者は特定できません。取得時刻: '+esc(d.generatedAt)+'</p>';
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
  const has = f.some(x => x.count > 0);
  let h = '<section><h2>獲得ファネル（人数・起動を100%とした割合）</h2>';
  if(!has){
    h += '<p class="muted">計測イベントの配信直後です。数字が入るまで1日ほどお待ちください。'
       + '（既存の利用者は初回起動が済んでいるため、しばらくは実態より少なく出ます）</p>';
  }else{
    const max = Math.max(...f.map(x=>x.count), 1);
    h += '<div class="fn">';
    for(const s of f){
      const w = Math.round((s.count / max) * 100);
      h += '<div class="fn-r"><div class="fn-l">'+esc(s.label)+'</div>'
         + '<div class="fn-b"><span style="width:'+w+'%"></span></div>'
         + '<div class="fn-n">'+s.count+'人</div>'
         + '<div class="fn-p">'+(s.rate==null?'—':s.rate+'%')+'</div></div>';
    }
    h += '</div>';
    if(d.events.journalOfGuest!=null){
      h += '<p class="muted" style="font-size:12px;margin:10px 0 0">'
         + 'ゲスト開始した人のうち記帳まで到達: <strong>'+d.events.journalOfGuest+'%</strong></p>';
    }
  }
  h += '</section>';

  const r = d.events.retention || [];
  h += '<section><h2>継続（ゲスト開始した人を分母）</h2>';
  if(!r.some(x=>x.count>0)){
    h += '<p class="muted">まだ計測できていません。retain_d1 は配信の翌日以降、d7 は7日後以降に出はじめます。</p>';
  }else{
    h += '<div class="wrap"><table><tr><th>区分</th><th class="num">人数</th><th class="num">継続率</th></tr>';
    for(const x of r) h += '<tr><td>'+esc(x.label)+'</td><td class="num">'+x.count+'</td><td class="num">'+(x.rate==null?'—':x.rate+'%')+'</td></tr>';
    h += '</table></div>';
  }
  h += '<p class="muted" style="font-size:12px;margin:10px 0 0">'
     + '起動回数(app_open) '+(d.events.appOpen||0)+' ／ 既存ゲストの再訪(guest_return) '+(d.events.guestReturn||0)+'</p>';
  h += '</section>';
  return h;
}

function render(d){
  $('#period').textContent = d.period.from ? (d.period.from+' 〜 '+d.period.to+'（直近'+d.period.days+'日）') : 'データなし';
  const o = d.opens;
  let h = '<div class="kpis">';
  h += kpi(d.registeredUsers==null?'—':d.registeredUsers, '登録ユーザー数', 'Cognito（数日ラグあり）');
  h += kpi(o.human, '人間の訪問（オープン）', '実人数(distinct IP) '+o.humanDistinct);
  h += kpi(o.humanDistinct, '実人数', '重複IPを除いた人数');
  const ev = Object.fromEntries(d.events.total.map(e=>[e.name,e.count]));
  h += kpi(ev.guest_start||0, 'ゲスト開始', 'guest_start');
  h += kpi(ev.journal_added||0, 'ゲスト記帳イベント', 'journal_added');
  h += kpi(d.events.activation==null?'—':d.events.activation, 'アクティベーション', '記帳/ゲスト開始');
  h += kpi(o.bot, 'ボット', 'self(自分) '+o.self);
  h += '</div>';

  h += funnelSection(d);

  // 日別オープン
  h += '<section><h2>日別オープン（人間 / bot / self）</h2><div class="wrap"><table><tr><th>日付</th><th class="num">人間</th><th class="num">bot</th><th class="num">self</th></tr>';
  const maxH = Math.max(1, ...d.byDay.map(r=>r.human));
  for(const r of d.byDay){ h += '<tr><td>'+r.date+'</td><td class="num"><span class="bar" style="width:'+Math.round(r.human/maxH*70)+'px"></span>'+r.human+'</td><td class="num muted">'+r.bot+'</td><td class="num muted">'+r.self+'</td></tr>'; }
  if(!d.byDay.length) h += '<tr><td class="muted" colspan="4">データなし</td></tr>';
  h += '</table></div></section>';

  // 媒体別
  h += '<section><h2>人間の流入 媒体別（utm_sourceのみ。タグ無しは媒体不明）</h2><div class="wrap"><table><tr><th>媒体</th><th class="num">件数</th><th class="num">実人数</th></tr>';
  for(const r of d.bySrc){ h += '<tr><td>'+esc(r.src)+'</td><td class="num">'+r.count+'</td><td class="num muted">'+r.distinct+'</td></tr>'; }
  if(!d.bySrc.length) h += '<tr><td class="muted" colspan="3">データなし</td></tr>';
  h += '</table></div></section>';

  // 自前イベント日別
  h += '<section><h2>自前イベント計測 /_e/*（bot・self除外）</h2><div class="wrap"><table><tr><th>種別</th><th class="num">合計</th></tr>';
  for(const e of d.events.total){ h += '<tr><td>'+esc(e.name)+'</td><td class="num">'+e.count+'</td></tr>'; }
  if(!d.events.total.length) h += '<tr><td class="muted" colspan="2">まだイベントがありません</td></tr>';
  h += '</table></div>';
  if(d.events.byDay.length){
    h += '<div class="wrap" style="margin-top:12px"><table><tr><th>日付</th><th>内訳</th></tr>';
    for(const r of d.events.byDay){ h += '<tr><td>'+r.date+'</td><td class="muted">'+esc(Object.entries(r.counts).map(([n,c])=>n+'='+c).join('  '))+'</td></tr>'; }
    h += '</table></div>';
  }
  h += '</section>';

  // 参照元
  h += '<section><h2>参照元 上位</h2><div class="wrap"><table><tr><th class="num">件数</th><th>Referer</th></tr>';
  for(const r of d.refs){ h += '<tr><td class="num">'+r.count+'</td><td class="ref">'+esc(r.ref)+'</td></tr>'; }
  if(!d.refs.length) h += '<tr><td class="muted" colspan="2">データなし</td></tr>';
  h += '</table></div></section>';

  // ボットUA
  h += '<section><h2>ボットUA 上位（参考）</h2><div class="wrap"><table><tr><th class="num">件数</th><th>User-Agent</th></tr>';
  for(const r of d.botUa){ h += '<tr><td class="num">'+r.count+'</td><td class="ref">'+esc(r.ua)+'</td></tr>'; }
  if(!d.botUa.length) h += '<tr><td class="muted" colspan="2">データなし</td></tr>';
  h += '</table></div></section>';

  h += '<p class="muted" style="font-size:12px">集計時刻: '+esc(d.generatedAt)+' ／ 対象ログファイル '+d.fileCount+'件・'+d.totalRows+'行 ／ 自分IP: '+(d.selfIps.join(', ')||'なし')+'</p>';
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
