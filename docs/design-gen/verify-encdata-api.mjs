// バックエンド /api/encdata の契約テスト（CORS非対象のNode fetchで実トークンを使用）。
// ブラウザでログイン→idToken取得→GET/POST(有効化)/GET/(解除) を直接叩く。
// DynamoDB側の確認(ENCDATA生成・平文zz1/zz2削除・PROFILE保持)は別途PowerShellで実施。
import { chromium } from 'playwright';

const APP = process.env.APP_URL || 'http://localhost:4188/';
const API = 'https://ecbjdndcbe.execute-api.ap-northeast-1.amazonaws.com/prod';
const EMAIL = 'kk-e2e-verify-0617@example.com';
const LOGINPW = 'Verify-Pass-12345!';

const b = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await b.newContext();
await ctx.addInitScript(() => { localStorage.setItem('kk_onboarded', '1'); localStorage.setItem('kk_update_seen', '2026-12-31'); });
const p = await ctx.newPage();
await p.goto(APP, { waitUntil: 'networkidle' });
await p.locator('input[type="email"]').fill(EMAIL);
await p.locator('input[type="password"]').fill(LOGINPW);
await p.getByRole('button', { name: 'ログイン', exact: true }).click();
await p.waitForSelector('.s-item', { timeout: 30000 }).catch(() => {});
await p.waitForTimeout(1500);
const { idToken, accessToken } = await p.evaluate(() => {
  const ks = Object.keys(localStorage);
  const f = (suf) => { const k = ks.find((x) => x.includes('CognitoIdentityServiceProvider') && x.endsWith(suf)); return k ? localStorage.getItem(k) : null; };
  return { idToken: f('.idToken'), accessToken: f('.accessToken') };
});
await ctx.close(); await b.close();
if (!idToken) { console.error('no idToken'); process.exit(1); }

const call = async (method, body, token) => {
  const res = await fetch(`${API}/api/encdata`, {
    method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let j = null; try { j = await res.json(); } catch {}
  return { status: res.status, body: j };
};

// どちらのトークンが通るか（id優先、ダメならaccess）
let TK = idToken;
let probe = await call('GET', null, TK);
if (probe.status === 401 && accessToken) { TK = accessToken; probe = await call('GET', null, TK); console.log('(using accessToken)'); }

console.log('1) GET /api/encdata (初期):', probe.status, JSON.stringify(probe.body));

const BUNDLE = { v: 1, salt: 'TESTSALT', wrapped: 'TESTWRAP', rsalt: 'R', rwrapped: 'RW' };
const CT = 'CONTRACT-TEST-CIPHERTEXT-OPAQUE-BLOB';
const post = await call('POST', { bundle: BUNDLE, ct: CT, clearPlaintext: true }, TK);
console.log('2) POST /api/encdata (有効化+clearPlaintext):', post.status, JSON.stringify(post.body));

const get2 = await call('GET', null, TK);
console.log('3) GET /api/encdata (保存後):', get2.status, 'bundle?', !!get2.body?.bundle, 'ctMatch?', get2.body?.ct === CT);

const passed = probe.status === 200 && (post.status === 200 || post.status === 201) && get2.body?.ct === CT && !!get2.body?.bundle;
console.log(`\n=== backend contract (GET/POST/clearPlaintext): ${passed ? 'PASS' : 'CHECK'} ===`);
console.log('>>> 次にDynamoDBで ENCDATA生成 / zz1・zz2削除 / PROFILE保持 を確認する（解除は別途）。');
