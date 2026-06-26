// 仕訳入力タイトル横の「?」ツールチップ表示確認（要 preview）。desktop + mobile。
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const BASE = process.env.SHOT_BASE || 'http://localhost:4173/?guest';
const OUT = 'shots/tooltip'; mkdirSync(OUT, { recursive: true });
const SEED = { accounts: [{ id: 'a01', code: '1001', name: '現金', type: 'asset', sys: 1 }, { id: 'e01', code: '5001', name: '食費', type: 'expense', sys: 1 }], journals: [], wallets: [], tags: [], allocs: [], presets: [], budgets: [], recurring: [], rules: [] };

const b = await chromium.launch({ channel: 'chrome', headless: true });
for (const [label, vp, mobile] of [['desktop', { width: 1100, height: 700 }, false], ['mobile', { width: 390, height: 844 }, true]]) {
  const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: 2, isMobile: mobile });
  await ctx.addInitScript((ds) => { localStorage.setItem('kk4_guest', JSON.stringify(ds)); localStorage.setItem('kk_guest', '1'); localStorage.setItem('kk_onboarded', '1'); localStorage.setItem('kk_theme', 'light'); }, SEED);
  const p = await ctx.newPage();
  await p.goto(BASE, { waitUntil: 'networkidle' });
  await p.waitForTimeout(700);
  if (mobile) { const h = p.locator('.hamburger'); if (await h.count() && await h.isVisible()) { await h.click(); await p.waitForTimeout(300); } }
  await p.locator('.s-item', { hasText: '仕訳入力' }).first().click();
  await p.waitForTimeout(700);
  // ?にフォーカス（:focusで吹き出し表示）
  await p.locator('.infotip').first().focus();
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${OUT}/${label}.png` });
  console.log('  📸', `${OUT}/${label}.png`, '/ infotip数:', await p.locator('.infotip').count());
  await ctx.close();
}
await b.close();
console.log('✅ 完了');
