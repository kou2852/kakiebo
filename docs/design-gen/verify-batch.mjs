// 4件まとめて検証: ①借方/貸方ソート ②チェックボックス一括 ③期間ラベル ④カレンダー編集
import { chromium } from 'playwright';

const BASE = process.env.APP_URL || 'http://localhost:3001/';
const dr = (a, n) => ({ accountId: a, side: 'dr', amount: n });
const cr = (a, n) => ({ accountId: a, side: 'cr', amount: n });
let i = 0;
const J = (d, desc, l) => ({ id: 'j' + (++i), date: d, desc, lines: l });

const demo = {
  accounts: [
    { id: 'a01', code: '1001', name: '現金', type: 'asset', sys: 1 },
    { id: 'a02', code: '1002', name: '普通預金', type: 'asset', sys: 1 },
    { id: 'd01', code: '4001', name: '給与収入', type: 'income', sys: 1 },
    { id: 'e01', code: '5001', name: '食費', type: 'expense', sys: 1 },
    { id: 'e07', code: '5007', name: '娯楽費', type: 'expense', sys: 1 },
  ],
  journals: [
    J('2026-06-03', 'スーパー', [dr('e01', 1200), cr('a01', 1200)]),
    J('2026-06-08', '映画', [dr('e07', 1800), cr('a02', 1800)]),
    J('2026-06-15', 'コンビニ', [dr('e01', 600), cr('a01', 600)]),
  ],
  tags: [], wallets: [{ id: 'w1', name: 'メイン口座', accountId: 'a02' }],
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

  // ③ 期間ラベル（ダッシュボード）。当月と一致するか（fmtのJSTずれ修正の確認）
  let body = await page.locator('main').innerText();
  const expM = `${new Date().getFullYear()}年${new Date().getMonth() + 1}月`;
  console.log('③ 期間ラベル表示:', /\d{4}年\d{1,2}月/.test(body) && body.includes('を表示中'));
  console.log('③ ラベルが当月と一致:', body.includes(expM), '（期待:', expM + '）');

  // 仕訳入力へ
  await page.locator('.s-item', { hasText: '仕訳入力' }).first().click();
  await page.waitForTimeout(400);

  // ① 借方列ヘッダがソート可能（sortableクラス）か。クリックで並び替え。
  const drHeader = page.locator('th.sortable', { hasText: '借方' }).first();
  console.log('① 借方ヘッダ sortable:', await drHeader.count() > 0);
  await drHeader.click();
  await page.waitForTimeout(200);
  await drHeader.click(); // 昇順/降順トグル
  await page.waitForTimeout(200);
  console.log('① 貸方ヘッダ sortable:', await page.locator('th.sortable', { hasText: '貸方' }).count() > 0);

  // ② 一括選択モード: 既定はチェックボックス非表示
  console.log('② 既定でチェックボックス非表示:', (await page.locator('tbody input[type=checkbox]').count()) === 0);
  await page.getByRole('button', { name: /一括選択/ }).click();
  await page.waitForTimeout(200);
  console.log('② 一括選択でチェックボックス表示:', (await page.locator('tbody input[type=checkbox]').count()) > 0);
  // レコード（行）クリックで選択
  const bRows = page.locator('tbody tr');
  const bN = await bRows.count();
  for (let r = 0; r < bN; r++) await bRows.nth(r).click();
  await page.waitForTimeout(200);
  body = await page.locator('main').innerText();
  console.log('② 行クリックで「件 選択中」:', /\d件 選択中/.test(body));
  await page.screenshot({ path: new URL('./shots/15-journal-bulk.png', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });
  // 一括編集（摘要＋借方科目を娯楽費に）
  await page.getByRole('button', { name: '一括編集' }).click();
  await page.waitForTimeout(300);
  await page.locator('input[placeholder*="上書き"]').fill('一括テスト');
  await page.locator('.md .form-row select').first().selectOption({ label: '5007 娯楽費' });
  await page.getByRole('button', { name: '適用' }).click();
  await page.waitForTimeout(800);
  const res = await page.evaluate(() => JSON.parse(localStorage.getItem('kk4_guest')).journals.map((j) => ({ desc: j.desc, dr: j.lines.find((l) => l.side === 'dr')?.accountId })));
  console.log('② 一括編集 摘要(全件=一括テスト):', res.every((r) => r.desc === '一括テスト'));
  console.log('② 一括編集 借方科目(全件=娯楽費e07):', res.every((r) => r.dr === 'e07'), JSON.stringify(res));

  // ④ カレンダー → 日選択 → 編集モーダル
  await page.locator('.s-item', { hasText: 'カレンダー' }).first().click();
  await page.waitForTimeout(400);
  // 6月へ（既定は当月。デモは2026-06なので当月が6月のはず。違う場合はラベルで確認）
  await page.locator('.cal-cell', { hasText: '8' }).first().click();
  await page.waitForTimeout(300);
  const hasEdit = await page.getByRole('button', { name: '編集' }).count();
  console.log('④ カレンダー日別に編集ボタン:', hasEdit > 0);
  await page.screenshot({ path: new URL('./shots/16-calendar-edit.png', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });
  if (hasEdit > 0) {
    await page.getByRole('button', { name: '編集' }).first().click();
    await page.waitForTimeout(400);
    const modalText = await page.locator('body').innerText();
    console.log('④ 編集で仕訳モーダルが開く:', modalText.includes('仕訳編集'));
  }

  await ctx.close(); await browser.close();
  console.log('DONE');
};
run().catch((e) => { console.error('ERROR', e); process.exit(1); });
