// プリセットから記帳: 仕訳入力でプリセットチップ→モーダルが事前入力→記帳できるか検証。
import { chromium } from 'playwright';

const BASE = 'https://app.kurofukubo.com/';
const demo = {
  accounts: [
    { id: 'a02', code: '1002', name: '普通預金', type: 'asset', sys: 1 },
    { id: 'd01', code: '4001', name: '給与収入', type: 'income', sys: 1 },
    { id: 'e09', code: '5009', name: '住居費', type: 'expense', sys: 1 },
  ],
  journals: [],
  tags: [],
  wallets: [{ id: 'w1', name: 'メイン口座', accountId: 'a02' }],
  budgets: [], recurring: [], rules: [], allocs: [],
  presets: [
    // 家賃（出金）: 借方 住居費 95000 / 貸方 普通預金 95000
    { id: 'pr1', walletId: 'w1', type: 'out', name: '家賃', desc: '家賃', lines: [
      { accountId: 'e09', side: 'dr', amount: 95000, tagId: '' },
      { accountId: 'a02', side: 'cr', amount: 95000, tagId: '' },
    ] },
  ],
};

const run = async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript((d) => {
    localStorage.setItem('kk_guest', '1'); localStorage.setItem('kk4_guest', JSON.stringify(d));
    localStorage.setItem('kk_theme', 'light'); localStorage.setItem('kk_onboarded', '1'); localStorage.setItem('kk_guest_promo', '1');
  }, demo);
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('.s-item', { timeout: 30000 });
  await page.locator('.s-item', { hasText: '仕訳入力' }).first().click();
  await page.waitForTimeout(400);

  // プリセットチップ「家賃」をクリック
  console.log('プリセットチップ表示:', await page.getByRole('button', { name: /家賃/ }).first().isVisible());
  await page.getByRole('button', { name: /家賃/ }).first().click();
  await page.waitForTimeout(500);

  // モーダルが事前入力されているか（摘要=家賃、金額95000）
  const desc = await page.locator('input[placeholder="取引の内容"]').inputValue();
  const amtInputs = page.locator('.je-line input[type=number]');
  const amt0 = await amtInputs.first().inputValue();
  console.log('事前入力 摘要:', JSON.stringify(desc), '/ 借方金額:', amt0);

  // 記帳
  await page.getByRole('button', { name: '記帳する' }).click();
  await page.waitForTimeout(1000);
  const journals = await page.evaluate(() => JSON.parse(localStorage.getItem('kk4_guest')).journals);
  const j = journals[journals.length - 1];
  console.log('記帳結果:', j ? JSON.stringify({ desc: j.desc, lines: j.lines.map((l) => `${l.side}:${l.accountId}=${l.amount}`) }) : 'なし');
  console.log('プリセット記帳OK:', !!j && j.desc === '家賃' && j.lines.some((l) => l.side === 'dr' && l.accountId === 'e09' && l.amount === 95000));

  await ctx.close(); await browser.close();
  console.log('DONE');
};
run().catch((e) => { console.error('ERROR', e); process.exit(1); });
