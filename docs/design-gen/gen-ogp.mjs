import { chromium } from 'playwright';
const icon = `<svg viewBox="0 0 512 512" width="96" height="96" style="border-radius:24px"><rect width="512" height="512" rx="116" fill="#0b6f66"/><polyline points="118,338 212,300 296,206 392,156" fill="none" stroke="#fff" stroke-width="38" stroke-linecap="round" stroke-linejoin="round"/><polyline points="338,156 392,156 392,210" fill="none" stroke="#fff" stroke-width="38" stroke-linecap="round" stroke-linejoin="round"/><line x1="118" y1="398" x2="394" y2="398" stroke="#bdeee6" stroke-width="20" stroke-linecap="round"/></svg>`;
const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;700;800&family=Noto+Sans+JP:wght@500;700;800&display=swap" rel="stylesheet">
<style>
*{margin:0;box-sizing:border-box}
body{width:1200px;height:630px;font-family:'Manrope','Noto Sans JP',sans-serif;
background:linear-gradient(135deg,#0d9488 0%,#0f766e 100%);color:#fff;padding:64px 70px;display:flex;flex-direction:column;justify-content:space-between;position:relative;overflow:hidden}
.deco{position:absolute;right:-120px;top:-120px;width:520px;height:520px;border-radius:50%;background:rgba(255,255,255,.06)}
.deco2{position:absolute;right:60px;bottom:-160px;width:360px;height:360px;border-radius:50%;background:rgba(255,255,255,.05)}
.top{display:flex;align-items:center;gap:22px;position:relative;z-index:1}
.wm{font-size:38px;font-weight:800;letter-spacing:-0.01em}
.h1{font-size:74px;font-weight:800;line-height:1.18;letter-spacing:-0.03em;position:relative;z-index:1}
.h1 .em{color:#c8f5e9}
.sub{position:relative;z-index:1}
.chips{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:18px}
.chip{font-size:24px;font-weight:700;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.28);padding:10px 20px;border-radius:999px}
.url{font-size:26px;font-weight:700;color:rgba(255,255,255,.85)}
</style></head><body>
<div class="deco"></div><div class="deco2"></div>
<div class="top">${icon}<div class="wm">kurofukubo</div></div>
<div class="h1">家族の<span class="em">純資産</span>が、<br>見える家計簿。</div>
<div class="sub">
  <div class="chips"><span class="chip">複式簿記ベース</span><span class="chip">NISA・iDeCo・ローンも一つに</span><span class="chip">運営者にも見えないE2E</span></div>
  <div class="url">kurofukubo.com</div>
</div>
</body></html>`;
const b = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await b.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
const p = await ctx.newPage();
await p.setContent(html, { waitUntil: 'networkidle' });
await p.waitForTimeout(600);
await p.screenshot({ path: 'C:/dev/BudgetBook/kakeibo-saas/lp/ogp.png' });
await p.screenshot({ path: 'shots/redesign-applied/ogp-preview.png' });
await b.close();
console.log('ogp.png 更新');
