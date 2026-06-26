// 本番で #2(仕訳帳編集) と #3(クレカ返済生成) を検証。今日=2026-06-13想定。
import { chromium } from 'playwright';

const BASE = 'https://app.kurofukubo.com/';
const demo = {
  accounts: [
    { id: 'a01', code: '1001', name: '現金', type: 'asset', sys: 1 },
    { id: 'a02', code: '1002', name: '普通預金', type: 'asset', sys: 1 },
    { id: 'c01', code: '3001', name: '元入金', type: 'equity', sys: 1 },
    { id: 'e01', code: '5001', name: '食費', type: 'expense', sys: 1 },
    { id: 'b03', code: '2101', name: 'クレジットカード', type: 'liability', sys: 1, ccClose: 15, ccDay: 27, ccDelay: 1, ccFrom: 'a02' },
  ],
  journals: [
    { id: 'o1', date: '2026-04-01', desc: '開始残高', lines: [{ accountId: 'a02', side: 'dr', amount: 500000 }, { accountId: 'c01', side: 'cr', amount: 500000 }] },
    { id: 'p1', date: '2026-05-01', desc: 'スーパー(カード)', lines: [{ accountId: 'e01', side: 'dr', amount: 5000 }, { accountId: 'b03', side: 'cr', amount: 5000 }] },
  ],
  tags: [], wallets: [], budgets: [], presets: [], recurring: [], rules: [], allocs: [],
};

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

  // #3: 勘定科目・口座 → クレカ返済セクション
  await page.locator('.s-item', { hasText: '勘定科目・口座' }).first().click();
  await page.waitForTimeout(600);
  console.log('CCセクション表示 :', await page.getByText('クレジットカード返済').first().isVisible());
  console.log('未払残高¥5,000表示:', await page.getByText('¥5,000').first().isVisible().catch(() => false));

  await page.getByRole('button', { name: /クレカ返済を生成/ }).click();
  await page.waitForTimeout(1200);
  const journals = await page.evaluate(() => JSON.parse(localStorage.getItem('kk4_guest')).journals);
  const settle = journals.find((j) => (j.desc || '').startsWith('クレカ返済'));
  console.log('生成された返済仕訳 :', settle ? JSON.stringify({ date: settle.date, desc: settle.desc, lines: settle.lines.map((l) => `${l.side}:${l.accountId}=${l.amount}`) }) : 'なし');

  // 重複生成しないこと
  await page.getByRole('button', { name: /クレカ返済を生成/ }).click();
  await page.waitForTimeout(800);
  const j2 = await page.evaluate(() => JSON.parse(localStorage.getItem('kk4_guest')).journals);
  console.log('再実行後の返済仕訳数:', j2.filter((j) => (j.desc || '').startsWith('クレカ返済')).length, '(1なら重複なし)');

  // #2: 仕訳帳の編集ボタン
  await page.locator('.s-item', { hasText: '仕訳帳' }).first().click();
  await page.waitForTimeout(600);
  await page.locator('table tbody tr button', { hasText: '編集' }).first().click();
  await page.waitForTimeout(500);
  console.log('編集モーダル表示  :', await page.getByText('仕訳編集').first().isVisible().catch(() => false));

  await ctx.close();
  await browser.close();
  console.log('DONE');
};
run().catch((e) => { console.error('ERROR', e); process.exit(1); });
