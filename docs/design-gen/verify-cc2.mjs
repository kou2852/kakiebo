// 検証: ①更新情報(What's New)自動表示 ②クレカ返済確認モーダル（引落前も含む・チェック選択・記帳）
import { chromium } from 'playwright';

const BASE = process.env.APP_URL || 'http://localhost:4173/';
const dr = (a, n) => ({ accountId: a, side: 'dr', amount: n });
const cr = (a, n) => ({ accountId: a, side: 'cr', amount: n });
let i = 0;
const J = (d, desc, l) => ({ id: 'j' + (++i), date: d, desc, lines: l });

// 本日 2026-06-14 前提: b03(締15/引27/翌月)
//  4/10利用 → 3/16-4/15締め → 5/27引落(到来=due)
//  5/01利用 → 4/16-5/15締め → 6/27引落(引落前=future)
const demo = {
  accounts: [
    { id: 'a02', code: '1002', name: '普通預金', type: 'asset', sys: 1 },
    { id: 'b03', code: '2101', name: '楽天カード', type: 'liability', sys: 1, ccClose: 15, ccDay: 27, ccDelay: 1, ccFrom: 'a02' },
    { id: 'e01', code: '5001', name: '食費', type: 'expense', sys: 1 },
  ],
  journals: [
    J('2026-04-10', 'カード利用A', [dr('e01', 5000), cr('b03', 5000)]),
    J('2026-05-01', 'カード利用B', [dr('e01', 3000), cr('b03', 3000)]),
  ],
  tags: [], wallets: [], budgets: [], presets: [], recurring: [], rules: [], allocs: [],
};

const inject = (page, extra = {}) => page.addInitScript(([d, ex]) => {
  localStorage.setItem('kk_guest', '1'); localStorage.setItem('kk4_guest', JSON.stringify(d));
  localStorage.setItem('kk_theme', 'light'); localStorage.setItem('kk_onboarded', '1'); localStorage.setItem('kk_guest_promo', '1');
  Object.entries(ex).forEach(([k, v]) => localStorage.setItem(k, v));
}, [demo, extra]);

const run = async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });

  // ① What's New 自動表示（kk_update_seen 未設定）
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
  const pA = await ctxA.newPage();
  await inject(pA);
  await pA.goto(BASE, { waitUntil: 'networkidle' });
  await pA.waitForTimeout(900);
  const aText = await pA.locator('body').innerText();
  console.log('① 更新情報モーダル自動表示:', aText.includes('更新情報') && aText.includes('クレジット画面'));
  await pA.screenshot({ path: new URL('./shots/x7-whatsnew.png', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });
  await ctxA.close();

  // ②②② CCモーダル（kk_update_seen 設定で What's New を抑制）
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await inject(page, { kk_update_seen: '2026-06-14' });
  page.on('dialog', (d) => d.dismiss());
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('.s-item', { timeout: 30000 });

  await page.locator('.s-item', { hasText: '勘定科目・口座' }).first().click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'クレカ返済を記帳' }).click();
  await page.waitForTimeout(500);
  const mText = await page.locator('.md').innerText();
  console.log('② モーダル表示:', mText.includes('クレカ返済を記帳'));
  console.log('② 引落日到来の行あり:', mText.includes('引落日到来'));
  console.log('② 引落前(予定)の行あり:', mText.includes('引落前'));
  console.log('② 到来分が初期選択(=1件選択):', mText.includes('選択した1件を記帳'));
  await page.screenshot({ path: new URL('./shots/x8-cc-modal.png', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });
  // 全選択して2件記帳
  await page.locator('.md thead input[type=checkbox]').check();
  await page.waitForTimeout(200);
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('kk4_guest')).journals.length);
  await page.getByRole('button', { name: /選択した.*件を記帳/ }).click();
  await page.waitForTimeout(1000);
  const settles = await page.evaluate(() => JSON.parse(localStorage.getItem('kk4_guest')).journals.filter((j) => (j.desc || '').startsWith('クレカ返済')));
  console.log('② 全選択で2件(到来5/27＋引落前6/27)記帳:', settles.length === 2, settles.map((s) => s.date).join(','));
  console.log('② 引落前6/27も記帳された:', settles.some((s) => s.date === '2026-06-27'));

  // 更新情報の再表示（サイドバー）
  await page.locator('.s-item', { hasText: '更新情報' }).first().click();
  await page.waitForTimeout(400);
  console.log('① サイドバーから更新情報を再表示:', (await page.locator('.md').innerText()).includes('更新情報'));

  await ctx.close(); await browser.close();
  console.log('DONE');
};
run().catch((e) => { console.error('ERROR', e); process.exit(1); });
