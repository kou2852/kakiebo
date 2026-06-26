// CSV取込の選択画面（step2）が広く・操作しやすくなったか撮影。
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const BASE = process.env.APP_URL || 'http://localhost:3001/';
const here = (p) => new URL(p, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const csvPath = here('./sample.csv');
writeFileSync(csvPath, [
  '日付,借方科目,借方金額,貸方科目,貸方金額,摘要',
  '2026-06-01,食費,1200,現金,,スーパー',
  '2026-06-03,娯楽費,1800,普通預金,,映画',
  '2026-06-05,,600,,,コンビニ',
  '2026-06-08,不明科目,2000,現金,,要確認',
].join('\n'), 'utf8');

const demo = {
  accounts: [
    { id: 'a01', code: '1001', name: '現金', type: 'asset', sys: 1 },
    { id: 'a02', code: '1002', name: '普通預金', type: 'asset', sys: 1 },
    { id: 'e01', code: '5001', name: '食費', type: 'expense', sys: 1 },
    { id: 'e07', code: '5007', name: '娯楽費', type: 'expense', sys: 1 },
  ],
  journals: [], tags: [], wallets: [], budgets: [], presets: [], recurring: [], rules: [], allocs: [],
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
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'CSV取込' }).click();
  await page.waitForTimeout(300);
  await page.locator('input[type=file]').setInputFiles(csvPath);
  await page.waitForTimeout(600);
  const body = await page.locator('body').innerText();
  console.log('step2(選択行表示):', body.includes('要確認') || body.includes('スーパー'));
  console.log('モーダル幅 md-w 適用:', await page.locator('.md.md-w').count() > 0);
  await page.screenshot({ path: here('./shots/17-csv-select.png') });
  console.log('shot: 17-csv-select');
  // 取込実行 → 連打しても二重取込されないか（ボタン非活性＋ガード）
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('kk4_guest')).journals.length);
  const btn = page.getByRole('button', { name: /取込実行/ });
  await btn.click();
  await btn.click({ force: true }).catch(() => {}); // 連打（非活性なら無視される）
  await page.waitForTimeout(1200);
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('kk4_guest')).journals.length);
  console.log('取込実行で追加件数:', after - before, '（期待: 2／二重取込なし）');
  await ctx.close(); await browser.close();
  console.log('DONE');
};
run().catch((e) => { console.error('ERROR', e); process.exit(1); });
