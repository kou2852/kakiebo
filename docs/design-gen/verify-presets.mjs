// 検証: 既定プリセット3件（給与/現金引き出し(ATM)/クレカ利用）が初期表示され、編集可能なこと
import { chromium } from 'playwright';
const BASE = process.env.APP_URL || 'http://localhost:4173/';
const shot = (p, n) => p.screenshot({ path: new URL(`./shots/${n}`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });

// kk4_guest は注入しない＝既定データ(科目＋プリセット)がロードされる
const inject = (page) => page.addInitScript(() => {
  localStorage.setItem('kk_guest', '1');
  localStorage.setItem('kk_theme', 'light'); localStorage.setItem('kk_onboarded', '1'); localStorage.setItem('kk_guest_promo', '1');
  localStorage.setItem('kk_update_seen', '2026-06-14');
});

const nav = async (page, label) => { await page.locator('.s-item', { hasText: label }).first().click(); await page.waitForTimeout(600); };

const run = async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.dismiss());
  await inject(page);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('.s-item', { timeout: 30000 });
  await page.waitForTimeout(500);

  // 仕訳入力: プリセットチップ
  await nav(page, '仕訳入力');
  const jtext = await page.locator('body').innerText();
  console.log('仕訳入力に給与:', jtext.includes('給与'));
  console.log('仕訳入力にATM:', jtext.includes('現金引き出し'));
  console.log('仕訳入力にクレカ利用:', jtext.includes('クレカ利用'));
  await shot(page, 'pre1-journal-chips.png');

  // 給与チップを押す → 借方空・貸方 給与収入 のモーダル
  await page.locator('.btn', { hasText: '給与' }).first().click();
  await page.waitForTimeout(600);
  const mtext = await page.locator('.md').innerText();
  console.log('給与モーダル表示:', mtext.includes('給与収入') || mtext.includes('給与'));
  await shot(page, 'pre2-salary-modal.png');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // 勘定科目・口座: 口座に紐づかないプリセット（編集可能）
  await nav(page, '勘定科目・口座');
  await page.waitForTimeout(400);
  const atext = await page.locator('body').innerText();
  console.log('AccountsPageに「口座に紐づかないプリセット」:', atext.includes('口座に紐づかないプリセット'));
  console.log('AccountsPageに3件:', atext.includes('給与') && atext.includes('現金引き出し') && atext.includes('クレカ利用'));
  await shot(page, 'pre3-accounts-orphan.png');

  await ctx.close(); await browser.close();
  console.log('DONE');
};
run().catch((e) => { console.error('ERROR', e); process.exit(1); });
