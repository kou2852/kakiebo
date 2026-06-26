// OGPカード最終生成（採用版）。lp/ に命名出力、Bはアプリ public にもコピー。
// A=ogp.png(既定/ブランド) B=ogp-promo.png(宣伝) C=ogp-networth.png(純資産) D=ogp-compare.png(対比)
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const LP = 'C:/dev/BudgetBook/kakeibo-saas/lp';
const PUB = 'C:/dev/BudgetBook/kakeibo-saas/frontend/public';
const FONTS = `<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;700;800&family=Noto+Sans+JP:wght@500;700;800&display=swap" rel="stylesheet">`;
const icon = (s) => `<svg viewBox="0 0 512 512" width="${s}" height="${s}" style="border-radius:${Math.round(s/4)}px;flex:none"><rect width="512" height="512" rx="116" fill="#0b6f66"/><polyline points="118,338 212,300 296,206 392,156" fill="none" stroke="#fff" stroke-width="38" stroke-linecap="round" stroke-linejoin="round"/><polyline points="338,156 392,156 392,210" fill="none" stroke="#fff" stroke-width="38" stroke-linecap="round" stroke-linejoin="round"/><line x1="118" y1="398" x2="394" y2="398" stroke="#bdeee6" stroke-width="20" stroke-linecap="round"/></svg>`;
const shotURI = `data:image/png;base64,${readFileSync('../note-images/full-dashboard.png').toString('base64')}`;
const doc = (style, body) => `<!DOCTYPE html><html><head><meta charset="utf-8">${FONTS}<style>*{margin:0;box-sizing:border-box}body{width:1200px;height:630px;font-family:'Manrope','Noto Sans JP',sans-serif;overflow:hidden}${style}</style></head><body>${body}</body></html>`;

const A = doc(
  `body{background:linear-gradient(135deg,#0d9488,#0f766e);color:#fff;padding:64px 70px;display:flex;flex-direction:column;justify-content:space-between;position:relative}
   .deco{position:absolute;right:-120px;top:-120px;width:520px;height:520px;border-radius:50%;background:rgba(255,255,255,.06)}
   .top{display:flex;align-items:center;gap:20px;position:relative;z-index:1}.wm{font-size:38px;font-weight:800}
   .h1{font-size:74px;font-weight:800;line-height:1.18;letter-spacing:-.03em;position:relative;z-index:1}.h1 .em{color:#c8f5e9}
   .chips{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px}.chip{font-size:23px;font-weight:700;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.28);padding:10px 20px;border-radius:999px}
   .url{font-size:26px;font-weight:700;color:rgba(255,255,255,.85);position:relative;z-index:1}`,
  `<div class="deco"></div><div class="top">${icon(92)}<div class="wm">kurofukubo</div></div>
   <div class="h1">家族の<span class="em">純資産</span>が、<br>見える家計簿。</div>
   <div><div class="chips"><span class="chip">複式簿記ベース</span><span class="chip">NISA・iDeCo・ローンも一つに</span><span class="chip">運営者にも見えないE2E</span></div><div class="url">kurofukubo.com</div></div>`
);

const B = doc(
  `body{display:flex;background:radial-gradient(120% 100% at 0% 0%,#e6f4f1,#f4f7f9 60%,#fff)}
   .left{width:48%;padding:60px 40px 60px 70px;display:flex;flex-direction:column;justify-content:center;color:#14201f}
   .wm{display:flex;align-items:center;gap:14px;font-size:30px;font-weight:800;color:#0d9488;margin-bottom:26px}
   .h1{font-size:50px;font-weight:800;line-height:1.22;letter-spacing:-.03em;white-space:nowrap}.h1 .em{color:#0d9488}
   .sub{font-size:24px;color:#5d6b6a;margin-top:22px;line-height:1.6;font-weight:500}
   .pill{margin-top:30px;align-self:flex-start;background:#0d9488;color:#fff;font-weight:700;font-size:23px;padding:12px 26px;border-radius:999px}
   .right{flex:1;display:flex;align-items:center;justify-content:center;padding:44px 60px 44px 6px}
   .frame{width:548px;height:516px;border-radius:20px;overflow:hidden;box-shadow:0 32px 70px -24px rgba(13,30,40,.5),0 2px 6px rgba(0,0,0,.08);border:1px solid #e6ebec;background:#fff}
   .frame img{width:100%;height:100%;object-fit:cover;object-position:top left}`,
  `<div class="left"><div class="wm">${icon(48)}kurofukubo</div>
     <div class="h1">家族の<span class="em">純資産</span>が、<br>ひと目で。</div>
     <div class="sub">複式簿記ベースの、<br>純資産まで見える無料家計簿</div>
     <div class="pill">登録なしで試す</div></div>
   <div class="right"><div class="frame"><img src="${shotURI}"></div></div>`
);

const C = doc(
  `body{background:linear-gradient(140deg,#0c1a18,#10302b 55%,#0d5b52 150%);color:#fff;padding:60px 70px;display:flex;flex-direction:column;justify-content:center;position:relative}
   .deco{position:absolute;right:-140px;top:-140px;width:520px;height:520px;border-radius:50%;background:rgba(45,212,191,.08)}
   .wm{position:absolute;top:50px;left:70px;display:flex;align-items:center;gap:14px;font-size:28px;font-weight:800}
   .label{font-size:30px;color:#7fd9cc;font-weight:700}
   .num{font-size:118px;font-weight:800;letter-spacing:-.04em;line-height:1.05;font-variant-numeric:tabular-nums;margin-top:6px}
   .delta{font-size:34px;font-weight:700;color:#34d399;margin-top:12px}
   .tag{font-size:27px;color:rgba(255,255,255,.82);margin-top:42px;font-weight:500}`,
  `<div class="deco"></div><div class="wm">${icon(44)}kurofukubo</div>
   <div class="label">我が家の純資産</div><div class="num">¥12,840,000</div>
   <div class="delta">▲ 前月比 +¥124,000</div>
   <div class="tag">「使った額」より、ぜんぶ合わせた“正味”を見る家計簿。</div>`
);

const D = doc(
  `body{display:flex;position:relative}
   .col{flex:1;padding:70px 54px;display:flex;flex-direction:column;justify-content:center}
   .l{background:#eef2f1;color:#5d6b6a}.r{background:linear-gradient(150deg,#0d9488,#0f766e);color:#fff;position:relative}
   .tagn{font-size:25px;font-weight:700;letter-spacing:.04em;opacity:.85;margin-bottom:18px}
   .l .big{font-size:50px;font-weight:800;color:#48555a;line-height:1.25;letter-spacing:-.02em}
   .note{font-size:24px;margin-top:18px;opacity:.7}
   .r .big{font-size:50px;font-weight:800;line-height:1.25;letter-spacing:-.02em}.r .em{color:#c8f5e9}
   .r .sub{font-size:24px;margin-top:18px;color:rgba(255,255,255,.92);line-height:1.5}
   .wm{position:absolute;top:44px;right:54px;font-size:26px;font-weight:800}
   .vs{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:74px;height:74px;border-radius:50%;background:#fff;color:#0d9488;font-weight:800;font-size:26px;display:flex;align-items:center;justify-content:center;box-shadow:0 8px 22px rgba(0,0,0,.2);z-index:2}`,
  `<div class="col l"><div class="tagn">ふつうの家計簿</div><div class="big">今月いくら<br>使った？</div><div class="note">（支出だけ）</div></div>
   <div class="col r"><div class="wm">kurofukubo</div><div class="big">家族の<span class="em">純資産</span>が<br>いくら？</div><div class="sub">資産 − 負債 ＝ 純資産<br>NISA・iDeCo・ローンも込み</div></div>
   <div class="vs">vs</div>`
);

const b = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await b.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
async function render(html, paths) {
  const p = await ctx.newPage();
  await p.setContent(html, { waitUntil: 'networkidle' });
  await p.waitForTimeout(700);
  for (const path of paths) { await p.screenshot({ path }); console.log('  📸', path); }
  await p.close();
}
await render(A, [`${LP}/ogp.png`]);
await render(B, [`${LP}/ogp-promo.png`, `${PUB}/ogp-promo.png`]);
await render(C, [`${LP}/ogp-networth.png`]);
await render(D, [`${LP}/ogp-compare.png`]);
await b.close();
console.log('✅ OGP最終生成 完了');
