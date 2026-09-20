// SEO計画（docs/seo-plan-2026-08.md）の検算スクリプト。
// 除外ルールは scripts/admin/server.mjs と同一のものを写している（UA正規表現・不審クエリ・
// 同一秒バースト・古すぎるUA・self判定の5段階）。ここを変えると計画中の数値が再現しなくなる。
//
// 使い方: node scripts/admin/verify-seo-2026-08.mjs <開始JST日> <終了JST日>
//   例: node scripts/admin/verify-seo-2026-08.mjs 2026-08-02 2026-08-14
//
// 出すもの:
//   1. /_e/ イベント別の distinct IP  ← 内訳の合計がこれを超えたら計算違い（B2）
//   2. 記事別アプリ着地（utm_content）。バケツは相互排他。のべIP合算と実数の差も出す
//   3. utm_content 付きIPが app_open を撃ったか（JS未実行のクローラー除け／D2）
//   4. 日別 distinct 端末
//   5. 参照元ホスト
//   6. 媒体別（utm_source）。相互排他
import { readdirSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(__dirname, '.cache-cflogs');

const SELF_PREFIXES = ['240d:f:a2c:6300', '240d:1f:a2c:6300', '240f:6e:e188:'];
const BOT = /bot|spider|crawl|checker|ruby|preview|slurp|fetch|facebookexternalhit|embedly|monitoring|headless|curl|wget|python-requests|python-httpx|okhttp|axios|node-fetch|libwww|winhttp|go-http-client|scan|nmap|nikto|sqlmap|masscan|censys|shodan|palo alto networks/i;
const SUSPICIOUS_QUERY = /phpinfo|\.env(\W|$)|wp-admin|wp-login|eval\(|union(\s|%20)+select|\.\.\/|etc\/passwd/i;
const dec = (s) => { try { return decodeURIComponent(s); } catch { return s; } };
const isOutdatedUa = (ua) => {
  const chrome = ua.match(/Chrome\/(\d+)/); if (chrome && Number(chrome[1]) < 110) return true;
  const ios = ua.match(/CPU iPhone OS (\d+)_/); if (ios && Number(ios[1]) < 15) return true;
  return false;
};
const JST = 9 * 3600 * 1000;
const jstDay = (d, t) => new Date(Date.parse(`${d}T${t}Z`) + JST).toISOString().slice(0, 10);

const [from, to] = process.argv.slice(2);
if (!from || !to) { console.error('usage: node verify-seo-2026-08.mjs FROM TO'); process.exit(1); }

const rows = [];
const selfIps = new Set(); // 期間外の行からも拾う（server.mjs と同じ理由）
for (const f of readdirSync(CACHE_DIR).filter((x) => x.endsWith('.gz'))) {
  let txt; try { txt = gunzipSync(readFileSync(join(CACHE_DIR, f))).toString('utf8'); } catch { continue; }
  for (const line of txt.split('\n')) {
    if (!line || line[0] === '#') continue;
    const c = line.split('\t'); if (c.length < 12) continue;
    if (/selftest/i.test(dec(c[11]))) selfIps.add(c[4]);
    const date = jstDay(c[0], c[1]);
    if (date < from || date > to) continue;
    rows.push({ date, time: c[1], ip: c[4], uri: c[7], ref: c[9], ua: c[10], q: c[11] });
  }
}
const isSelf = (ip) => SELF_PREFIXES.some((p) => ip.startsWith(p)) || selfIps.has(ip);
const opens = rows.filter((r) => r.uri === '/' || r.uri === '/index.html');
const burstKey = (r) => r.ip + '|' + r.ua + '|' + r.date + '|' + r.time;
const burst = {}; for (const r of opens) burst[burstKey(r)] = (burst[burstKey(r)] || 0) + 1;
const isBot = (r) => BOT.test(dec(r.ua)) || SUSPICIOUS_QUERY.test(dec(r.q)) || burst[burstKey(r)] >= 3 || isOutdatedUa(dec(r.ua));
const humanOpens = opens.filter((r) => !isBot(r) && !isSelf(r.ip));

console.log(`=== 期間 ${from} 〜 ${to} (JST) ===`);

// 1. イベント別 distinct IP
const ev = {};
for (const r of rows) {
  const m = r.uri.match(/^\/_e\/(.+)$/); if (!m) continue;
  if (isBot(r) || isSelf(r.ip)) continue;
  (ev[m[1]] ||= new Set()).add(r.ip);
}
console.log('--- /_e/ イベント別 distinct IP（ボット・自分IP除外後）= 内訳合計の上限 ---');
for (const [k, v] of Object.entries(ev).sort((a, b) => b[1].size - a[1].size)) console.log(`${String(v.size).padStart(4)}  ${k}`);

// 2. 記事別アプリ着地（相互排他）
const art = {}, artIps = {};
for (const r of humanOpens) {
  const m = dec(r.q).match(/utm_content=([a-z0-9_-]+)/i);
  const k = m ? m[1].toLowerCase() : '(utm_content無し)';
  art[k] = (art[k] || 0) + 1; (artIps[k] ||= new Set()).add(r.ip);
}
console.log('--- 記事別アプリ着地（utm_content・相互排他）---');
let sumCnt = 0; const allIps = new Set();
for (const [k, v] of Object.entries(art).sort((a, b) => b[1] - a[1])) {
  console.log(`${String(v).padStart(4)}回 ${String(artIps[k].size).padStart(3)}IP  ${k}`);
  sumCnt += v; for (const ip of artIps[k]) allIps.add(ip);
}
console.log(`合計 ${sumCnt}回 / のべIP合算 ${Object.values(artIps).reduce((a, s) => a + s.size, 0)} / distinct IP実数 ${allIps.size} ← 差は複数バケツに跨るIP`);
console.log(`humanOpens 総数 ${humanOpens.length}（記事別合計と一致するはず）`);

// 3. utm_content 付きIPが app_open を撃ったか
const appOpenIps = ev['app_open'] || new Set();
for (const [k, s] of Object.entries(artIps)) {
  if (k === '(utm_content無し)') continue;
  console.log(`  ${k}: distinct ${s.size} のうち app_open あり ${[...s].filter((ip) => appOpenIps.has(ip)).length}`);
}

// 4. 日別 distinct 端末
const byDay = {};
for (const r of humanOpens) (byDay[r.date] ||= new Set()).add(r.ip);
const ds = Object.entries(byDay).sort();
const vals = ds.map(([, s]) => s.size);
const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);
console.log(`--- 日別 distinct 端末: n=${vals.length} 平均 ${mean.toFixed(2)} 母SD ${sd.toFixed(2)} 最小 ${Math.min(...vals)} 最大 ${Math.max(...vals)}`);
console.log(ds.map(([d, s]) => `${d}:${s.size}`).join(' '));

// 5. 参照元ホスト
const ref = {};
for (const r of humanOpens) {
  const R = dec(r.ref);
  const k = R === '-' ? '(なし)' : (R.match(/^https?:\/\/([^/]+)/) || [, R])[1];
  ref[k] = (ref[k] || 0) + 1;
}
console.log('--- 参照元ホスト（human opens）---');
for (const [k, v] of Object.entries(ref).sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`${String(v).padStart(4)}  ${k}`);

// 6. 媒体別（相互排他）
const src = {}, srcIps = {};
for (const r of humanOpens) {
  const m = dec(r.q).match(/utm_source=([a-z0-9_]+)/i);
  const k = m ? m[1].toLowerCase() : '(utm_source無し)';
  src[k] = (src[k] || 0) + 1; (srcIps[k] ||= new Set()).add(r.ip);
}
console.log('--- 媒体別(utm_source)・人間のみ・相互排他 ---');
let s2 = 0;
for (const [k, v] of Object.entries(src).sort((a, b) => b[1] - a[1])) { console.log(`${String(v).padStart(4)}回 ${String(srcIps[k].size).padStart(3)}IP  ${k}`); s2 += v; }
console.log(`合計 ${s2}（humanOpens ${humanOpens.length} と一致するはず）`);
