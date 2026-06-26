// 再現: 定期取引で6月分を生成→6月の仕訳を削除→6月を再生成できるか（7月に飛ばないか）
import { chromium } from 'playwright';
const BASE = process.env.APP_URL || 'http://localhost:4173/';

const demo = {
  accounts: [
    { id: 'a02', code: '1002', name: '普通預金', type: 'asset', sys: 1 },
    { id: 'e09', code: '5009', name: '住居費', type: 'expense', sys: 1 },
  ],
  journals: [],
  recurring: [
    { id: 'r1', name: '家賃', frequency: 'monthly', day: 10, nextDate: '2026-06-10',
      lines: [{ accountId: 'e09', side: 'dr', amount: 80000 }, { accountId: 'a02', side: 'cr', amount: 80000 }] },
  ],
  tags: [], wallets: [], budgets: [], presets: [], rules: [], allocs: [],
};
const inject = (page) => page.addInitScript((d) => {
  localStorage.setItem('kk_guest', '1'); localStorage.setItem('kk4_guest', JSON.stringify(d));
  localStorage.setItem('kk_theme', 'light'); localStorage.setItem('kk_onboarded', '1');
  localStorage.setItem('kk_guest_promo', '1'); localStorage.setItem('kk_update_seen', '2026-06-14');
}, demo);

const state = (page) => page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('kk4_guest'));
  return { nextDate: d.recurring[0]?.nextDate, journals: d.journals.map((j) => j.date + ':' + (j.desc || '')) };
});
const nav = async (page, label) => { if (await page.locator('.sidebar.open').count() === 0 && await page.locator('.hamburger').isVisible().catch(() => false)) { await page.locator('.hamburger').click(); await page.waitForTimeout(200); } await page.locator('.s-item', { hasText: label }).first().click(); await page.waitForTimeout(500); };
const nextDateCell = (page) => page.locator('table tbody tr').first().locator('td.mono').innerText();

const run = async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.accept());
  await inject(page);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('.s-item', { timeout: 30000 });
  await page.waitForTimeout(500);

  await nav(page, '定期取引');
  console.log('① 初期 次回生成日(表示):', await nextDateCell(page));
  console.log('① 初期 state:', JSON.stringify(await state(page)));

  // 生成
  await page.getByRole('button', { name: '生成', exact: true }).click();
  await page.waitForTimeout(800);
  console.log('② 生成後 次回生成日(表示):', await nextDateCell(page));
  console.log('② 生成後 state:', JSON.stringify(await state(page)));

  // 6月の仕訳を削除（仕訳入力画面）
  await nav(page, '仕訳入力');
  await page.waitForTimeout(400);
  const delBtn = page.getByRole('button', { name: '削除' }).first();
  if (await delBtn.count()) { await delBtn.click(); await page.waitForTimeout(800); }
  console.log('③ 削除後 state:', JSON.stringify(await state(page)));

  // 定期取引に戻って確認
  await nav(page, '定期取引');
  await page.waitForTimeout(400);
  console.log('④ 削除後 次回生成日(表示):', await nextDateCell(page), '（期待: 2026-06-10）');

  // 再生成できるか
  await page.getByRole('button', { name: '生成', exact: true }).click();
  await page.waitForTimeout(800);
  console.log('⑤ 再生成後 state:', JSON.stringify(await state(page)), '（期待: 6月の仕訳が復活）');

  // 事前生成: 6月記帳済み(追いつき済み)で「生成」→ 7月分を先取り生成できるか
  await page.getByRole('button', { name: '生成', exact: true }).click();
  await page.waitForTimeout(800);
  console.log('⑥ 事前生成後 state:', JSON.stringify(await state(page)), '（期待: 7/10を先取り生成・nextDate=8月）');

  await ctx.close(); await browser.close();
  console.log('DONE');
};
run().catch((e) => { console.error('ERROR', e); process.exit(1); });
