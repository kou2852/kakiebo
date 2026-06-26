// 「もともとあった分」を削除しても、定期取引画面を開いた時に
// 直近の記帳済みから生成対象（次回生成日）が導出されるか検証。
import { chromium } from 'playwright';

const BASE = process.env.APP_URL || 'http://localhost:4173/';
const dr = (a, n) => ({ accountId: a, side: 'dr', amount: n });
const cr = (a, n) => ({ accountId: a, side: 'cr', amount: n });
const rent = (d) => ({ id: 'r' + d, date: d, desc: '家賃', lines: [dr('e09', 95000), cr('a02', 95000)] });

// 本日2026-06-15。nextDate は将来(7/27)に進んだ状態＋既存の家賃仕訳 5/27,6/27（もともとあった分）
const demo = {
  accounts: [
    { id: 'a02', code: '1002', name: '普通預金', type: 'asset', sys: 1 },
    { id: 'c01', code: '3001', name: '元入金', type: 'equity', sys: 1 },
    { id: 'e09', code: '5009', name: '住居費', type: 'expense', sys: 1 },
  ],
  journals: [
    { id: 'j0', date: '2026-01-01', desc: '開始', lines: [dr('a02', 800000), cr('c01', 800000)] },
    rent('2026-05-10'), rent('2026-06-10'),
  ],
  tags: [], wallets: [], budgets: [], presets: [],
  recurring: [{ id: 'rr', name: '家賃', frequency: 'monthly', day: 10, nextDate: '2026-07-10', lines: [dr('e09', 95000), cr('a02', 95000)] }],
  rules: [], allocs: [],
};

// 定期取引テーブルの家賃行の「次回生成日」を読む
const shownNext = (page) => page.evaluate(() => {
  const row = [...document.querySelectorAll('tbody tr')].find((tr) => tr.textContent.includes('家賃'));
  const m = row && row.innerText.match(/\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : null;
});
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
  page.on('dialog', (d) => d.accept());
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('.s-item', { timeout: 30000 });

  await page.locator('.s-item', { hasText: '定期取引' }).first().click();
  await page.waitForTimeout(400);
  console.log('初期の次回生成日(両方記帳済み→2026-07-10):', await shownNext(page));

  // もともとあった 6/27 を削除（仕訳入力・全期間）
  await page.locator('.s-item', { hasText: '仕訳入力' }).first().click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: '全期間' }).click();
  await page.waitForTimeout(300);
  await page.locator('tr', { hasText: '2026-06-10' }).filter({ hasText: '家賃' }).first().getByRole('button', { name: '削除' }).click();
  await page.waitForTimeout(700);

  // 定期取引を開き直す → 次回生成日が 6/10 に（削除分が生成対象として導出）
  await page.locator('.s-item', { hasText: '定期取引' }).first().click();
  await page.waitForTimeout(400);
  console.log('削除後に画面を開いた次回生成日(→2026-06-10):', await shownNext(page));

  // 一括生成 → 6/10 が再生成され重複しない（家賃 計2件）
  await page.getByRole('button', { name: '未生成分を一括生成' }).click();
  await page.waitForTimeout(800);
  console.log('再生成後の家賃件数(→2):', await rentCount(page));
  console.log('再生成後の次回生成日(→2026-07-10):', await shownNext(page));

  await ctx.close(); await browser.close();
  console.log('DONE');
};
run().catch((e) => { console.error('ERROR', e); process.exit(1); });
