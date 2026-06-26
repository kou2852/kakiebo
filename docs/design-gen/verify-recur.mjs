// 定期取引: 生成→削除で 次回生成日(nextDate) が巻き戻るか検証（再生成で重複しないことも）
import { chromium } from 'playwright';

const BASE = process.env.APP_URL || 'http://localhost:4173/';
const dr = (a, n) => ({ accountId: a, side: 'dr', amount: n });
const cr = (a, n) => ({ accountId: a, side: 'cr', amount: n });

const demo = {
  accounts: [
    { id: 'a02', code: '1002', name: '普通預金', type: 'asset', sys: 1 },
    { id: 'c01', code: '3001', name: '元入金', type: 'equity', sys: 1 },
    { id: 'e09', code: '5009', name: '住居費', type: 'expense', sys: 1 },
  ],
  journals: [{ id: 'j0', date: '2026-01-01', desc: '開始', lines: [dr('a02', 500000), cr('c01', 500000)] }],
  tags: [], wallets: [], budgets: [], presets: [],
  // 本日2026-06-14 / 5/27 が未生成（due）
  recurring: [{ id: 'r1', name: '家賃', frequency: 'monthly', day: 27, nextDate: '2026-05-27', lines: [dr('e09', 95000), cr('a02', 95000)] }],
  rules: [], allocs: [],
};

const nextDateOf = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('kk4_guest')).recurring[0].nextDate);
const rentCount = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('kk4_guest')).journals.filter((j) => j.desc === '家賃').length);

const run = async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
  await ctx.addInitScript((d) => {
    localStorage.setItem('kk_guest', '1'); localStorage.setItem('kk4_guest', JSON.stringify(d));
    localStorage.setItem('kk_theme', 'light'); localStorage.setItem('kk_onboarded', '1');
    localStorage.setItem('kk_guest_promo', '1'); localStorage.setItem('kk_update_seen', '2026-06-14');
  }, demo);
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.accept()); // 削除確認はOK
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('.s-item', { timeout: 30000 });

  console.log('初期 nextDate:', await nextDateOf(page), '(期待 2026-05-27)');

  // 定期取引 → 未生成分を一括生成
  await page.locator('.s-item', { hasText: '定期取引' }).first().click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: '未生成分を一括生成' }).click();
  await page.waitForTimeout(800);
  console.log('生成後 nextDate:', await nextDateOf(page), '(期待 2026-06-27)');
  console.log('生成後 家賃件数:', await rentCount(page), '(期待 1)');

  // 仕訳入力 → 全期間 → 家賃を削除
  await page.locator('.s-item', { hasText: '仕訳入力' }).first().click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: '全期間' }).click();
  await page.waitForTimeout(300);
  await page.locator('tr', { hasText: '家賃' }).first().getByRole('button', { name: '削除' }).click();
  await page.waitForTimeout(800);
  console.log('削除後 家賃件数:', await rentCount(page), '(期待 0)');
  console.log('削除後 nextDate:', await nextDateOf(page), '(期待 2026-05-27 = 巻き戻り)');

  // 再生成して重複しないか
  await page.locator('.s-item', { hasText: '定期取引' }).first().click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: '未生成分を一括生成' }).click();
  await page.waitForTimeout(800);
  console.log('再生成後 家賃件数:', await rentCount(page), '(期待 1=重複なし)');
  console.log('再生成後 nextDate:', await nextDateOf(page), '(期待 2026-06-27)');

  await ctx.close(); await browser.close();
  console.log('DONE');
};
run().catch((e) => { console.error('ERROR', e); process.exit(1); });
