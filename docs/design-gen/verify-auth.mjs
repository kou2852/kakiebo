// 検証: メール新規登録の一時停止告知（ログイン画面＋登録モード）
import { chromium } from 'playwright';
const BASE = process.env.APP_URL || 'http://localhost:4173/';
const shot = (p, n) => p.screenshot({ path: new URL(`./shots/${n}`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });

const b = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
await p.goto(BASE, { waitUntil: 'networkidle' });
await p.waitForTimeout(900);

const loginText = await p.locator('body').innerText();
console.log('ログイン画面に一時停止の告知:', loginText.includes('新規登録は一時停止'));
await shot(p, 'auth-login.png');

// 登録(signup)モードへ: ゲストで試す → ゲスト促進モーダルの「登録」導線
const guest = p.getByRole('button', { name: /ゲストとして試す/ });
if (await guest.count()) {
  await guest.click();
  await p.waitForTimeout(1000);
  // 促進モーダル等から登録(signup)へ誘導するボタンを探す
  const reg = p.getByRole('button', { name: /登録|アカウント/ });
  if (await reg.count()) { await reg.first().click(); await p.waitForTimeout(900); }
  const t2 = await p.locator('body').innerText();
  console.log('登録モードに停止パネル:', t2.includes('メールアドレスでの新規登録は現在一時停止'));
  await shot(p, 'auth-signup.png');
}

await ctx.close(); await b.close();
console.log('DONE');
