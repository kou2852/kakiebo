// CloudFront(app)アクセスログ解析：オープン限定＋ボット除外＋self(selftest/自分IP)除外で人間流入を集計。
// フィールド(0-indexed tab): 0=date,1=time,4=c-ip,7=uri-stem,8=status,9=referer,10=ua,11=uri-query
import { readdirSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const DIR = process.argv[2] || `${process.env.TEMP}\\cflogs-20260626`;
const SELF_PREFIXES = ['240d:f:a2c:6300', '240d:1f:a2c:6300']; // 既知プレフィックス（要確認・変動あり）
const BOT = /bot|spider|crawl|ruby|preview|slurp|fetch|facebookexternalhit|embedly|monitoring|headless|curl|wget|python-requests/i;

const files = readdirSync(DIR).filter((f) => f.endsWith('.gz'));
const rows = [];
for (const f of files) {
  const txt = gunzipSync(readFileSync(`${DIR}/${f}`)).toString('utf8');
  for (const line of txt.split('\n')) {
    if (!line || line[0] === '#') continue;
    const c = line.split('\t');
    if (c.length < 12) continue;
    rows.push({ date: c[0], ip: c[4], uri: c[7], status: c[8], ref: c[9], ua: c[10], q: c[11] });
  }
}

const dec = (s) => { try { return decodeURIComponent(s); } catch { return s; } };
const isSelfPrefix = (ip) => SELF_PREFIXES.some((p) => ip.startsWith(p));

// selftestを送ったIP＝自分とみなす
const selfIps = new Set();
for (const r of rows) if (/selftest/i.test(dec(r.q))) selfIps.add(r.ip);
const isSelf = (ip) => isSelfPrefix(ip) || selfIps.has(ip);

const dates = rows.map((r) => r.date).filter(Boolean).sort();
const opens = rows.filter((r) => r.uri === '/' || r.uri === '/index.html');
const isBot = (r) => BOT.test(r.ua);

const humanOpens = opens.filter((r) => !isBot(r) && !isSelf(r.ip));
const botOpens = opens.filter((r) => isBot(r));
const selfOpens = opens.filter((r) => !isBot(r) && isSelf(r.ip));

const srcOf = (r) => {
  const q = dec(r.q);
  const m = q.match(/utm_source=([a-z0-9_]+)/i);
  return m ? m[1].toLowerCase() : '(無印=X想定)';
};

const bySrc = {};
const ipsBySrc = {};
for (const r of humanOpens) {
  const s = srcOf(r);
  bySrc[s] = (bySrc[s] || 0) + 1;
  (ipsBySrc[s] ||= new Set()).add(r.ip);
}
const humanIps = new Set(humanOpens.map((r) => r.ip));

console.log('=== CloudFront app ログ解析 ===');
console.log(`ファイル数: ${files.length} / 総リクエスト行: ${rows.length}`);
console.log(`期間: ${dates[0]} 〜 ${dates[dates.length - 1]}`);
console.log(`検出した自分IP(selftest送信): ${[...selfIps].join(', ') || 'なし'}`);
console.log('');
console.log(`オープン(uri=/ or /index.html) 総数: ${opens.length}`);
console.log(`  ├ ボット: ${botOpens.length}`);
console.log(`  ├ 自分(self): ${selfOpens.length}`);
console.log(`  └ 人間: ${humanOpens.length}（実人数=distinct IP: ${humanIps.size}）`);
console.log('');
console.log('人間オープンの媒体別（utm_source／無印=X想定）:');
for (const [s, n] of Object.entries(bySrc).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${s}: ${n}件 (実人数 ${ipsBySrc[s].size})`);
}
console.log('');
console.log('人間オープンの参照元 上位:');
const refs = {};
for (const r of humanOpens) { const k = r.ref && r.ref !== '-' ? r.ref : '(直接/なし)'; refs[k] = (refs[k] || 0) + 1; }
for (const [k, n] of Object.entries(refs).sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`  ${n}  ${k}`);
console.log('');
console.log('ボットUA 上位（参考）:');
const bots = {};
for (const r of botOpens) { bots[r.ua] = (bots[r.ua] || 0) + 1; }
for (const [k, n] of Object.entries(bots).sort((a, b) => b[1] - a[1]).slice(0, 6)) console.log(`  ${n}  ${k.slice(0, 70)}`);
