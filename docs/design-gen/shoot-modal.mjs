// 記事用: 仕訳入力でプリセット「家賃」チップ→事前入力された仕訳モーダルを撮る。出力 ./shots/02b-journal-modal.png
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.APP_URL || 'https://app.kurofukubo.com/';
const OUT = new URL('./shots/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
mkdirSync(OUT, { recursive: true });

const demo = {
  accounts: [
    { id: 'a01', code: '1001', name: '現金', type: 'asset', sys: 1 },
    { id: 'a02', code: '1002', name: '普通預金', type: 'asset', sys: 1 },
    { id: 'd01', code: '4001', name: '給与収入', type: 'income', sys: 1 },
    { id: 'e01', code: '5001', name: '食費', type: 'expense', sys: 1 },
    { id: 'e09', code: '5009', name: '住居費', type: 'expense', sys: 1 },
  ],
  journals: [], tags: [], budgets: [], recurring: [], rules: [], allocs: [],
  wallets: [
    { id: 'w1', name: 'メイン口座', accountId: 'a02' },
    { id: 'w2', name: '財布', accountId: 'a01' },
  ],
  presets: [
    { id: 'p1', walletId: 'w1', type: 'out', name: '家賃', desc: '家賃', lines: [
      { accountId: 'e09', side: 'dr', amount: 95000, tagId: '' },
      { accountId: 'a02', side: 'cr', amount: 95000, tagId: '' },
    ] },
    { id: 'p2', walletId: 'w2', type: 'out', name: 'スーパー', desc: 'スーパー', lines: [
      { accountId: 'e01', side: 'dr', amount: 0, tagId: '' },
      { accountId: 'a01', side: 'cr', amount: 0, tagId: '' },
    ] },
  ],
};

const run = async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
  await ctx.addInitScript((d) => {
    localStorage.setItem('kk_guest', '1'); localStorage.setItem('kk4_guest', JSON.stringify(d));
    localStorage.setItem('kk_theme', 'light'); localStorage.setItem('kk_onboarded', '1'); localStorage.setItem('kk_guest_promo', '1');
  }, demo);
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('.s-item', { timeout: 30000 });
  await page.locator('.s-item', { hasText: '仕訳入力' }).first().click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /家賃/ }).first().click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: OUT + '02b-journal-modal.png' });
  console.log('shot: 02b-journal-modal');
  await ctx.close(); await browser.close();
  console.log('DONE ->', OUT);
};
run().catch((e) => { console.error(e); process.exit(1); });
