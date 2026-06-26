// 本番PLページで「エクスポート→CSV/PDF」を実際にDLし、中身を検証する。
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

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
  tags: [], wallets: [{ id: 'w1', name: 'メイン', accountId: 'a02' }], budgets: [], presets: [], recurring: [], rules: [], allocs: [],
};

const run = async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  await ctx.addInitScript((d) => {
    localStorage.setItem('kk_guest', '1');
    localStorage.setItem('kk4_guest', JSON.stringify(d));
    localStorage.setItem('kk_theme', 'light');
    localStorage.setItem('kk_onboarded', '1');
    localStorage.setItem('kk_guest_promo', '1');
  }, demo);
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('.s-item', { timeout: 30000 });
  await page.locator('.s-item', { hasText: '損益計算書' }).first().click();
  await page.waitForTimeout(800);

  // CSV
  await page.getByRole('button', { name: /エクスポート/ }).click();
  const [csvDl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByText('CSVでダウンロード').click(),
  ]);
  const csvPath = await csvDl.path();
  const csvBuf = readFileSync(csvPath);
  const hasBOM = csvBuf[0] === 0xEF && csvBuf[1] === 0xBB && csvBuf[2] === 0xBF;
  const csvText = csvBuf.toString('utf8');
  console.log('CSV filename :', csvDl.suggestedFilename());
  console.log('CSV BOM      :', hasBOM);
  console.log('CSV has 区分 :', csvText.includes('区分'));
  console.log('CSV has 給与収入:', csvText.includes('給与収入'));
  console.log('CSV has 収益合計:', csvText.includes('収益合計') || csvText.includes('当期純利益'));
  console.log('CSV sample   :', JSON.stringify(csvText.split('\r\n').slice(0, 4)));

  await page.waitForTimeout(400);

  // PDF
  await page.getByRole('button', { name: /エクスポート/ }).click();
  const [pdfDl] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    page.getByText('PDFでダウンロード').click(),
  ]);
  const pdfPath = await pdfDl.path();
  const pdfBuf = readFileSync(pdfPath);
  console.log('PDF filename :', pdfDl.suggestedFilename());
  console.log('PDF header   :', pdfBuf.slice(0, 5).toString('latin1'));
  console.log('PDF size(KB) :', Math.round(pdfBuf.length / 1024));

  await ctx.close();
  await browser.close();
  console.log('DONE');
};
run().catch((e) => { console.error('ERROR', e); process.exit(1); });
