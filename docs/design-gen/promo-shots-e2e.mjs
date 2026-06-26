// X投稿用: E2E暗号化の実画面スクショ（設定パネル / リカバリキー / 解錠画面）＋ 安全性ページ
import { chromium } from 'playwright';
const BASE = process.env.APP_URL || 'http://localhost:4173/';
const shot = (p, n) => p.screenshot({ path: new URL(`./shots/${n}`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });
const demo = {
  accounts: [{ id: 'a02', code: '1002', name: '普通預金', type: 'asset', sys: 1 }, { id: 'e09', code: '5009', name: '住居費', type: 'expense', sys: 1 }],
  journals: [{ id: 'j1', date: '2026-06-16', desc: '家賃', lines: [{ accountId: 'e09', side: 'dr', amount: 80000 }, { accountId: 'a02', side: 'cr', amount: 80000 }] }],
  tags: [], wallets: [], budgets: [], presets: [], recurring: [], rules: [], allocs: [],
};
const inject = (p) => p.addInitScript((d) => {
  localStorage.setItem('kk_guest', '1'); localStorage.setItem('kk4_guest', JSON.stringify(d));
  localStorage.setItem('kk_theme', 'light'); localStorage.setItem('kk_onboarded', '1');
  localStorage.setItem('kk_guest_promo', '1'); localStorage.setItem('kk_update_seen', '2026-06-14');
}, demo);
const nav = async (p, label) => { await p.locator('.s-item', { hasText: label }).first().click(); await p.waitForTimeout(500); };

const run = async () => {
  const b = await chromium.launch({ channel: 'chrome', headless: true });

  // アプリ（デスクトップ・ライト）
  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  p.on('dialog', (d) => d.accept());
  await inject(p);
  await p.goto(BASE, { waitUntil: 'networkidle' });
  await p.waitForSelector('.s-item', { timeout: 30000 });
  await p.waitForTimeout(400);

  // 設定 → 暗号化を有効化
  await nav(p, '設定');
  await p.getByRole('button', { name: '端末データを暗号化する' }).click();
  await p.waitForTimeout(400);
  const pw = p.locator('.md input[type="password"]');
  await pw.nth(0).fill('my-passphrase-123');
  await pw.nth(1).fill('my-passphrase-123');
  await p.getByRole('button', { name: '有効にする' }).click();
  await p.waitForTimeout(700);
  await shot(p, 's-e2e-recovery.png'); // リカバリキー保存モーダル
  await p.getByRole('button', { name: /保存しました/ }).click();
  await p.waitForTimeout(400);
  await shot(p, 's-e2e-settings.png'); // 有効化後の設定パネル

  // 鍵を消して解錠画面を見せる
  await p.evaluate(() => new Promise((res) => { const r = indexedDB.deleteDatabase('kk_e2e'); r.onsuccess = r.onerror = r.onblocked = () => res(); }));
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForTimeout(900);
  await shot(p, 's-e2e-unlock.png'); // ロック画面
  await ctx.close();

  // 安全性ページ（公開済み）
  const ctx2 = await b.newContext({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 2 });
  const p2 = await ctx2.newPage();
  await p2.goto('https://kurofukubo.com/security.html', { waitUntil: 'networkidle' }).catch(() => {});
  await p2.waitForTimeout(700);
  await shot(p2, 's-e2e-securitypage.png');
  await ctx2.close();

  await b.close();
  console.log('DONE');
};
run().catch((e) => { console.error('ERROR', e); process.exit(1); });
