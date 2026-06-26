// OGPカード画像の候補を4案まとめて生成（1200x630）。ライブのogp.pngは上書きしない。
// 出力: shots/ogp-variants/ogp-{a,b,c,d}.png ＋ 一覧 ogp-ALL.png
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';

const OUT = 'shots/ogp-variants';
mkdirSync(OUT, { recursive: true });

const FONTS = `<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;700;800&family=Noto+Sans+JP:wght@500;700;800&display=swap" rel="stylesheet">`;
const icon = (s) => `<svg viewBox="0 0 512 512" width="${s}" height="${s}" style="border-radius:${Math.round(s/4)}px;flex:none"><rect width="512" height="512" rx="116" fill="#0b6f66"/><polyline points="118,338 212,300 296,206 392,156" fill="none" stroke="#fff" stroke-width="38" stroke-linecap="round" stroke-linejoin="round"/><polyline points="338,156 392,156 392,210" fill="none" stroke="#fff" stroke-width="38" stroke-linecap="round" stroke-linejoin="round"/><line x1="118" y1="398" x2="394" y2="398" stroke="#bdeee6" stroke-width="20" stroke-linecap="round"/></svg>`;

const shotURI = `data:image/png;base64,${readFileSync('../note-images/full-dashboard.png').toString('base64')}`;

const doc = (style, body) => `<!DOCTYPE html><html><head><meta charset="utf-8">${FONTS}<style>*{margin:0;box-sizing:border-box}body{width:1200px;height:630px;font-family:'Manrope','Noto Sans JP',sans-serif;overflow:hidden}${style}</style></head><body>${body}</body></html>`;

// A: 現行ブラッシュアップ（テキスト＋チップ）
const A = doc(
  `body{background:linear-gradient(135deg,#0d9488,#0f766e);color:#fff;padding:64px 70px;display:flex;flex-direction:column;justify-content:space-between;position:relative}
   .deco{position:absolute;right:-120px;top:-120px;width:520px;height:520px;border-radius:50%;background:rgba(255,255,255,.06)}
   .top{display:flex;align-items:center;gap:20px;position:relative;z-index:1}.wm{font-size:38px;font-weight:800}
   .h1{font-size:74px;font-weight:800;line-height:1.18;letter-spacing:-.03em;position:relative;z-index:1}.h1 .em{color:#c8f5e9}
   .chips{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px}.chip{font-size:23px;font-weight:700;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.28);padding:10px 20px;border-radius:999px}
   .url{font-size:26px;font-weight:700;color:rgba(255,255,255,.85);position:relative;z-index:1}`,
  `<div class="deco"></div>
   <div class="top">${icon(92)}<div class="wm">kurofukubo</div></div>
   <div class="h1">家族の<span class="em">純資産</span>が、<br>見える家計簿。</div>
   <div><div class="chips"><span class="chip">複式簿記ベース</span><span class="chip">NISA・iDeCo・ローンも一つに</span><span class="chip">運営者にも見えないE2E</span></div><div class="url">kurofukubo.com</div></div>`
);

// B: 実画面スクショ型
const B = doc(
  `body{display:flex;background:radial-gradient(120% 100% at 0% 0%,#e6f4f1,#f4f7f9 60%,#fff)}
   .left{width:46%;padding:64px 44px 64px 70px;display:flex;flex-direction:column;justify-content:center;color:#14201f}
   .wm{display:flex;align-items:center;gap:14px;font-size:30px;font-weight:800;color:#0d9488;margin-bottom:26px}
   .h1{font-size:58px;font-weight:800;line-height:1.2;letter-spacing:-.03em}.h1 .em{color:#0d9488}
   .sub{font-size:25px;color:#5d6b6a;margin-top:22px;line-height:1.6;font-weight:500}
   .pill{margin-top:30px;align-self:flex-start;background:#0d9488;color:#fff;font-weight:700;font-size:24px;padding:12px 28px;border-radius:999px}
   .right{flex:1;position:relative;display:flex;align-items:center;justify-content:center;padding:44px 56px 44px 6px}
   .frame{width:580px;height:524px;border-radius:20px;overflow:hidden;box-shadow:0 32px 70px -24px rgba(13,30,40,.5),0 2px 6px rgba(0,0,0,.08);border:1px solid #e6ebec;background:#fff}
   .frame img{width:100%;height:100%;object-fit:cover;object-position:top left}`,
  `<div class="left"><div class="wm">${icon(48)}kurofukubo</div>
     <div class="h1">家族の<span class="em">純資産</span>が、<br>ひと目で。</div>
     <div class="sub">複式簿記ベースの、<br>純資産まで見える無料家計簿</div>
     <div class="pill">登録なしで試す</div></div>
   <div class="right"><div class="frame"><img src="${shotURI}"></div></div>`
);

// C: 純資産インパクト型
const C = doc(
  `body{background:linear-gradient(140deg,#0c1a18,#10302b 55%,#0d5b52 150%);color:#fff;padding:60px 70px;display:flex;flex-direction:column;justify-content:center;position:relative}
   .deco{position:absolute;right:-140px;top:-140px;width:520px;height:520px;border-radius:50%;background:rgba(45,212,191,.08)}
   .wm{position:absolute;top:50px;left:70px;display:flex;align-items:center;gap:14px;font-size:28px;font-weight:800}
   .label{font-size:30px;color:#7fd9cc;font-weight:700}
   .num{font-size:118px;font-weight:800;letter-spacing:-.04em;line-height:1.05;font-variant-numeric:tabular-nums;margin-top:6px}
   .delta{font-size:34px;font-weight:700;color:#34d399;margin-top:12px}
   .tag{font-size:27px;color:rgba(255,255,255,.82);margin-top:42px;font-weight:500}`,
  `<div class="deco"></div><div class="wm">${icon(44)}kurofukubo</div>
   <div class="label">我が家の純資産</div>
   <div class="num">¥12,840,000</div>
   <div class="delta">▲ 前月比 +¥124,000</div>
   <div class="tag">「使った額」より、ぜんぶ合わせた“正味”を見る家計簿。</div>`
);

// D: 対比（差別化）型
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

const variants = { a: A, b: B, c: C, d: D };

const b = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await b.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
for (const [k, html] of Object.entries(variants)) {
  const p = await ctx.newPage();
  await p.setContent(html, { waitUntil: 'networkidle' });
  await p.waitForTimeout(700);
  await p.screenshot({ path: `${OUT}/ogp-${k}.png` });
  await p.close();
  console.log('  📸', `${OUT}/ogp-${k}.png`);
}

// 一覧（2x2）
const cell = (k, label) => `<div class="cell"><img src="data:image/png;base64,${readFileSync(`${OUT}/ogp-${k}.png`).toString('base64')}"><span>${label}</span></div>`;
const sheet = doc(
  `body{width:1240px;height:670px;background:#222;display:grid;grid-template-columns:1fr 1fr;gap:14px;padding:14px}
   .cell{position:relative}.cell img{width:100%;height:100%;object-fit:cover;border-radius:8px}
   .cell span{position:absolute;top:8px;left:8px;background:rgba(0,0,0,.6);color:#fff;font-weight:800;font-size:22px;padding:4px 12px;border-radius:6px}`,
  cell('a', 'A 現行ブラッシュアップ') + cell('b', 'B 実画面スクショ') + cell('c', 'C 純資産インパクト') + cell('d', 'D 対比型')
);
const ps = await ctx.newPage();
await ps.setViewportSize({ width: 1240, height: 670 });
await ps.setContent(sheet, { waitUntil: 'networkidle' });
await ps.waitForTimeout(400);
await ps.screenshot({ path: `${OUT}/ogp-ALL.png` });
console.log('  📸', `${OUT}/ogp-ALL.png`);
await b.close();
console.log('✅ 完了 → docs/design-gen/' + OUT);
