// E2E暗号化のUI検証（ゲスト/ローカル）: 有効化→暗号文化→リロードで解錠→データ復元
import { chromium } from 'playwright';
const BASE = process.env.APP_URL || 'http://localhost:4173/';
const shot = (p, n) => p.screenshot({ path: new URL(`./shots/${n}`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });

const demo = {
  accounts: [
    { id: 'a02', code: '1002', name: '普通預金', type: 'asset', sys: 1 },
    { id: 'e09', code: '5009', name: '住居費', type: 'expense', sys: 1 },
  ],
  journals: [{ id: 'j1', date: '2026-06-16', desc: '家賃テスト', lines: [{ accountId: 'e09', side: 'dr', amount: 99999 }, { accountId: 'a02', side: 'cr', amount: 99999 }] }],
  tags: [], wallets: [], budgets: [], presets: [], recurring: [], rules: [], allocs: [],
};
const inject = (page) => page.addInitScript((d) => {
  localStorage.setItem('kk_guest', '1'); localStorage.setItem('kk4_guest', JSON.stringify(d));
  localStorage.setItem('kk_theme', 'light'); localStorage.setItem('kk_onboarded', '1');
  localStorage.setItem('kk_guest_promo', '1'); localStorage.setItem('kk_update_seen', '2026-06-14');
}, demo);

const ls = (page, k) => page.evaluate((key) => localStorage.getItem(key), k);
const nav = async (page, label) => { await page.locator('.s-item', { hasText: label }).first().click(); await page.waitForTimeout(500); };
let pass = true; const must = (l, c) => { if (!c) pass = false; console.log((c ? 'PASS' : 'FAIL') + ' — ' + l); };

const run = async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.accept());
  await inject(page);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('.s-item', { timeout: 30000 });
  await page.waitForTimeout(400);

  // 設定 → 暗号化を有効化
  await nav(page, '設定');
  await page.getByRole('button', { name: '端末データを暗号化する' }).click();
  await page.waitForTimeout(400);
  const pw = page.locator('.md input[type="password"]');
  await pw.nth(0).fill('pass-1234');
  await pw.nth(1).fill('pass-1234');
  await page.getByRole('button', { name: '有効にする' }).click();
  await page.waitForTimeout(700);
  const recoveryKey = (await page.locator('.md .mono').innerText()).trim();
  must('リカバリーキーが表示される', recoveryKey.length >= 10);
  await shot(page, 'enc1-recovery.png');
  await page.getByRole('button', { name: /保存しました/ }).click();
  await page.waitForTimeout(500);

  // localStorage が暗号化されている
  must('平文キー kk4_guest が消えている', (await ls(page, 'kk4_guest')) === null);
  must('暗号メタ __encmeta がある', !!(await ls(page, 'kk4_guest__encmeta')));
  const blob = await ls(page, 'kk4_guest__enc');
  must('暗号文ブロブに平文が出ない', !!blob && !blob.includes('家賃テスト') && !blob.includes('99999'));

  // リロード → 端末に鍵を保持しているので「自動解錠」（パス入力不要）
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  must('リロードで自動解錠（ロック画面が出ない）', !(await page.locator('body').innerText()).includes('ロック中'));
  await page.waitForSelector('.s-item', { timeout: 30000 });
  await nav(page, '仕訳帳');
  await page.waitForTimeout(400);
  must('自動解錠後にデータ表示（家賃テスト）', (await page.locator('body').innerText()).includes('家賃テスト'));

  // 端末の保持鍵を消す（別端末/データ消去相当）→ リロードでロック画面に戻る
  await page.evaluate(() => new Promise((res) => { const r = indexedDB.deleteDatabase('kk_e2e'); r.onsuccess = r.onerror = r.onblocked = () => res(); }));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  must('鍵が無い端末ではロック画面', (await page.locator('body').innerText()).includes('ロック中'));
  await shot(page, 'enc2-unlock.png');

  // 誤パスフレーズ
  await page.locator('input[type="password"]').first().fill('wrong-pass');
  await page.getByRole('button', { name: '解錠' }).click();
  await page.waitForTimeout(600);
  must('誤パスフレーズはエラー表示', (await page.locator('body').innerText()).includes('正しくありません'));

  // 正しいパスフレーズで解錠 → データ復元
  await page.locator('input[type="password"]').first().fill('pass-1234');
  await page.getByRole('button', { name: '解錠' }).click();
  await page.waitForTimeout(800);
  await page.waitForSelector('.s-item', { timeout: 30000 });
  await nav(page, '仕訳帳');
  await page.waitForTimeout(400);
  must('解錠後にデータが復元される（家賃テスト表示）', (await page.locator('body').innerText()).includes('家賃テスト'));

  await ctx.close(); await browser.close();
  console.log(pass ? '\nALL PASS' : '\nSOME FAILED');
  if (!pass) process.exit(1);
};
run().catch((e) => { console.error('ERROR', e); process.exit(1); });
