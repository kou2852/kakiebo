// クレジット画面の検証: CC設定カード＋月跨ぎ仕訳を注入し、サイクル表示・展開・状態を確認＋スクショ。
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.APP_URL || 'http://localhost:4173/';
const OUT = new URL('./shots/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
mkdirSync(OUT, { recursive: true });

const dr = (accountId, amount) => ({ accountId, side: 'dr', amount });
const cr = (accountId, amount) => ({ accountId, side: 'cr', amount });
let jid = 0;
const J = (date, desc, lines) => ({ id: 'j' + (++jid), date, desc, lines });

const demo = {
  accounts: [
    { id: 'a02', code: '1002', name: '普通預金', type: 'asset', sys: 1 },
    { id: 'b03', code: '2101', name: '楽天カード', type: 'liability', sys: 1, ccClose: 15, ccDay: 27, ccDelay: 1, ccFrom: 'a02' },
    { id: 'b04', code: '2102', name: '月末カード', type: 'liability', sys: 1, ccClose: 31, ccDay: 27, ccDelay: 1, ccFrom: 'a02' },
    { id: 'd01', code: '4001', name: '給与収入', type: 'income', sys: 1 },
    { id: 'e01', code: '5001', name: '食費', type: 'expense', sys: 1 },
    { id: 'e07', code: '5007', name: '娯楽費', type: 'expense', sys: 1 },
    { id: 'e12', code: '5012', name: '雑費', type: 'expense', sys: 1 },
  ],
  journals: [
    J('2026-03-25', '家電（娯楽）', [dr('e07', 40000), cr('b03', 40000)]),       // k2: Mar16-Apr15
    J('2026-05-27', 'クレカ返済: 楽天カード (4月締め分)', [dr('b03', 40000), cr('a02', 40000)]), // k2 引落済
    J('2026-04-20', 'ネット通販', [dr('e12', 8000), cr('b03', 8000)]),            // k1: Apr16-May15
    J('2026-05-05', '外食', [dr('e01', 5000), cr('b03', 5000)]),                  // k1
    J('2026-05-20', 'コンビニ', [dr('e01', 3000), cr('b03', 3000)]),              // k0: May16-Jun15(open)
    J('2026-06-10', 'スーパー', [dr('e01', 12000), cr('b03', 12000)]),            // k0(open)
    J('2026-06-25', '給与', [dr('a02', 320000), cr('d01', 320000)]),
    // 月末締めカード（締め31日）の利用 — 期間が「X/1〜末日」になるか確認用
    J('2026-06-05', '月末カード A', [dr('e01', 2000), cr('b04', 2000)]),
    J('2026-05-10', '月末カード B', [dr('e01', 3000), cr('b04', 3000)]),
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
  await page.locator('.s-item', { hasText: 'クレジット' }).first().click();
  await page.waitForTimeout(500);

  // 既定は「今月」= 6月引落分（5/15締め, ¥13,000）のみ表示されるはず
  const monthText = await page.locator('main').innerText();
  console.log('--- 期間: 今月（既定） ---');
  console.log('  4/16〜5/15(6/27引落)を表示:', monthText.includes('4/16〜5/15'));
  console.log('  3/16〜4/15(5/27引落)を非表示:', !monthText.includes('3/16〜4/15'));
  console.log('  5/16〜6/15(7/27引落)を非表示:', !monthText.includes('5/16〜6/15'));

  // 全期間に切替 → 有効サイクル3件が出る
  await page.getByRole('button', { name: '全期間' }).click();
  await page.waitForTimeout(400);
  const bodyText = await page.locator('main').innerText();
  console.log('--- 期間: 全期間 ---');
  const rows = await page.locator('tbody tr').allInnerTexts();
  rows.slice(0, 8).forEach((r) => console.log('  ', r.replace(/\n/g, ' | ')));
  console.log('「未引落」表示:', bodyText.includes('未引落'));
  console.log('「引落済」表示:', bodyText.includes('引落済'));
  console.log('「利用中」表示:', bodyText.includes('利用中'));
  console.log('「次回引落」表示:', bodyText.includes('次回引落'));
  console.log('3サイクル全て表示:', ['5/16〜6/15','4/16〜5/15','3/16〜4/15'].every((p) => bodyText.includes(p)));

  // 月末締め（締め31日）の利用期間チェック: 「X/1〜末日」になり、バグ「X/1〜Y/1」が出ない
  const bugPattern = /\d{1,2}\/1〜\d{1,2}\/1(?!\d)/;        // 例: 4/1〜5/1（バグ）
  const monthEndPattern = /\/1〜\d{1,2}\/(28|29|30|31)\b/;  // 例: 6/1〜6/30（正常）
  console.log('--- 月末締めカード ---');
  console.log('  バグ「X/1〜Y/1」なし:', !bugPattern.test(bodyText));
  console.log('  正常「X/1〜末日」あり:', monthEndPattern.test(bodyText));

  // チャート（棒＋円）の確認
  console.log('SVG数(チャート):', await page.locator('main svg').count());
  console.log('「サイクル別 利用額」見出し:', bodyText.includes('サイクル別 利用額'));
  console.log('「科目別 利用内訳」見出し:', bodyText.includes('科目別 利用内訳'));
  console.log('円グラフ凡例に「食費」:', bodyText.includes('食費'));

  // 1行展開（▸ のある行をクリック）
  await page.getByText('4/16〜5/15').first().click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: OUT + '13-credit.png', fullPage: true });
  console.log('shot: 13-credit');

  await ctx.close(); await browser.close();
  console.log('DONE');
};
run().catch((e) => { console.error('ERROR', e); process.exit(1); });
