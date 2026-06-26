// チートシート＆かんたんモードのモバイル崩れ確認。要 preview。
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const BASE = process.env.SHOT_BASE || 'http://localhost:4173/?guest';
const OUT = 'shots/cheat'; mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true });
await ctx.addInitScript(() => {
  localStorage.setItem('kk_guest', '1'); localStorage.setItem('kk_onboarded', '1');
  localStorage.setItem('kk_theme', 'light'); localStorage.setItem('kk_setup_dismissed', '1'); localStorage.setItem('kk_guest_promo', '1');
});
const p = await ctx.newPage();
await p.goto(BASE, { waitUntil: 'networkidle' });
await p.waitForSelector('.hamburger', { timeout: 30000 });
// モバイルはサイドバーがオフキャンバス。ハンバーガーで開いてから遷移。
async function go(label) {
  await p.locator('.hamburger').first().click();
  await p.waitForTimeout(400);
  await p.locator('.s-item', { hasText: label }).first().click();
  await p.waitForTimeout(700);
}
await go('操作ガイド');
await p.locator('text=仕訳チートシート').scrollIntoViewIfNeeded();
await p.waitForTimeout(300);
await p.screenshot({ path: `${OUT}/m1-cheatsheet.png` });
await go('仕訳入力');
await p.screenshot({ path: `${OUT}/m2-simple.png` });
const w = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
console.log('overflow?', w.sw > w.cw + 1 ? `はみ出しあり sw=${w.sw} cw=${w.cw}` : 'なし(OK)');
await b.close();
console.log('✅ 完了 →', OUT);
