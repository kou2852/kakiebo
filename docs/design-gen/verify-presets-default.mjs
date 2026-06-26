// 新規ゲストに既定プリセット3件が出るか確認（kk4_guestを置かず＝loadLocalの新規分岐でDEFAULT_PRESETSが入る）。要 preview。
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const BASE = process.env.SHOT_BASE || 'http://localhost:4173/?guest';
const OUT = 'shots/presets'; mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await b.newContext({ viewport: { width: 1000, height: 760 }, deviceScaleFactor: 1 });
await ctx.addInitScript(() => {
  // kk4_guest はあえて置かない＝新規ユーザー扱いで既定データ(DEFAULT_PRESETS)を読む
  localStorage.setItem('kk_guest', '1'); localStorage.setItem('kk_onboarded', '1');
  localStorage.setItem('kk_theme', 'light'); localStorage.setItem('kk_setup_dismissed', '1'); localStorage.setItem('kk_guest_promo', '1');
});
const p = await ctx.newPage();
await p.goto(BASE, { waitUntil: 'networkidle' });
await p.waitForSelector('.s-item', { timeout: 30000 });
await p.waitForTimeout(600);
await p.locator('.s-item', { hasText: '仕訳入力' }).first().click();
await p.waitForTimeout(900);
await p.screenshot({ path: `${OUT}/journal-presets.png` });
const presets = await p.evaluate(() => (JSON.parse(localStorage.getItem('kk4_guest') || '{}').presets || []).map((x) => x.name));
console.log('既定プリセット:', JSON.stringify(presets));
await b.close();
console.log('✅ 完了 →', OUT);
