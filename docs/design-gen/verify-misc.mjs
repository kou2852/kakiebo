// #2 円グラフ tooltip（金額/構成比が分離表示）/ #1 CSV科目選択のリセット を検証。
import { chromium } from 'playwright';

const BASE = 'https://app.kurofukubo.com/';
const demo = {
  accounts: [
    { id: 'a02', code: '1002', name: '普通預金', type: 'asset', sys: 1 },
    { id: 'd01', code: '4001', name: '給与収入', type: 'income', sys: 1 },
    { id: 'e01', code: '5001', name: '食費', type: 'expense', sys: 1 },
    { id: 'e03', code: '5003', name: '光熱費', type: 'expense', sys: 1 },
  ],
  journals: [
    { id: 'j1', date: '2026-06-25', desc: '給与', lines: [{ accountId: 'a02', side: 'dr', amount: 320000 }, { accountId: 'd01', side: 'cr', amount: 320000 }] },
    { id: 'j2', date: '2026-06-05', desc: 'スーパー', lines: [{ accountId: 'e01', side: 'dr', amount: 24000 }, { accountId: 'a02', side: 'cr', amount: 24000 }] },
    { id: 'j3', date: '2026-06-10', desc: '電気', lines: [{ accountId: 'e03', side: 'dr', amount: 12800 }, { accountId: 'a02', side: 'cr', amount: 12800 }] },
  ],
  tags: [], wallets: [], budgets: [], presets: [], recurring: [], rules: [], allocs: [],
};
const csv = '日付,借方科目,借方金額,貸方科目,貸方金額,摘要\n2026-06-01,食費,1200,普通預金,,A\n2026-06-02,光熱費,800,普通預金,,B';
const buf = (s) => ({ name: 't.csv', mimeType: 'text/csv', buffer: Buffer.from(s, 'utf8') });

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

  // #2: 支出内訳の円グラフ（複数スライス=path）にホバー → tooltip に「金額」「構成比」
  await page.waitForSelector('path.pie-slice', { timeout: 10000 });
  await page.locator('path.pie-slice').first().dispatchEvent('mouseover', { clientX: 300, clientY: 400, bubbles: true });
  await page.waitForTimeout(400);
  const tipText = (await page.locator('.chart-tip').first().innerText().catch(() => '')).replace(/\n/g, ' / ');
  console.log('tooltip内容:', tipText);
  console.log('金額/構成比ラベル分離:', tipText.includes('金額') && tipText.includes('構成比'));

  // #1: CSV取込で科目を一括変更 → 「選択をリセット」で初期に戻る
  await page.locator('.s-item', { hasText: '仕訳入力' }).first().click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'CSV取込' }).click();
  await page.waitForTimeout(300);
  await page.locator('input[type=file]').setInputFiles(buf(csv));
  await page.waitForTimeout(500);
  // 借方の上書きセレクト（行ごと）の最初の値を確認（初期は食費=e01）
  const firstSel = page.locator('select.csv-sel').first();
  const before = await firstSel.inputValue();
  // 借方一括セレクト（ツールバー）で全行を光熱費(e03)に変更
  await page.locator('select.fc').first().selectOption('e03');
  await page.waitForTimeout(300);
  const afterBulk = await firstSel.inputValue();
  // リセット
  await page.getByRole('button', { name: '選択をリセット' }).click();
  await page.waitForTimeout(300);
  const afterReset = await firstSel.inputValue();
  console.log(`借方1行目: 初期=${before} → 一括変更後=${afterBulk} → リセット後=${afterReset}`);
  console.log('リセットで初期に戻る:', afterBulk !== before && afterReset === before);

  await ctx.close(); await browser.close();
  console.log('DONE');
};
run().catch((e) => { console.error('ERROR', e); process.exit(1); });
