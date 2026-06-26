// 動画埋め込みのモバイル表示崩れチェック（要 npm run preview）。
// 操作ガイド／ダッシュボード(はじめかたカード)／仕訳入力(空状態) を 390px で撮影。
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const BASE = process.env.SHOT_BASE || 'http://localhost:4173/?guest';
const OUT = 'shots/howto-mobile'; mkdirSync(OUT, { recursive: true });

const ACC = [
  { id: 'a01', code: '1001', name: '現金', type: 'asset', sys: 1 }, { id: 'a02', code: '1002', name: '普通預金', type: 'asset', sys: 1 },
  { id: 'c01', code: '3001', name: '元入金', type: 'equity', sys: 1 }, { id: 'd01', code: '4001', name: '給与収入', type: 'income', sys: 1 },
  { id: 'e01', code: '5001', name: '食費', type: 'expense', sys: 1 },
];
// 空データ＝はじめかたカード＆空状態が出る。kk_onboarded=1でモーダル抑制、kk_setup_dismissedは“未設定”
const SEED = { accounts: ACC, journals: [], wallets: [], tags: [], allocs: [], presets: [], budgets: [], recurring: [], rules: [] };

const b = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true });
await ctx.addInitScript((ds) => {
  localStorage.setItem('kk4_guest', JSON.stringify(ds)); localStorage.setItem('kk_guest', '1');
  localStorage.setItem('kk_onboarded', '1'); localStorage.setItem('kk_update_seen', '2027-12-31');
  localStorage.setItem('kk_guest_promo', '1'); localStorage.setItem('kk_theme', 'light');
}, SEED);
const p = await ctx.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto(BASE, { waitUntil: 'networkidle' });
await p.waitForTimeout(800);
const open = async () => { const h = p.locator('.hamburger'); if (await h.count() && await h.isVisible()) { await h.click(); await p.waitForTimeout(300); } };
const nav = async (label, name) => {
  await open();
  await p.locator('.s-item', { hasText: label }).first().click();
  await p.waitForTimeout(900);
  await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  console.log('  📸', `${OUT}/${name}.png`);
};
await nav('操作ガイド', 'guide');
await nav('ダッシュボード', 'dashboard');
await nav('仕訳入力', 'journal');
// 横溢れチェック（body幅 vs スクロール幅）
const oflow = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
console.log('横スクロール幅:', oflow.sw, 'クライアント幅:', oflow.cw, oflow.sw > oflow.cw + 1 ? '⚠️横溢れあり' : 'OK(横溢れなし)');
if (errs.length) console.log('pageerror:', errs.slice(0, 3));
await b.close();
console.log('✅ 完了 → docs/design-gen/' + OUT);
