// 操作紹介メディア生成：一行入力→記帳→反映 を実演し、操作GIF＋ステップ静止画を出力。
// 前提: フロントを build 後 `npm run preview`(:4173) を起動。ゲストモード＝localStorage完結。
// 出力: shots/article-media/op.gif, op-1-input.png, op-2-ledger.png, op-3-dashboard.png
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import gifenc from 'gifenc';
const { GIFEncoder, quantize, applyPalette } = gifenc;
import { PNG } from 'pngjs';

const BASE = process.env.APP_URL || 'http://localhost:4173/';
const OUT = 'shots/article-media';
mkdirSync(OUT, { recursive: true });

const dr = (a, n) => ({ accountId: a, side: 'dr', amount: n });
const cr = (a, n) => ({ accountId: a, side: 'cr', amount: n });
let i = 0; const J = (d, desc, l) => ({ id: 'j' + (++i), date: d, desc, lines: l });
const demo = {
  accounts: [
    { id: 'a01', code: '1001', name: '現金', type: 'asset', sys: 1 },
    { id: 'a02', code: '1002', name: '普通預金', type: 'asset', sys: 1 },
    { id: 'a05', code: '1201', name: '有価証券', type: 'asset', sys: 1 },
    { id: 'e01', code: '5001', name: '食費', type: 'expense', sys: 1 },
    { id: 'e02', code: '5002', name: '日用品費', type: 'expense', sys: 1 },
    { id: 'e05', code: '5005', name: '交通費', type: 'expense', sys: 1 },
    { id: 'd01', code: '4001', name: '給与収入', type: 'income', sys: 1 },
    { id: 'b03', code: '2101', name: 'クレジットカード', type: 'liability', sys: 1 },
    { id: 'c01', code: '3001', name: '元入金', type: 'equity', sys: 1 },
  ],
  journals: [
    J('2026-04-01', '期首残高', [dr('a01', 60000), dr('a02', 1600000), dr('a05', 1200000), cr('c01', 2860000)]),
    J('2026-06-01', '6月給与', [dr('a02', 250000), cr('d01', 250000)]),
    J('2026-06-03', 'スーパー', [dr('e01', 3280), cr('a01', 3280)]),
    J('2026-06-05', 'ドラッグストア', [dr('e02', 1580), cr('a01', 1580)]),
    J('2026-06-08', '電車', [dr('e05', 1200), cr('a02', 1200)]),
  ],
  tags: [], wallets: [], budgets: [], presets: [], recurring: [], rules: [], allocs: [],
};

const b = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await b.newContext({ viewport: { width: 1040, height: 600 }, deviceScaleFactor: 1 });
const p = await ctx.newPage();
await p.addInitScript((d) => {
  localStorage.setItem('kk_guest', '1'); localStorage.setItem('kk4_guest', JSON.stringify(d));
  localStorage.setItem('kk_theme', 'light'); localStorage.setItem('kk_onboarded', '1');
  localStorage.setItem('kk_guest_promo', '1'); localStorage.setItem('kk_update_seen', '2027-12-31');
}, demo);
await p.goto(BASE, { waitUntil: 'networkidle' });
await p.waitForSelector('.s-item', { timeout: 30000 });
await p.waitForTimeout(700);

// 上部のゲスト帯など邪魔な要素があれば隠す（テキスト一致でベストエフォート）
await p.evaluate(() => {
  for (const el of document.querySelectorAll('div,section,aside')) {
    const t = (el.textContent || '').trim();
    if (t.length < 90 && (t.includes('ゲストモード') || t.includes('端末にのみ保存されます'))) el.style.display = 'none';
    if (t.startsWith('アカウント登録でデータを安全に保存')) el.style.display = 'none';
  }
});

const nav = async (label) => { await p.locator('.s-item', { hasText: label }).first().click(); await p.waitForTimeout(800); };

const frames = [];
const snap = async (delay = 110) => { frames.push({ buf: await p.screenshot({ type: 'png' }), delay }); };

// ── 操作の実演（フレーム収集）──
await nav('仕訳入力');
await snap(900); // 初期（少し保持）
const qi = p.getByPlaceholder(/食費 1200/);
await qi.click();
const text = '食費 1200 現金 / コンビニ';
let typed = '';
for (let c = 0; c < text.length; c += 2) {        // 2文字ずつ＝タイピング風
  typed = text.slice(0, c + 2);
  await qi.fill(typed);
  await snap(95);
}
await snap(1300); // 入力完了を保持
// この状態でステップ静止画①
await p.screenshot({ path: `${OUT}/op-1-input.png` });

// 記帳
await p.getByRole('button', { name: '記帳', exact: true }).click();
await p.waitForTimeout(450);
await snap(1000); // トースト＆入力クリア

// 仕訳帳に反映
await nav('仕訳帳');
await snap(1700);
await p.screenshot({ path: `${OUT}/op-2-ledger.png` });

// ダッシュボード（純資産）
await nav('ダッシュボード');
await snap(1900);
await p.screenshot({ path: `${OUT}/op-3-dashboard.png` });

await b.close();

// ── GIFエンコード ──
const enc = GIFEncoder();
for (const f of frames) {
  const png = PNG.sync.read(f.buf);
  const { data, width, height } = png;
  const palette = quantize(data, 128, { format: 'rgb565' });
  const index = applyPalette(data, palette, 'rgb565');
  enc.writeFrame(index, width, height, { palette, delay: f.delay });
}
enc.finish();
writeFileSync(`${OUT}/op.gif`, enc.bytes());
const kb = Math.round(enc.bytes().length / 1024);
console.log(`  🎞  ${OUT}/op.gif  (${frames.length} frames, ${kb} KB)`);
console.log(`  📸 ${OUT}/op-1-input.png / op-2-ledger.png / op-3-dashboard.png`);
console.log('✅ 完了');
