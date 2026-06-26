// チートシートの記帳ボタン→モーダル、仕訳入力のかんたんモードを確認。要 preview。
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const BASE = process.env.SHOT_BASE || 'http://localhost:4173/?guest';
const OUT = 'shots/cheat'; mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await b.newContext({ viewport: { width: 1040, height: 900 }, deviceScaleFactor: 1 });
await ctx.addInitScript(() => {
  localStorage.setItem('kk_guest', '1'); localStorage.setItem('kk_onboarded', '1');
  localStorage.setItem('kk_theme', 'light'); localStorage.setItem('kk_setup_dismissed', '1'); localStorage.setItem('kk_guest_promo', '1');
});
const p = await ctx.newPage();
await p.goto(BASE, { waitUntil: 'networkidle' });
await p.waitForSelector('.s-item', { timeout: 30000 });

// 操作ガイド → チートシート
await p.locator('.s-item', { hasText: '操作ガイド' }).first().click();
await p.waitForTimeout(600);
await p.locator('text=仕訳チートシート').scrollIntoViewIfNeeded();
await p.waitForTimeout(300);
await p.screenshot({ path: `${OUT}/01-cheatsheet.png` });

// 行の「記帳」→モーダル
await p.locator('tr', { hasText: '食料品・外食を現金で' }).getByRole('button', { name: '記帳' }).click();
await p.waitForTimeout(600);
await p.screenshot({ path: `${OUT}/02-modal-from-cheat.png` });
const modalAccts = await p.locator('.je-line select').first().evaluate((s) => s.options[s.selectedIndex]?.text);
console.log('モーダル借方科目:', modalAccts);
await p.keyboard.press('Escape');
await p.waitForTimeout(400);

// 仕訳入力 → かんたんモード
await p.locator('.s-item', { hasText: '仕訳入力' }).first().click();
await p.waitForTimeout(700);
await p.screenshot({ path: `${OUT}/03-simple-out.png` });
const modeBtn = await p.getByRole('button', { name: 'かんたん' }).count();
console.log('かんたんトグル有無:', modeBtn);

// 振替タブ
await p.getByRole('button', { name: '振替', exact: true }).click();
await p.waitForTimeout(400);
await p.screenshot({ path: `${OUT}/04-simple-transfer.png` });

// 収入タブ
await p.getByRole('button', { name: '収入', exact: true }).click();
await p.waitForTimeout(400);
await p.screenshot({ path: `${OUT}/05-simple-in.png` });

await b.close();
console.log('✅ 完了 →', OUT);
