// X投稿用: 実アプリ画面のスクショ（前月比ホバー / 更新情報モーダル / スマホ改善）
import { chromium } from 'playwright';
const BASE = process.env.APP_URL || 'http://localhost:4173/';
const shot = (p, n, opts) => p.screenshot({ path: new URL(`./shots/${n}`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), ...opts });

const dr = (a, n) => ({ accountId: a, side: 'dr', amount: n });
const cr = (a, n) => ({ accountId: a, side: 'cr', amount: n });
let i = 0; const J = (d, desc, l) => ({ id: 'j' + (++i), date: d, desc, lines: l });
const demo = {
  accounts: [
    { id: 'a01', code: '1001', name: '現金', type: 'asset', sys: 1 },
    { id: 'a02', code: '1002', name: '普通預金', type: 'asset', sys: 1 },
    { id: 'e01', code: '5001', name: '食費', type: 'expense', sys: 1 },
    { id: 'e02', code: '5002', name: '日用品費', type: 'expense', sys: 1 },
    { id: 'e03', code: '5003', name: '交通費', type: 'expense', sys: 1 },
    { id: 'i01', code: '4001', name: '給与', type: 'income', sys: 1 },
    { id: 'b01', code: '2101', name: 'クレジットカード', type: 'liability', sys: 1 },
  ],
  journals: [
    J('2026-03-25', '3月給与', [dr('a02', 240000), cr('i01', 240000)]),
    J('2026-04-25', '4月給与', [dr('a02', 245000), cr('i01', 245000)]),
    J('2026-05-25', '5月給与', [dr('a02', 250000), cr('i01', 250000)]),
    J('2026-06-01', '6月給与', [dr('a02', 250000), cr('i01', 250000)]),
    J('2026-06-03', 'スーパー', [dr('e01', 3280), cr('a01', 3280)]),
    J('2026-06-05', 'ドラッグストア', [dr('e02', 1580), cr('a01', 1580)]),
    J('2026-06-10', '外食（カード）', [dr('e01', 4800), cr('b01', 4800)]),
    J('2026-06-12', '電車', [dr('e03', 1240), cr('a02', 1240)]),
  ],
  tags: [], wallets: [], budgets: [], presets: [], recurring: [], rules: [], allocs: [],
};
const inject = (page, extra = {}) => page.addInitScript(([d, ex]) => {
  localStorage.setItem('kk_guest', '1'); localStorage.setItem('kk4_guest', JSON.stringify(d));
  localStorage.setItem('kk_theme', 'light'); localStorage.setItem('kk_onboarded', '1');
  localStorage.setItem('kk_guest_promo', '1'); localStorage.setItem('kk_setup_dismissed', '1');
  Object.entries(ex).forEach(([k, v]) => localStorage.setItem(k, v));
}, [demo, extra]);

const run = async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });

  // ── デスクトップ ──
  const ctxD = await browser.newContext({ viewport: { width: 1366, height: 850 }, deviceScaleFactor: 2 });
  const pD = await ctxD.newPage();
  await inject(pD); // kk_update_seen 未設定→ベル赤ドット
  await pD.goto(BASE, { waitUntil: 'networkidle' });
  await pD.waitForSelector('.s-item', { timeout: 30000 });
  await pD.waitForTimeout(700);

  // 1) 純資産の推移＋前月比ホバー
  const card = pD.locator('.card', { hasText: '純資産の推移' }).first();
  await card.scrollIntoViewIfNeeded();
  await pD.waitForTimeout(300);
  const circles = pD.locator('svg[aria-label="純資産の推移グラフ"] circle');
  const n = await circles.count();
  await circles.nth(Math.max(0, n - 2)).hover(); // 5月の点（前月比が出る）
  await pD.waitForTimeout(400);
  await shot(pD, 's-networth.png');

  // 2) 更新情報モーダル（ベルから）
  await pD.locator('.bell-btn').click();
  await pD.waitForTimeout(500);
  await shot(pD, 's-whatsnew.png');
  await pD.keyboard.press('Escape');
  await ctxD.close();

  // ── モバイル ──
  const ctxM = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const pM = await ctxM.newPage();
  await inject(pM, { kk_update_seen: '2026-06-14' });
  await pM.goto(BASE, { waitUntil: 'networkidle' });
  await pM.waitForSelector('.hamburger', { timeout: 30000 });
  await pM.waitForTimeout(600);
  await shot(pM, 's-mobile-dashboard.png');
  // 仕訳入力（カード表示）
  await pM.locator('.hamburger').click();
  await pM.waitForTimeout(300);
  await pM.locator('.s-item', { hasText: '仕訳入力' }).first().click();
  await pM.waitForTimeout(600);
  await shot(pM, 's-mobile-journal.png');
  await ctxM.close();

  await browser.close();
  console.log('DONE');
};
run().catch((e) => { console.error('ERROR', e); process.exit(1); });
