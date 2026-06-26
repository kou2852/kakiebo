// CSV取込: #1 ヘッダー有無の選択 / #2 失敗後の再選択 を検証。
import { chromium } from 'playwright';

const BASE = 'https://app.kurofukubo.com/';
const demo = {
  accounts: [
    { id: 'a01', code: '1001', name: '現金', type: 'asset', sys: 1 },
    { id: 'a02', code: '1002', name: '普通預金', type: 'asset', sys: 1 },
    { id: 'e01', code: '5001', name: '食費', type: 'expense', sys: 1 },
  ],
  journals: [], tags: [], wallets: [], budgets: [], presets: [], recurring: [], rules: [], allocs: [],
};
const noHeader = '2026-06-01,食費,1200,現金,,コンビニ\n2026-06-02,食費,800,現金,,パン';
const withHeader = '日付,借方科目,借方金額,貸方科目,貸方金額,摘要\n2026-06-01,食費,1200,現金,,コンビニ\n2026-06-02,食費,800,現金,,パン';
const invalid = '日付,借方科目,借方金額,貸方科目,貸方金額,摘要'; // ヘッダーのみ＝データ行なし

const buf = (s) => ({ name: 't.csv', mimeType: 'text/csv', buffer: Buffer.from(s, 'utf8') });

const run = async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
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
  await page.locator('.s-item', { hasText: '仕訳入力' }).first().click();
  await page.waitForTimeout(400);

  const openModal = async () => { await page.getByRole('button', { name: 'CSV取込' }).click(); await page.waitForTimeout(400); };
  const fileInput = () => page.locator('input[type=file]');

  // #1a: ヘッダー無しCSV（チェックを外す）→ 2行取り込めるか
  await openModal();
  await page.getByRole('checkbox').setChecked(false);
  await fileInput().setInputFiles(buf(noHeader));
  await page.waitForTimeout(600);
  console.log('ヘッダー無し→2行表示:', await page.getByText(/2行/).first().isVisible().catch(() => false));
  await page.getByRole('button', { name: /戻る/ }).click();
  await page.waitForTimeout(300);

  // #1b: ヘッダー有りCSV（チェックを戻す）→ 2行
  await page.getByRole('checkbox').setChecked(true);
  await fileInput().setInputFiles(buf(withHeader));
  await page.waitForTimeout(600);
  console.log('ヘッダー有り→2行表示:', await page.getByText(/2行/).first().isVisible().catch(() => false));
  await page.getByRole('button', { name: /戻る/ }).click();
  await page.waitForTimeout(300);

  // #2: 失敗（データ行なし）→ステップ1のまま →再選択で成功
  await fileInput().setInputFiles(buf(invalid));
  await page.waitForTimeout(600);
  const stillStep1 = await page.locator('.csv-drop').isVisible().catch(() => false);
  const inputValAfterFail = await fileInput().inputValue().catch(() => 'n/a');
  console.log('失敗後ステップ1維持:', stillStep1, '/ input value クリア:', inputValAfterFail === '');
  await fileInput().setInputFiles(buf(withHeader));
  await page.waitForTimeout(600);
  console.log('失敗後の再選択で成功:', await page.getByText(/2行/).first().isVisible().catch(() => false));

  await ctx.close();
  await browser.close();
  console.log('DONE');
};
run().catch((e) => { console.error('ERROR', e); process.exit(1); });
