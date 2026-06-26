// プレビューがAPIモードで動くか、CORS等でlocalStorageへフォールバックしているかを診断する。
import { chromium } from 'playwright';
const BASE = process.env.APP_URL || 'http://localhost:4188/';
const EMAIL = 'kk-e2e-verify-0617@example.com';
const LOGINPW = 'Verify-Pass-12345!';

const b = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addInitScript(() => {
  localStorage.setItem('kk_onboarded', '1'); localStorage.setItem('kk_update_seen', '2026-12-31');
  localStorage.setItem('kk_theme', 'light'); localStorage.setItem('kk_guest_promo', '1');
});
const p = await ctx.newPage();
p.on('console', (m) => console.log('[console]', m.type(), m.text()));
p.on('requestfailed', (r) => { if (/execute-api|amazonaws/.test(r.url())) console.log('[REQ-FAIL]', r.method(), r.url().slice(0, 90), r.failure()?.errorText); });
p.on('response', (r) => { if (/execute-api|amazonaws/.test(r.url()) && r.status() >= 400) console.log('[RESP>=400]', r.status(), r.request().method(), r.url().slice(0, 90)); });

await p.goto(BASE, { waitUntil: 'networkidle' });
await p.locator('input[type="email"]').fill(EMAIL);
await p.locator('input[type="password"]').fill(LOGINPW);
await p.getByRole('button', { name: 'ログイン', exact: true }).click();
await p.waitForSelector('.s-item', { timeout: 30000 }).catch(() => {});
await p.waitForTimeout(3000);

const ls = await p.evaluate(() => Object.keys(localStorage));
console.log('\n[localStorage keys after login]', JSON.stringify(ls));
console.log('[kk4 present (=local mode wrote data)]', ls.includes('kk4'));
// APIのオリジン許可確認: 直接 /api/encdata を fetch して CORS 結果を見る
const apiProbe = await p.evaluate(async () => {
  const keys = Object.keys(localStorage);
  const idKey = keys.find((k) => k.includes('CognitoIdentityServiceProvider') && k.endsWith('.idToken'));
  const token = idKey ? localStorage.getItem(idKey) : null;
  // APIベースURLはバンドル内。window配下にないので、典型prodパスを推定せず token有無だけ返す
  return { hasIdToken: !!token };
});
console.log('[cognito idToken in localStorage]', apiProbe.hasIdToken);
await ctx.close(); await b.close();
