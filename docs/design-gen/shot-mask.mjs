// マスク機能の検証：既定（表示）と「全体非表示」クリック後を撮影。
import { chromium } from 'playwright';
import { buildDataset } from './seed-data.mjs';
const seed = JSON.stringify(buildDataset());
const b = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await b.newContext({ viewport: { width: 1440, height: 1200 }, deviceScaleFactor: 2 });
await ctx.addInitScript((ds) => {
  localStorage.setItem('kk4_guest', ds);
  localStorage.setItem('kk_guest', '1'); localStorage.setItem('kk_onboarded', '1');
  localStorage.setItem('kk_update_seen', '2027-12-31'); localStorage.setItem('kk_guest_promo', '1');
  localStorage.setItem('kk_recovery_saved', '1'); localStorage.setItem('kk_theme', 'light');
}, seed);
const p = await ctx.newPage();
await p.goto('http://localhost:4173/?guest', { waitUntil: 'networkidle' });
await p.waitForSelector('.s-item', { timeout: 30000 }).catch(() => {});
await p.waitForTimeout(800);
await p.screenshot({ path: 'shots/redesign-applied/mask-shown.png' });
await p.getByRole('button', { name: '全体非表示' }).click();
await p.waitForTimeout(500);
await p.screenshot({ path: 'shots/redesign-applied/mask-hidden.png' });
await ctx.close(); await b.close();
console.log('done: mask-shown.png / mask-hidden.png');
