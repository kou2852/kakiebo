// 改善バッチ(A〜D)の検証: 純資産推移/未記帳リマインダー＆生成/タグchip＆絞り込み/科目フィルタ/カレンダー記帳/科目削除ガード
import { chromium } from 'playwright';

const BASE = process.env.APP_URL || 'http://localhost:4173/';
const dr = (a, n, tag) => tag ? ({ accountId: a, side: 'dr', amount: n, splits: [{ tagId: tag, amount: n }] }) : ({ accountId: a, side: 'dr', amount: n });
const cr = (a, n) => ({ accountId: a, side: 'cr', amount: n });
let i = 0;
const J = (d, desc, lines) => ({ id: 'j' + (++i), date: d, desc, lines });

const demo = {
  accounts: [
    { id: 'a02', code: '1002', name: '普通預金', type: 'asset', sys: 1 },
    { id: 'b03', code: '2101', name: '楽天カード', type: 'liability', sys: 1, ccClose: 15, ccDay: 27, ccDelay: 1, ccFrom: 'a02' },
    { id: 'c01', code: '3001', name: '元入金', type: 'equity', sys: 1 },
    { id: 'd01', code: '4001', name: '給与収入', type: 'income', sys: 1 },
    { id: 'e01', code: '5001', name: '食費', type: 'expense', sys: 1 },
    { id: 'e07', code: '5007', name: '娯楽費', type: 'expense', sys: 0 },
  ],
  journals: [
    J('2026-01-01', '開始残高', [dr('a02', 500000), cr('c01', 500000)]),
    J('2026-04-10', '娯楽（カード）', [dr('e07', 8000), cr('b03', 8000)]),       // CC: Mar16-Apr15→5/27引落(到来)
    J('2026-06-05', 'スーパー', [dr('e01', 14000, 't1'), cr('a02', 14000)]),     // タグ付き
    J('2026-06-09', '給与', [dr('a02', 320000), cr('d01', 320000)]),
  ],
  tags: [{ id: 't1', name: '生活費', color: '#6090d8' }],
  wallets: [{ id: 'w1', name: 'メイン口座', accountId: 'a02' }],
  budgets: [], presets: [],
  recurring: [{ id: 'r1', name: '家賃', frequency: 'monthly', day: 27, nextDate: '2026-05-27', lines: [dr('e01', 50000), cr('a02', 50000)] }],
  rules: [], allocs: [],
};

const run = async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
  await ctx.addInitScript((d) => {
    localStorage.setItem('kk_guest', '1'); localStorage.setItem('kk4_guest', JSON.stringify(d));
    localStorage.setItem('kk_theme', 'light'); localStorage.setItem('kk_onboarded', '1');
    localStorage.setItem('kk_guest_promo', '1'); localStorage.setItem('kk_setup_dismissed', '1');
  }, demo);
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.dismiss()); // confirm はすべて拒否（削除されないこと確認用）
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('.s-item', { timeout: 30000 });
  await page.waitForTimeout(500);

  // C-1 純資産推移 / A-3 リマインダー（ダッシュボード）
  let body = await page.locator('main').innerText();
  console.log('C-1 純資産の推移グラフ:', body.includes('純資産の推移'));
  console.log('A-3 未記帳リマインダー:', body.includes('未記帳の自動取引'));
  console.log('A-3 件数(定期1/クレカ1=2件):', /未記帳の自動取引が 2 件/.test(body));
  const shot = (f) => page.screenshot({ path: new URL(`./shots/${f}`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), fullPage: true });
  await shot('x5-dashboard-new.png');

  // B-1 タグchip & 絞り込み（仕訳入力）
  await page.locator('.s-item', { hasText: '仕訳入力' }).first().click();
  await page.waitForTimeout(400);
  await shot('x6-journal-tags.png');
  body = await page.locator('main').innerText();
  console.log('B-1 タグchip「生活費」表示:', body.includes('生活費'));
  console.log('B-1 タグ絞り込みセレクト:', body.includes('全タグ'));

  // C-2 仕訳帳の科目フィルタ
  await page.locator('.s-item', { hasText: '仕訳帳' }).first().click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: '全期間' }).click(); // 娯楽費は4月のため全期間に
  await page.waitForTimeout(300);
  const beforeRows = await page.locator('tbody tr').count();
  await page.locator('select').filter({ hasText: '全科目' }).selectOption({ label: '5007 娯楽費' });
  await page.waitForTimeout(300);
  const afterRows = await page.locator('tbody tr').count();
  console.log('C-2 科目フィルタで件数が絞られる:', afterRows >= 1 && afterRows < beforeRows, `(${beforeRows}→${afterRows})`);

  // C-3 カレンダーから記帳（既定日付）
  await page.locator('.s-item', { hasText: 'カレンダー' }).first().click();
  await page.waitForTimeout(400);
  await page.locator('.cal-cell', { hasText: '5' }).first().click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /この日に記帳/ }).click();
  await page.waitForTimeout(400);
  const dateVal = await page.locator('input[type=date]').first().inputValue();
  console.log('C-3 カレンダー記帳の既定日付=2026-06-05:', dateVal === '2026-06-05');
  await page.getByRole('button', { name: 'キャンセル' }).click();
  await page.waitForTimeout(200);

  // A-2 使用中科目の削除ガード（勘定科目・口座 → 費用 → 食費 削除→残る）
  await page.locator('.s-item', { hasText: '勘定科目・口座' }).first().click();
  await page.waitForTimeout(400);
  await page.locator('.tab', { hasText: '費用' }).first().click();
  await page.waitForTimeout(200);
  const useRow = page.locator('tr', { hasText: '娯楽費' }).first();
  await useRow.getByRole('button', { name: '削除' }).click();
  await page.waitForTimeout(300);
  console.log('A-2 使用中の娯楽費(非sys)は削除されず残る:', await page.locator('tr', { hasText: '娯楽費' }).count() > 0);

  // A-3 まとめて記帳（最後に実行：生成で件数が増える）
  await page.locator('.s-item', { hasText: 'ダッシュボード' }).first().click();
  await page.waitForTimeout(400);
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('kk4_guest')).journals.length);
  await page.getByRole('button', { name: /まとめて記帳/ }).click();
  await page.waitForTimeout(1200);
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('kk4_guest')).journals.length);
  console.log('A-3 まとめて記帳で増加(>=2):', after - before >= 2, `(+${after - before})`);

  await ctx.close(); await browser.close();
  console.log('DONE');
};
run().catch((e) => { console.error('ERROR', e); process.exit(1); });
