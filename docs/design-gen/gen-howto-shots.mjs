// アプリ内ガイド用の短尺GIF（各≤15秒, 無音/自動ループ）。
// ① howto-1-balance.gif : 空データ→「普通預金 1800000 元入金」で残高記帳→ダッシュボードに純資産が出る
// ② howto-2-entry.gif    : 「食費 1200 現金 / コンビニ」一行入力→仕訳帳に複式で記録
// 本番app(現デザイン)のゲストモード(空データseed)で撮影。出力: frontend/public/
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import gifenc from 'gifenc';
const { GIFEncoder, quantize, applyPalette } = gifenc;
import { PNG } from 'pngjs';

const BASE = process.env.SHOT_BASE || 'https://app.kurofukubo.com/?guest';
const OUT = 'C:/dev/BudgetBook/kakeibo-saas/frontend/public';

const ACCOUNTS = [
  { id: 'a01', code: '1001', name: '現金', type: 'asset', sys: 1 }, { id: 'a02', code: '1002', name: '普通預金', type: 'asset', sys: 1 }, { id: 'a03', code: '1003', name: '定期預金', type: 'asset', sys: 1 }, { id: 'a05', code: '1201', name: '有価証券', type: 'asset', sys: 1 }, { id: 'a06', code: '1301', name: '固定資産', type: 'asset', sys: 1 },
  { id: 'b03', code: '2101', name: 'クレジットカード', type: 'liability', sys: 1 }, { id: 'b04', code: '2201', name: '借入金', type: 'liability', sys: 1 },
  { id: 'c01', code: '3001', name: '元入金', type: 'equity', sys: 1 },
  { id: 'd01', code: '4001', name: '給与収入', type: 'income', sys: 1 },
  { id: 'e01', code: '5001', name: '食費', type: 'expense', sys: 1 }, { id: 'e02', code: '5002', name: '日用品費', type: 'expense', sys: 1 }, { id: 'e05', code: '5005', name: '交通費', type: 'expense', sys: 1 },
];
const EMPTY = { accounts: ACCOUNTS, journals: [], tags: [], allocs: [], wallets: [{ id: 'w1', name: '日常口座', accountId: 'a02' }], presets: [], budgets: [], recurring: [], rules: [] };

const b = await chromium.launch({ channel: 'chrome', headless: true });

async function makeGif(actions, outName) {
  const ctx = await b.newContext({ viewport: { width: 1000, height: 600 }, deviceScaleFactor: 1 });
  await ctx.addInitScript((ds) => {
    localStorage.setItem('kk4_guest', JSON.stringify(ds)); localStorage.setItem('kk_guest', '1');
    localStorage.setItem('kk_onboarded', '1'); localStorage.setItem('kk_update_seen', '2027-12-31');
    localStorage.setItem('kk_guest_promo', '1'); localStorage.setItem('kk_setup_dismissed', '1'); localStorage.setItem('kk_theme', 'light');
  }, EMPTY);
  const p = await ctx.newPage();
  await p.goto(BASE, { waitUntil: 'networkidle' });
  await p.waitForSelector('.s-item', { timeout: 30000 });
  await p.waitForTimeout(600);
  await p.evaluate(() => { for (const el of document.querySelectorAll('div,section,aside')) { const t = (el.textContent || '').trim(); if (t.length < 90 && (t.includes('ゲストモード') || t.includes('端末にのみ保存されます'))) el.style.display = 'none'; } });
  const frames = [];
  const snap = async (delay = 110) => { frames.push({ buf: await p.screenshot({ type: 'png' }), delay }); };
  const nav = async (label) => { await p.locator('.s-item', { hasText: label }).first().click(); await p.waitForTimeout(800); };
  await actions({ p, snap, nav });
  await ctx.close();
  const enc = GIFEncoder();
  for (const f of frames) {
    const { data, width, height } = PNG.sync.read(f.buf);
    const palette = quantize(data, 128, { format: 'rgb565' });
    enc.writeFrame(applyPalette(data, palette, 'rgb565'), width, height, { palette, delay: f.delay });
  }
  enc.finish();
  writeFileSync(`${OUT}/${outName}`, enc.bytes());
  const ms = frames.reduce((s, f) => s + f.delay, 0);
  console.log(`  🎞 ${OUT}/${outName} (${frames.length}frames, ${Math.round(enc.bytes().length/1024)}KB, ~${(ms/1000).toFixed(1)}s)`);
}

// ① 残高を入れる
await makeGif(async ({ p, snap, nav }) => {
  await nav('仕訳入力');
  await snap(800);
  const qi = p.getByPlaceholder(/食費 1200/);
  await qi.click();
  const text = '普通預金 1800000 元入金';
  for (let c = 0; c < text.length; c += 2) { await qi.fill(text.slice(0, c + 2)); await snap(95); }
  await snap(1300);                       // 借方:普通預金 / 貸方:元入金 のプレビューを見せる
  await p.getByRole('button', { name: '記帳', exact: true }).click();
  await p.waitForTimeout(500); await snap(900);
  await nav('ダッシュボード'); await snap(2000);   // 純資産 ¥1,800,000 が出る
}, 'howto-1-balance.gif');

// ② 一行で記帳
await makeGif(async ({ p, snap, nav }) => {
  await nav('仕訳入力');
  await snap(800);
  const qi = p.getByPlaceholder(/食費 1200/);
  await qi.click();
  const text = '食費 1200 現金 / コンビニ';
  for (let c = 0; c < text.length; c += 2) { await qi.fill(text.slice(0, c + 2)); await snap(95); }
  await snap(1300);
  await p.getByRole('button', { name: '記帳', exact: true }).click();
  await p.waitForTimeout(500); await snap(900);
  await nav('仕訳帳'); await snap(1900);            // 借方:食費 / 貸方:現金 で記録
}, 'howto-2-entry.gif');

await b.close();
console.log('✅ 完了 → frontend/public/（howto-1-balance.gif, howto-2-entry.gif）');
