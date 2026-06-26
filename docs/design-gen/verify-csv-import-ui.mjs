// MF CSV 取込のUIスモーク（ゲストモード＝localStorage完結。preview起動が前提）。
// フロー: 仕訳入力→CSV取込→MF形式のCSVをアップロード→マッピングパネルで科目割当→取込実行→kk4_guestの仕訳を検証。
// 使い方: フロントを build 後 `npm run preview`（:4173）を起動し、別シェルで
//   SHOT_BASE=http://localhost:4173/?guest node verify-csv-import-ui.mjs
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const BASE = process.env.SHOT_BASE || 'http://localhost:4173/?guest';

// 既定科目（DEFAULT_ACCOUNTS 準拠）。journals は空＝取込分のデルタを検証
const ACCOUNTS = [
  { id: 'a01', code: '1001', name: '現金', type: 'asset', sys: 1 }, { id: 'a02', code: '1002', name: '普通預金', type: 'asset', sys: 1 }, { id: 'a03', code: '1003', name: '定期預金', type: 'asset', sys: 1 }, { id: 'a04', code: '1101', name: '売掛金', type: 'asset', sys: 1 }, { id: 'a05', code: '1201', name: '有価証券', type: 'asset', sys: 1 }, { id: 'a06', code: '1301', name: '固定資産', type: 'asset', sys: 1 },
  { id: 'b01', code: '2001', name: '買掛金', type: 'liability', sys: 1 }, { id: 'b02', code: '2002', name: '未払金', type: 'liability', sys: 1 }, { id: 'b03', code: '2101', name: 'クレジットカード', type: 'liability', sys: 1 }, { id: 'b04', code: '2201', name: '借入金', type: 'liability', sys: 1 },
  { id: 'c01', code: '3001', name: '元入金', type: 'equity', sys: 1 }, { id: 'c02', code: '3101', name: '繰越利益', type: 'equity', sys: 1 },
  { id: 'd01', code: '4001', name: '給与収入', type: 'income', sys: 1 }, { id: 'd02', code: '4002', name: '副業収入', type: 'income', sys: 1 },
  { id: 'e01', code: '5001', name: '食費', type: 'expense', sys: 1 }, { id: 'e02', code: '5002', name: '日用品費', type: 'expense', sys: 1 },
];
const DATASET = { accounts: ACCOUNTS, journals: [], tags: [], allocs: [], wallets: [], presets: [], budgets: [], recurring: [], rules: [] };

// マネーフォワード形式（UTF-8・全角括弧）。m3 は計算対象0＝除外される想定
const MF_CSV = [
  '"計算対象","日付","内容","金額（円）","保有金融機関","大項目","中項目","メモ","振替","ID"',
  '"1","2026/06/03","テストスーパー","-1500","テスト銀行","テスト費目","食料品","","0","m1"',
  '"1","2026/06/25","テスト給与","300000","テスト銀行","テスト収入","給与","","0","m2"',
  '"0","2026/06/02","対象外取引","-999","テスト銀行","テスト費目","","","0","m3"',
].join('\r\n');

const csvPath = join(tmpdir(), 'kk-mf-test.csv');
writeFileSync(csvPath, MF_CSV, 'utf8');

let ng = 0;
const check = (label, ok, extra = '') => { if (!ok) ng++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  ${extra}`}`); };

const b = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addInitScript((ds) => {
  localStorage.setItem('kk4_guest', JSON.stringify(ds));
  localStorage.setItem('kk_guest', '1');
  localStorage.setItem('kk_onboarded', '1');
  localStorage.setItem('kk_update_seen', '2027-12-31');
  localStorage.setItem('kk_guest_promo', '1');
}, DATASET);
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));

try {
  await p.goto(BASE, { waitUntil: 'networkidle' });
  await p.waitForSelector('.s-item', { timeout: 30000 });

  // 仕訳入力ページへ
  await p.locator('.s-item', { hasText: '仕訳入力' }).first().click();
  await p.waitForTimeout(600);

  // CSV取込モーダルを開く
  await p.locator('button', { hasText: 'CSV取込' }).first().click();
  await p.waitForTimeout(400);

  // ファイル投入
  await p.locator('input[type=file]').setInputFiles(csvPath);

  // マッピングパネル（MF検出）を待つ
  await p.waitForSelector('.csv-map', { timeout: 10000 });
  check('MF形式を検出（マッピングパネル表示）', await p.locator('.csv-map', { hasText: 'マネーフォワード' }).count() > 0);

  // パネル内のセレクトをラベルに応じて割当
  const selects = p.locator('.csv-map select.csv-sel');
  const n = await selects.count();
  check('未割当ラベルが3件（テスト銀行/テスト費目/テスト収入）', n === 3, `got=${n}`);
  for (let i = 0; i < n; i++) {
    const sel = selects.nth(i);
    const label = (await sel.locator('xpath=../span').first().innerText()).trim();
    let val = 'e01';
    if (label.includes('銀行') || label.includes('口座')) val = 'a02';
    else if (label.includes('収入') || label.includes('給与')) val = 'd01';
    await sel.selectOption(val);
  }

  // 取込実行
  await p.locator('button', { hasText: '取込実行' }).first().click();
  await p.waitForTimeout(1200);

  // 検証: kk4_guest の仕訳
  const journals = await p.evaluate(() => JSON.parse(localStorage.getItem('kk4_guest') || '{}').journals || []);
  check('仕訳が2件追加された（計算対象0は除外）', journals.length === 2, `got=${journals.length}`);

  const exp = journals.find((j) => j.desc === 'テストスーパー');
  const drOk = exp && exp.lines.some((l) => l.side === 'dr' && l.accountId === 'e01' && l.amount === 1500);
  const crOk = exp && exp.lines.some((l) => l.side === 'cr' && l.accountId === 'a02' && l.amount === 1500);
  check('支出: 借方=食費(e01)1500 / 貸方=普通預金(a02)1500', !!(drOk && crOk), JSON.stringify(exp));

  const inc = journals.find((j) => j.desc === 'テスト給与');
  const idrOk = inc && inc.lines.some((l) => l.side === 'dr' && l.accountId === 'a02' && l.amount === 300000);
  const icrOk = inc && inc.lines.some((l) => l.side === 'cr' && l.accountId === 'd01' && l.amount === 300000);
  check('収入: 借方=普通預金(a02)30万 / 貸方=給与収入(d01)30万', !!(idrOk && icrOk), JSON.stringify(inc));
} catch (e) {
  ng++; console.log('FAIL  例外:', e.message);
} finally {
  if (errs.length) console.log('   ⚠ pageerror:', errs.slice(0, 3));
  await ctx.close();
  await b.close();
}

console.log(ng === 0 ? '\n✅ ALL PASS' : `\n❌ ${ng} FAIL`);
process.exit(ng === 0 ? 0 : 1);
