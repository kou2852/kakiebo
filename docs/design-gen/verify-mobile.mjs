// モバイル検証: ①ハンバーガー重なり ②仕訳/仕訳帳のカード表示 ③ベル(更新情報) ④ボタン配置
import { chromium } from 'playwright';

const BASE = process.env.APP_URL || 'http://localhost:4173/';
const dr = (a, n) => ({ accountId: a, side: 'dr', amount: n });
const cr = (a, n) => ({ accountId: a, side: 'cr', amount: n });
let i = 0;
const J = (d, desc, l) => ({ id: 'j' + (++i), date: d, desc, lines: l });

const demo = {
  accounts: [
    { id: 'a01', code: '1001', name: '現金', type: 'asset', sys: 1 },
    { id: 'a02', code: '1002', name: '普通預金', type: 'asset', sys: 1 },
    { id: 'e01', code: '5001', name: '食費', type: 'expense', sys: 1 },
    { id: 'e02', code: '5002', name: '日用品費', type: 'expense', sys: 1 },
    { id: 'i01', code: '4001', name: '給与', type: 'income', sys: 1 },
    { id: 'b01', code: '2101', name: 'クレジットカード', type: 'liability', sys: 1 },
  ],
  journals: [
    J('2026-06-01', '6月給与', [dr('a02', 250000), cr('i01', 250000)]),
    J('2026-06-03', 'スーパーで買い物', [dr('e01', 3280), cr('a01', 3280)]),
    J('2026-06-05', 'ドラッグストア', [dr('e02', 1580), cr('a01', 1580)]),
    J('2026-06-10', '外食（カード）', [dr('e01', 4800), cr('b01', 4800)]),
    J('2026-06-12', '電車・カフェ', [dr('e01', 1240), cr('a02', 1240)]),
  ],
  tags: [], wallets: [], budgets: [], presets: [], recurring: [], rules: [], allocs: [],
};

const inject = (page, extra = {}) => page.addInitScript(([d, ex]) => {
  localStorage.setItem('kk_guest', '1'); localStorage.setItem('kk4_guest', JSON.stringify(d));
  localStorage.setItem('kk_theme', 'light'); localStorage.setItem('kk_onboarded', '1'); localStorage.setItem('kk_guest_promo', '1');
  Object.entries(ex).forEach(([k, v]) => localStorage.setItem(k, v));
}, [demo, extra]);

const shot = (p, name) => p.screenshot({ path: new URL(`./shots/${name}`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });

const openMenuAndNav = async (page, label) => {
  if (await page.locator('.sidebar.open').count() === 0) {
    await page.locator('.hamburger').click();
    await page.waitForTimeout(300);
  }
  await page.locator('.s-item', { hasText: label }).first().click();
  await page.waitForTimeout(500);
};

const run = async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  // iPhone 12 相当
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.dismiss());
  await inject(page); // kk_update_seen 未設定 → ベル赤ドット
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('.hamburger', { timeout: 30000 });
  await page.waitForTimeout(600);

  // ① ダッシュボード上部（ハンバーガーがタイトルに被っていないか）
  await shot(page, 'm1-dashboard.png');

  // ③ ベル: メニューを開いてロゴ行のベル＋赤ドットを確認
  await page.locator('.hamburger').click();
  await page.waitForTimeout(300);
  const bell = page.locator('.bell-btn');
  console.log('③ ベル存在:', await bell.count() === 1);
  console.log('③ 未読ドット:', await page.locator('.bell-dot').count() === 1);
  await shot(page, 'm2-sidebar-bell.png');
  // ベルをクリック → 更新情報モーダル(履歴)
  await bell.click();
  await page.waitForTimeout(400);
  const md = await page.locator('.md').innerText();
  console.log('③ 更新情報モーダル:', md.includes('更新情報') && md.includes('クレジット'));
  await shot(page, 'm3-whatsnew.png');
  await page.locator('.md .btn').last().click(); // 閉じる
  await page.waitForTimeout(300);

  // ② 仕訳入力（カード表示・横スクロールなし）
  await openMenuAndNav(page, '仕訳入力');
  await page.waitForTimeout(400);
  const sw = await page.evaluate(() => ({ sw: document.scrollingElement.scrollWidth, cw: document.scrollingElement.clientWidth }));
  console.log('② 仕訳: 横はみ出しなし:', sw.sw <= sw.cw + 1, JSON.stringify(sw));
  console.log('② 仕訳: カード化tr:', await page.locator('.tbl-cards tr').count());
  await shot(page, 'm4-journal.png');

  // ② 仕訳帳
  await openMenuAndNav(page, '仕訳帳');
  await page.waitForTimeout(400);
  const sw2 = await page.evaluate(() => ({ sw: document.scrollingElement.scrollWidth, cw: document.scrollingElement.clientWidth }));
  console.log('② 仕訳帳: 横はみ出しなし:', sw2.sw <= sw2.cw + 1, JSON.stringify(sw2));
  await shot(page, 'm5-ledger.png');

  await ctx.close(); await browser.close();
  console.log('DONE');
};
run().catch((e) => { console.error('ERROR', e); process.exit(1); });
