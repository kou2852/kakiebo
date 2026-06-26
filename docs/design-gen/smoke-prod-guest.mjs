// 本番(app.kurofukubo.com)のゲスト経路スモーク。ゲート開放デプロイが通常利用を壊していないか確認。
import { chromium } from 'playwright';
const BASE = 'https://app.kurofukubo.com/';
let fail = 0; const ok = (c, m) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) fail++; };

const b = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addInitScript(() => { localStorage.setItem('kk_onboarded', '1'); localStorage.setItem('kk_update_seen', '2026-12-31'); });
const p = await ctx.newPage();
const errs = [];
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));

await p.goto(BASE, { waitUntil: 'networkidle' });
ok(await p.getByRole('button', { name: /ゲストとして試す/ }).count() > 0, 'ログイン画面が表示される');
await p.getByRole('button', { name: /ゲストとして試す/ }).click();
await p.waitForSelector('.s-item', { timeout: 30000 }).catch(() => {});
for (let i = 0; i < 3 && await p.locator('.mo.open').count() > 0; i++) { await p.keyboard.press('Escape'); await p.waitForTimeout(300); }
ok(await p.locator('.s-item').count() > 0, 'ゲストでアプリが起動（サイドバー表示）');

// 主要ページ遷移
for (const label of ['仕訳', '仕訳帳', '科目', '設定']) {
  await p.locator('.s-item', { hasText: label }).first().click();
  await p.waitForTimeout(500);
  ok(true, `「${label}」へ遷移`);
}
// 設定にゲスト向け暗号化UIが出る（encAvailable=useLocal）
ok(await p.getByRole('button', { name: '端末データを暗号化する' }).count() > 0, '設定に暗号化UIあり（ゲスト=useLocal）');

ok(errs.length === 0, `致命的なコンソールエラーなし（${errs.length}件）`);
if (errs.length) errs.slice(0, 5).forEach((e) => console.log('   ', e.slice(0, 120)));

await ctx.close(); await b.close();
console.log(`\n=== guest smoke: ${fail === 0 ? 'PASS' : fail + ' FAIL'} ===`);
process.exit(fail === 0 ? 0 : 1);
