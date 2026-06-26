// クレカ返済の自動起票が利用サイクルに準拠しているか検証（月末締め＝6/31等の不正日付が出ないことも確認）。
import { chromium } from 'playwright';

const BASE = process.env.APP_URL || 'http://localhost:3001/';
const dr = (a, n) => ({ accountId: a, side: 'dr', amount: n });
const cr = (a, n) => ({ accountId: a, side: 'cr', amount: n });
let i = 0;
const J = (d, desc, l) => ({ id: 'j' + (++i), date: d, desc, lines: l });

// 本日 2026-06-14 前提:
//  b03(締15/引27/翌月): 3/16-4/15 → 5/27引落(到来=生成), 4/16-5/15 → 6/27引落(未到来=非生成)
//  b04(締31/引31/翌月): 3/1-3/31 → 4/30引落(月末clamp, 到来=生成 / 旧コードは4/31の不正日付)
const demo = {
  accounts: [
    { id: 'a02', code: '1002', name: '普通預金', type: 'asset', sys: 1 },
    { id: 'b03', code: '2101', name: '楽天カード', type: 'liability', sys: 1, ccClose: 15, ccDay: 27, ccDelay: 1, ccFrom: 'a02' },
    { id: 'b04', code: '2102', name: '月末カード', type: 'liability', sys: 1, ccClose: 31, ccDay: 31, ccDelay: 1, ccFrom: 'a02' },
    { id: 'e01', code: '5001', name: '食費', type: 'expense', sys: 1 },
  ],
  journals: [
    J('2026-04-01', 'b03 利用(3/16-4/15)', [dr('e01', 5000), cr('b03', 5000)]),  // → 5/27引落 生成対象
    J('2026-05-01', 'b03 利用(4/16-5/15)', [dr('e01', 3000), cr('b03', 3000)]),  // → 6/27引落 非対象(未到来)
    J('2026-03-10', 'b04 利用(3/1-3/31)', [dr('e01', 8000), cr('b04', 8000)]),  // → 4/30引落 生成対象(月末clamp)
  ],
  tags: [], wallets: [], budgets: [], presets: [], recurring: [], rules: [], allocs: [],
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
  await page.locator('.s-item', { hasText: '勘定科目・口座' }).first().click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'クレカ返済を生成' }).click();
  await page.waitForTimeout(1000);

  const gen = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('kk4_guest')).journals
      .filter((j) => (j.desc || '').startsWith('クレカ返済'))
      .map((j) => ({ date: j.date, desc: j.desc, dr: j.lines.find((l) => l.side === 'dr'), cr: j.lines.find((l) => l.side === 'cr') }))
  );
  console.log('生成された返済仕訳:');
  gen.forEach((g) => console.log('  ', g.date, '|', g.desc, '| dr', g.dr.accountId, g.dr.amount, '| cr', g.cr.accountId, g.cr.amount));

  const isValidDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && s.slice(8) === String(new Date(s).getDate()).padStart(2, '0');
  console.log('全件 日付が実在（6/31等の不正なし）:', gen.every((g) => isValidDate(g.date)));
  console.log('b03 5/27引落 5000 生成:', gen.some((g) => g.date === '2026-05-27' && g.cr.accountId === 'a02' && g.dr.accountId === 'b03' && g.dr.amount === 5000));
  console.log('b04 4/30引落 8000 生成（月末clamp, 4/31でない）:', gen.some((g) => g.date === '2026-04-30' && g.dr.accountId === 'b04' && g.dr.amount === 8000));
  console.log('未到来(6/27)は生成されない:', !gen.some((g) => g.date === '2026-06-27'));
  console.log('生成件数(=2):', gen.length);

  // 二重押下しても重複しないか
  await page.getByRole('button', { name: 'クレカ返済を生成' }).click();
  await page.waitForTimeout(800);
  const gen2 = await page.evaluate(() => JSON.parse(localStorage.getItem('kk4_guest')).journals.filter((j) => (j.desc || '').startsWith('クレカ返済')).length);
  console.log('再生成しても重複なし(=2):', gen2 === gen.length);

  await ctx.close(); await browser.close();
  console.log('DONE');
};
run().catch((e) => { console.error('ERROR', e); process.exit(1); });
