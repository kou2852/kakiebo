import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
const SH = 'shots';
const ZI = 'C:/dev/BudgetBook/kakeibo-saas/docs/zenn-images';
const b64 = (p) => 'data:image/png;base64,' + readFileSync(p).toString('base64');
const pairs = [
  ['ba-dashboard',     'ダッシュボード',        'd-01-dashboard.png', 1100],
  ['ba-journal',       '仕訳入力',              'd-02-journal.png',   1100],
  ['ba-bs',            '貸借対照表',            'd-06-bs.png',        1100],
  ['ba-dashboard-mobile','ダッシュボード（モバイル）','m-01-dashboard.png', 720],
];
const b = await chromium.launch({ channel: 'chrome', headless: true });
for (const [out, title, file, w] of pairs) {
  const before = b64(`${SH}/redesign/${file}`);
  const after = b64(`${SH}/redesign-applied/${file}`);
  const imgW = (w - 60) / 2;
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@700;800&family=Noto+Sans+JP:wght@700;800&display=swap" rel="stylesheet">
  <style>
  body{margin:0;background:#eef1f4;font-family:'Manrope','Noto Sans JP',sans-serif;padding:22px}
  .ttl{font-size:18px;font-weight:800;color:#14201f;margin:0 0 14px 2px}
  .row{display:flex;gap:20px;align-items:flex-start}
  .col{flex:1;min-width:0}
  .cap{display:inline-block;font-size:12px;font-weight:800;color:#fff;padding:5px 12px;border-radius:999px;margin-bottom:8px}
  .before .cap{background:#9aa3a0}
  .after .cap{background:#0d9488}
  img{width:${imgW}px;display:block;border-radius:12px;border:1px solid #e0e4e6;box-shadow:0 14px 30px -20px rgba(20,30,40,.35)}
  </style></head><body>
  <div class="ttl">${title}：Before → After</div>
  <div class="row">
    <div class="col before"><span class="cap">Before（旧デザイン）</span><img src="${before}"></div>
    <div class="col after"><span class="cap">After（刷新後）</span><img src="${after}"></div>
  </div></body></html>`;
  const ctx = await b.newContext({ viewport: { width: w + 4, height: 800 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  await p.setContent(html, { waitUntil: 'networkidle' });
  await p.waitForTimeout(500);
  const el = await p.$('body');
  await el.screenshot({ path: `${ZI}/${out}.png` });
  await ctx.close();
  console.log('made', out);
}
await b.close();
console.log('done');
