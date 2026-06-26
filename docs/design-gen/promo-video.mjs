// 宣伝用デモ動画の録画（Playwright recordVideo）。
// 仕分け入力 → 自動で複式仕訳 → 仕訳帳 → ダッシュボードを、字幕＋タイトルカード付きで実演。
// 出力: shots/video/promo.webm  （ffmpeg で mp4 化・編集に渡せる）
import { chromium } from 'playwright';
import { rename } from 'node:fs/promises';

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
  ],
  tags: [], wallets: [], budgets: [], presets: [], recurring: [], rules: [], allocs: [],
};

const inject = (page) => page.addInitScript((d) => {
  localStorage.setItem('kk_guest', '1'); localStorage.setItem('kk4_guest', JSON.stringify(d));
  localStorage.setItem('kk_theme', 'light'); localStorage.setItem('kk_onboarded', '1');
  localStorage.setItem('kk_guest_promo', '1'); localStorage.setItem('kk_update_seen', '2026-06-14');
}, demo);

// 下部の字幕
const cap = (page, text) => page.evaluate((t) => {
  let el = document.getElementById('__cap');
  if (!el) {
    el = document.createElement('div'); el.id = '__cap';
    el.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99999;padding:54px 28px 26px;text-align:center;color:#fff;font:600 26px/1.5 "Zen Kaku Gothic New",sans-serif;background:linear-gradient(transparent,rgba(0,0,0,.8));pointer-events:none;transition:opacity .3s;';
    document.body.appendChild(el);
  }
  el.textContent = t; el.style.opacity = t ? '1' : '0';
}, text);

// 全画面タイトル/エンドカード
const card = (page, title, sub) => page.evaluate(([t, s]) => {
  let el = document.getElementById('__card');
  if (!el) {
    el = document.createElement('div'); el.id = '__card';
    el.style.cssText = 'position:fixed;inset:0;z-index:100000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:#1a1612;transition:opacity .4s;';
    el.innerHTML = '<div id="__ct" style="font:700 52px/1.2 \'Zen Old Mincho\',serif;color:#c4a460"></div><div id="__cs" style="font:400 22px/1.5 \'Zen Kaku Gothic New\',sans-serif;color:#d8cfc0"></div>';
    document.body.appendChild(el);
  }
  el.style.display = 'flex'; el.style.opacity = '1';
  document.getElementById('__ct').textContent = t;
  document.getElementById('__cs').textContent = s;
}, [title, sub]);

const hideCard = (page) => page.evaluate(() => {
  const el = document.getElementById('__card');
  if (el) { el.style.opacity = '0'; setTimeout(() => { el.style.display = 'none'; }, 400); }
});

const nav = async (page, label) => {
  await page.locator('.s-item', { hasText: label }).first().click();
  await page.waitForTimeout(900);
};

const run = async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    recordVideo: {
      dir: new URL('./shots/video', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
      size: { width: 1280, height: 720 },
    },
  });
  const page = await ctx.newPage();
  await inject(page);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('.s-item', { timeout: 30000 });
  await page.waitForTimeout(700);

  // タイトルカード
  await card(page, 'kurofukubo', '複式簿記でわかる、お金の全体像');
  await page.waitForTimeout(2400);
  await hideCard(page); await page.waitForTimeout(700);

  // ① 仕分け入力
  await nav(page, '仕訳入力');
  await cap(page, '① ワンラインで入力するだけ');
  await page.waitForTimeout(1100);
  const qi = page.getByPlaceholder(/食費 1200/);
  await qi.click();
  await qi.pressSequentially('食費 1200 現金 / コンビニ', { delay: 75 });
  await page.waitForTimeout(1400); // 借方/貸方プレビューを見せる
  await cap(page, '② 自動で正しい複式仕訳に変換');
  await page.waitForTimeout(900);
  await page.getByRole('button', { name: '記帳' }).click();
  await page.waitForTimeout(1300);
  // もう一件
  await qi.click();
  await qi.pressSequentially('交通費 480 普通預金', { delay: 75 });
  await page.waitForTimeout(900);
  await page.getByRole('button', { name: '記帳' }).click();
  await page.waitForTimeout(1300);

  // ③ 仕訳帳
  await nav(page, '仕訳帳');
  await cap(page, '③ 仕訳帳に自動で記録');
  await page.waitForTimeout(2300);

  // ④ ダッシュボード
  await nav(page, 'ダッシュボード');
  await cap(page, '④ 資産・純資産の推移を見える化');
  await page.waitForTimeout(2800);
  await cap(page, '');

  // エンドカード
  await card(page, 'kurofukubo', 'app.kurofukubo.com  ｜  無料で始める');
  await page.waitForTimeout(2600);

  await ctx.close(); // ここで動画ファイルが確定
  let vpath = await page.video().path();
  await browser.close();
  try {
    const out = vpath.replace(/[^\\/]+$/, 'promo.webm');
    await rename(vpath, out);
    vpath = out;
  } catch { /* リネーム失敗時は元名のまま */ }
  console.log('VIDEO:', vpath);
  console.log('DONE');
};
run().catch((e) => { console.error('ERROR', e); process.exit(1); });
