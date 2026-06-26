// ポイント利用→雑収入の自動計上を検証。仕訳入力で 食費3000/カード2500 + ポイント500 を入れ、
// 保存後の仕訳が 借方 食費3000 / 貸方 カード2500・雑収入500 になるか確認。
import { chromium } from 'playwright';

const BASE = process.env.APP_URL || 'http://localhost:3001/';
const demo = {
  accounts: [
    { id: 'a02', code: '1002', name: '普通預金', type: 'asset', sys: 1 },
    { id: 'b03', code: '2101', name: '楽天カード', type: 'liability', sys: 1 },
    { id: 'd04', code: '4004', name: '雑収入', type: 'income', sys: 1 },
    { id: 'e01', code: '5001', name: '食費', type: 'expense', sys: 1 },
  ],
  journals: [], tags: [], wallets: [{ id: 'w1', name: 'メイン口座', accountId: 'a02' }],
  budgets: [], presets: [], recurring: [], rules: [], allocs: [],
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
  await page.getByRole('button', { name: /新規仕訳/ }).click();
  await page.waitForTimeout(400);

  await page.locator('input[placeholder="取引の内容"]').fill('スーパー');
  // 使用額のまま入力: 借方 食費 3000 / 貸方 カード 3000（balanced）
  await page.locator('.je-line').nth(0).locator('select').nth(0).selectOption({ label: '5001 食費' });
  await page.locator('.je-line').nth(0).locator('input[type=number]').fill('3000');
  await page.locator('.je-line').nth(1).locator('select').nth(0).selectOption({ label: '2101 楽天カード' });
  await page.locator('.je-line').nth(1).locator('input[type=number]').fill('3000');
  // ポイント利用 500（摘要下の placeholder="0" の入力）→ 出金から差し引き雑収入へ振替
  await page.locator('input[placeholder="0"]').fill('500');
  await page.waitForTimeout(300);

  const auto = await page.locator('body').innerText();
  console.log('振替案内の表示:', auto.includes('振替'));
  await page.screenshot({ path: new URL('./shots/14-point.png', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });

  await page.getByRole('button', { name: '記帳する' }).click();
  await page.waitForTimeout(800);

  const j = await page.evaluate(() => {
    const js = JSON.parse(localStorage.getItem('kk4_guest')).journals;
    return js[js.length - 1];
  });
  const fmt = (l) => `${l.side}:${l.accountId}=${l.amount}`;
  console.log('記帳結果 desc:', JSON.stringify(j?.desc));
  console.log('記帳結果 lines:', j ? j.lines.map(fmt).join(' / ') : 'なし');
  const ok = j &&
    j.lines.some((l) => l.side === 'dr' && l.accountId === 'e01' && l.amount === 3000) &&
    j.lines.some((l) => l.side === 'cr' && l.accountId === 'b03' && l.amount === 2500) &&
    j.lines.some((l) => l.side === 'cr' && l.accountId === 'd04' && l.amount === 500) &&
    (j.desc || '').includes('ポイント利用');
  console.log('ポイント→雑収入 自動計上OK:', !!ok);

  await ctx.close(); await browser.close();
  console.log('DONE');
};
run().catch((e) => { console.error('ERROR', e); process.exit(1); });
