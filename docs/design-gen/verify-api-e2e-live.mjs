// ログイン中(API)経路のE2E暗号化を通し検証する。
// 本番バックエンド(/api/encdata 配備済み)に対し、使い捨てユーザーでログインし
//  有効化 → 暗号化モードで科目追加 → リロードで自動解錠 → 鍵消去でロック → パス解錠 → リカバリ解錠
// を確認する。サーバーに平文が残らないかは別途 DynamoDB で確認。
import { chromium } from 'playwright';

const BASE = process.env.APP_URL || 'http://localhost:4188/';
const EMAIL = 'kk-e2e-verify-0617@example.com';
const LOGINPW = 'Verify-Pass-12345!';
const PASS = 'verify-pass-phrase-123';
const ACCT = 'E2E-SECRET-ACCT-9173'; // 暗号化後に追加する科目名（DynamoDBで平文露出を確認する目印）

let failed = 0;
const ok = (c, m) => { console.log(`${c ? '✅ PASS' : '❌ FAIL'}: ${m}`); if (!c) failed++; };

const run = async () => {
  const b = await chromium.launch({ channel: 'chrome', headless: true });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  // 初回ログインのオンボーディング/更新情報モーダルを抑止（kk_guest は設定しない＝ログイン維持）
  await ctx.addInitScript(() => {
    localStorage.setItem('kk_onboarded', '1');
    localStorage.setItem('kk_update_seen', '2026-12-31');
    localStorage.setItem('kk_theme', 'light');
    localStorage.setItem('kk_guest_promo', '1');
  });
  const p = await ctx.newPage();
  p.on('dialog', (d) => d.accept());
  p.on('console', (m) => { const t = m.text(); if (/失敗|error|Error/.test(t)) console.log('  [browser]', t); });

  // 1) ログイン
  await p.goto(BASE, { waitUntil: 'networkidle' });
  await p.locator('input[type="email"]').fill(EMAIL);
  await p.locator('input[type="password"]').fill(LOGINPW);
  await p.getByRole('button', { name: 'ログイン', exact: true }).click();
  await p.waitForSelector('.s-item', { timeout: 30000 }).catch(() => {});
  ok(await p.locator('.s-item').count() > 0, 'ログイン成功（APIモードでアプリ表示）');
  // 念のため残存モーダルを閉じる
  for (let i = 0; i < 3 && await p.locator('.mo.open').count() > 0; i++) { await p.keyboard.press('Escape'); await p.waitForTimeout(300); }

  // 2) 設定 → ゲートが開いているか（「準備中」が出ないこと）
  await p.locator('.s-item', { hasText: '設定' }).first().click();
  await p.waitForTimeout(600);
  const gateClosed = await p.getByText('現在この機能の対象外です').count();
  ok(gateClosed === 0, 'ログイン中でも暗号化UIが出る（ゲート開放）');
  ok(await p.getByRole('button', { name: '端末データを暗号化する' }).count() > 0, '「端末データを暗号化する」ボタンあり');

  // 3) 有効化
  await p.getByRole('button', { name: '端末データを暗号化する' }).click();
  await p.waitForTimeout(300);
  const pw = p.locator('.md input[type="password"]');
  await pw.nth(0).fill(PASS);
  await pw.nth(1).fill(PASS);
  await p.getByRole('button', { name: '有効にする', exact: true }).click();
  await p.waitForTimeout(2200);
  const recKey = (await p.locator('.mono').first().innerText().catch(() => '')).trim();
  ok(recKey.length > 10, `リカバリキー発行（${recKey.slice(0, 8)}…）`);
  await p.getByRole('button', { name: /保存しました/ }).click();
  await p.waitForTimeout(600);
  ok(await p.getByText('運営者でも復号できません').count() > 0, '有効化後パネル表示（運営者でも復号できません）');

  // 4) 暗号化モードで科目を追加（平文としてサーバーに出ないはず）
  await p.locator('.s-item', { hasText: '科目' }).first().click();
  await p.waitForTimeout(500);
  await p.getByRole('button', { name: '＋ 科目' }).click();
  await p.waitForTimeout(300);
  await p.locator('.md input[type="text"]').first().fill(ACCT);
  await p.getByRole('button', { name: '保存', exact: true }).click();
  await p.waitForTimeout(4500); // 暗号文ブロブのサーバー保存を待つ
  ok(await p.getByText(ACCT).count() > 0, '科目を追加（画面に表示）');

  // 5) リロード → 端末保持の鍵で自動解錠（パス入力なし）
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForTimeout(3000);
  const lockedAfterReload = await p.getByText('🔒 ロック中').count();
  ok(lockedAfterReload === 0, 'リロードで自動解錠（ロック画面が出ない）');
  await p.locator('.s-item', { hasText: '科目' }).first().click();
  await p.waitForTimeout(700);
  ok(await p.getByText(ACCT).count() > 0, '暗号化往復後も科目が復元される（ラウンドトリップOK）');

  // 6) 端末の鍵を消す → リロードでロック
  await p.evaluate(() => new Promise((res) => { const r = indexedDB.deleteDatabase('kk_e2e'); r.onsuccess = r.onerror = r.onblocked = () => res(); }));
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForTimeout(3000);
  ok(await p.getByText('🔒 ロック中').count() > 0, '鍵消去後はロック画面（別端末相当）');

  // 7) パスフレーズで解錠
  await p.locator('input.fc').first().fill(PASS);
  await p.getByRole('button', { name: '解錠', exact: true }).click();
  await p.waitForTimeout(3000);
  ok(await p.locator('.s-item').count() > 0 && await p.getByText('🔒 ロック中').count() === 0, 'パスフレーズで解錠成功');
  await p.locator('.s-item', { hasText: '科目' }).first().click();
  await p.waitForTimeout(700);
  ok(await p.getByText(ACCT).count() > 0, 'パス解錠後も科目が見える');

  // 8) 鍵消去 → リカバリキーで解錠
  await p.evaluate(() => new Promise((res) => { const r = indexedDB.deleteDatabase('kk_e2e'); r.onsuccess = r.onerror = r.onblocked = () => res(); }));
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForTimeout(3000);
  ok(await p.getByText('🔒 ロック中').count() > 0, '再ロック確認');
  await p.getByText('パスフレーズを忘れた場合').click();
  await p.waitForTimeout(300);
  await p.locator('input.fc').first().fill(recKey);
  await p.getByRole('button', { name: '解錠', exact: true }).click();
  await p.waitForTimeout(3500);
  ok(await p.locator('.s-item').count() > 0 && await p.getByText('🔒 ロック中').count() === 0, 'リカバリキーで解錠成功');
  await p.locator('.s-item', { hasText: '科目' }).first().click();
  await p.waitForTimeout(700);
  ok(await p.getByText(ACCT).count() > 0, 'リカバリ解錠後も科目が見える');

  await ctx.close();
  await b.close();
  console.log(`\n=== ${failed === 0 ? 'ALL PASS' : failed + ' FAILED'} ===`);
  process.exit(failed === 0 ? 0 : 1);
};
run().catch((e) => { console.error('ERROR', e); process.exit(1); });
