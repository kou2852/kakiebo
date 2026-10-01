// App Store のスクリーンショットを、iPhone と iPad の両方について1つの定義から作る。
//   node build.mjs  → gen/*.html を書き出す（画像にするのは render.sh）
//
// 型（2026-09-30〜10-01 に他の家計簿アプリのストア画像を分析して決めた）:
//   - 1・2枚目は2枚で1つの絵。傾けた端末が境目をまたぎ、主役の数字を端末の外に大きく浮かせる
//   - 境目の上に文字を置かない（ストアの隙間で割れて読めない）
//   - 3枚目以降は「見出し＋少し傾けた端末＋浮かせた部品1つ」
// ⚠ 浮かせる数字は、実際の画面に出ている値と同じにする（審査 2.3）。撮り直したら必ず合わせる。
// ⚠ 一行入力は出さない（訴求の主役は純資産とタグ配分）。
import fs from 'fs';

const DEVICES = {
  iphone: {
    W: 1320, H: 2868, u: 1, v: 1, shot: (n) => `../../screenshots/${n}.png`,
    frame: { w: 900, pad: 26, radius: 118 }, bigW: 1100, singleTop: 960,
    shots: { dashboard: '01_dashboard', bs: '03_balance_sheet', card: '04_credit_card' },
  },
  ipad: {
    // v: 浮かせる部品の縦位置の倍率（iPad は部品が大きいので上げないと下で切れる）
    W: 2064, H: 2752, u: 1.3, v: 0.8, shot: (n) => `../../screenshots/${n}.png`,
    frame: { w: 1560, pad: 34, radius: 90 }, bigW: 1800, singleTop: 1000,
    shots: { dashboard: 'ipad_01_dashboard', bs: 'ipad_03_balance_sheet', card: 'ipad_04_credit_card' },
  },
};

// 実際の画面の値（2026-09-06 に撮った画面。撮り直したらここを直す）
const V = {
  netWorth: '¥1,650,640',
  assets: '¥1,740,770', liabilities: '¥90,130',
  bank: '¥1,106,430',
  // タグ配分は demo-data.mjs の allocs（10/1 追加）。未配分は投入日の残高で変わるので撮影後に合わせる
  alloc: [['生活費', '#2f9e8d', 300000], ['旅行', '#5b8def', 200000], ['積立', '#e0a526', 400000]],
  unalloc: 206430,
  ccNext: '¥43,270', ccNextLabel: '次回引落（9/10）',
};
const yen = (n) => '¥' + n.toLocaleString('en-US');

const css = (d) => `
@import url('https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@500;700;900&display=swap');
* { margin: 0; padding: 0; box-sizing: border-box; }
:root { --u: ${d.u}; --mint: #8be6d6; --ac: #0f7a6c; }
body { height: ${d.H}px; overflow: hidden; position: relative; color: #fff;
  font-family: 'Zen Kaku Gothic New', 'Yu Gothic', sans-serif; -webkit-font-smoothing: antialiased;
  background: linear-gradient(115deg, #146a5f 0%, #17897a 55%, #1c9e8b 100%); }
.deco { position: absolute; border-radius: 50%; background: rgba(255,255,255,.07); }
.panel { position: absolute; top: 0; width: ${d.W}px; height: ${d.H}px; }
.head { position: absolute; top: calc(190px * var(--u)); left: calc(110px * var(--u)); right: calc(90px * var(--u)); z-index: 5; }
.eyebrow { font-size: calc(46px * var(--u)); font-weight: 700; letter-spacing: .12em; color: var(--mint); }
h1 { margin-top: calc(34px * var(--u)); font-size: calc(128px * var(--u)); font-weight: 900; line-height: 1.28; letter-spacing: -.01em; }
h1 em { font-style: normal; color: var(--mint); }
.sub { margin-top: calc(30px * var(--u)); font-size: calc(50px * var(--u)); font-weight: 700; line-height: 1.5; color: rgba(255,255,255,.88); }
.badges { display: flex; gap: calc(20px * var(--u)); margin-top: calc(44px * var(--u)); flex-wrap: wrap; }
.badges span { font-size: calc(42px * var(--u)); font-weight: 700; border: 3px solid rgba(255,255,255,.55); border-radius: 999px; padding: calc(14px * var(--u)) calc(32px * var(--u)); }
.dev { position: absolute; background: #10151a; padding: ${d.frame.pad}px; border-radius: ${d.frame.radius}px; z-index: 2;
  box-shadow: 0 90px 160px -60px rgba(0,0,0,.55), 0 0 0 3px rgba(255,255,255,.08) inset; }
.dev img, .dev .todo { display: block; width: 100%; border-radius: ${d.frame.radius - d.frame.pad}px; }
.dev .todo { aspect-ratio: ${d === DEVICES.ipad ? '2064 / 2752' : '1242 / 2688'}; background: #e9eeec; color: #7b8580; display: flex; align-items: center; justify-content: center; text-align: center; font-size: calc(56px * var(--u)); font-weight: 700; line-height: 1.6; }
.card { position: absolute; z-index: 4; background: #fff; color: #16191c; border-radius: calc(56px * var(--u)); padding: calc(56px * var(--u)) calc(60px * var(--u));
  box-shadow: 0 60px 120px -40px rgba(0,0,0,.5); }
.card .lb { font-size: calc(44px * var(--u)); font-weight: 700; color: #5c656d; }
.card .big { font-size: calc(128px * var(--u)); font-weight: 900; color: var(--ac); letter-spacing: -.02em; line-height: 1.1; margin-top: calc(10px * var(--u)); }
.row { display: flex; align-items: center; gap: calc(22px * var(--u)); font-size: calc(50px * var(--u)); font-weight: 700; margin-top: calc(30px * var(--u)); }
.row i { width: calc(30px * var(--u)); height: calc(30px * var(--u)); border-radius: 50%; flex: none; }
.row span { flex: 1; } .row b { font-weight: 900; }
.row.total { border-top: 3px solid #e3e8e6; padding-top: calc(30px * var(--u)); }
.row.total b { color: var(--ac); font-size: calc(64px * var(--u)); }
.bar { display: flex; height: calc(26px * var(--u)); border-radius: 13px; overflow: hidden; margin-top: calc(30px * var(--u)); }
.tag { position: absolute; z-index: 5; background: #fff; color: #16191c; border-radius: 999px; padding: calc(26px * var(--u)) calc(50px * var(--u));
  font-size: calc(58px * var(--u)); font-weight: 900; display: flex; align-items: center; gap: calc(20px * var(--u)); box-shadow: 0 40px 80px -30px rgba(0,0,0,.45); }
.tag i { width: calc(34px * var(--u)); height: calc(34px * var(--u)); border-radius: 50%; }
.feat { display: flex; align-items: center; gap: calc(34px * var(--u)); font-size: calc(58px * var(--u)); font-weight: 900; }
.feat + .feat { margin-top: calc(44px * var(--u)); }
.feat svg { width: calc(104px * var(--u)); height: calc(104px * var(--u)); flex: none; }
.receipt { position: absolute; z-index: 4; background: #fffdf8; color: #2a2a2a; width: calc(560px * var(--u)); padding: calc(60px * var(--u)) calc(56px * var(--u)) calc(90px * var(--u));
  font-size: calc(40px * var(--u)); line-height: 1.7; box-shadow: 0 60px 120px -40px rgba(0,0,0,.5);
  clip-path: polygon(0 0,100% 0,100% 96%,95% 100%,90% 96%,85% 100%,80% 96%,75% 100%,70% 96%,65% 100%,60% 96%,55% 100%,50% 96%,45% 100%,40% 96%,35% 100%,30% 96%,25% 100%,20% 96%,15% 100%,10% 96%,5% 100%,0 96%); }
.receipt h4 { text-align: center; font-size: calc(46px * var(--u)); margin-bottom: calc(24px * var(--u)); }
.receipt p { display: flex; justify-content: space-between; }
.receipt .sum { border-top: 2px dashed #999; margin-top: calc(20px * var(--u)); padding-top: calc(16px * var(--u)); font-weight: 900; font-size: calc(48px * var(--u)); }
svg.trend { position: absolute; inset: 0; z-index: 1; }
`;

const ICON = {
  lock: '<svg viewBox="0 0 48 48"><rect x="4" y="4" width="40" height="40" rx="12" fill="#e6f2f0"/><rect x="15" y="22" width="18" height="14" rx="3" fill="#0f7a6c"/><path d="M18 22v-4a6 6 0 0 1 12 0v4" fill="none" stroke="#0f7a6c" stroke-width="3.5"/></svg>',
  bank: '<svg viewBox="0 0 48 48"><rect x="4" y="4" width="40" height="40" rx="12" fill="#e6f2f0"/><path d="M12 20h24L24 12z" fill="#0f7a6c"/><path d="M15 22v10M21 22v10M27 22v10M33 22v10M12 35h24" stroke="#0f7a6c" stroke-width="3"/><path d="M10 38 38 10" stroke="#cf4436" stroke-width="3.5"/></svg>',
  shield: '<svg viewBox="0 0 48 48"><rect x="4" y="4" width="40" height="40" rx="12" fill="#e6f2f0"/><path d="M24 11l11 4v8c0 7-5 12-11 14-6-2-11-7-11-14v-8z" fill="#0f7a6c"/><path d="M19 24l4 4 7-8" fill="none" stroke="#fff" stroke-width="3"/></svg>',
};

const page = (d, body, cls, w) => `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<!-- build.mjs が生成。直接直さない -->
<style>${css(d)}
body { width: ${w}px; }</style></head><body class="${cls}">
${body}
</body></html>
`;
const img = (d, key) => `<img src="${d.shot(d.shots[key])}" alt="">`;
const todo = (text) => `<div class="todo">撮影待ち<br>${text}</div>`;
const head = (eyebrow, h1, extra = '') => `<div class="head"><div class="eyebrow">${eyebrow}</div><h1>${h1}</h1>${extra}</div>`;
const u = (d, px) => Math.round(px * d.u);
const y = (d, px) => Math.round(px * d.v);

function pair(d) {
  const W = d.W * 2;
  const total = V.alloc.reduce((s, [, , n]) => s + n, 0) + V.unalloc;
  return page(d, `
<div class="deco" style="width:${u(d, 1300)}px;height:${u(d, 1300)}px;left:${-u(d, 420)}px;top:${d.H - u(d, 960)}px"></div>
<div class="deco" style="width:${u(d, 900)}px;height:${u(d, 900)}px;left:${W - u(d, 740)}px;top:${-u(d, 260)}px"></div>
<div class="panel" style="left:0">${head('複式簿記の家計簿', '資産も借金も、<br><em>純資産</em>ひとつで。', '<div class="badges"><span>銀行連携なし</span><span>登録なしで試せる</span></div>')}</div>
<div class="panel" style="left:${d.W}px">${head('タグ配分', '口座のお金を、<br><em>目的ごと</em>に。')}</div>
<div class="dev" style="width:${d.bigW}px;top:${u(d, 1020)}px;left:${d.W}px;transform:translateX(-50%) rotate(-6deg)">${img(d, 'dashboard')}</div>
<div class="card" style="top:${y(d, 1320)}px;left:${u(d, 70)}px;width:${u(d, 820)}px;transform:rotate(-3deg)">
  <div class="lb">純資産（今日）</div><div class="big">${V.netWorth}</div>
  <svg width="${u(d, 700)}" height="${u(d, 170)}" viewBox="0 0 700 170" style="display:block;margin-top:${u(d, 26)}px"><polyline points="10,150 140,150 280,150 420,40 560,30 690,32" fill="none" stroke="#0f7a6c" stroke-width="12" stroke-linejoin="round" stroke-linecap="round"/><g fill="#0f7a6c"><circle cx="10" cy="150" r="13"/><circle cx="140" cy="150" r="13"/><circle cx="280" cy="150" r="13"/><circle cx="420" cy="40" r="13"/><circle cx="560" cy="30" r="13"/><circle cx="690" cy="32" r="13"/></g></svg>
</div>
<div class="tag" style="left:${d.W - u(d, 390)}px;top:${d.H - u(d, 540)}px;transform:rotate(-8deg)"><i style="background:${V.alloc[0][1]}"></i>${V.alloc[0][0]}</div>
<div class="tag" style="left:${d.W + u(d, 100)}px;top:${y(d, 1440)}px;transform:rotate(6deg)"><i style="background:${V.alloc[1][1]}"></i>${V.alloc[1][0]}</div>
<div class="tag" style="left:${d.W + u(d, 150)}px;top:${d.H - u(d, 390)}px;transform:rotate(-4deg)"><i style="background:${V.alloc[2][1]}"></i>${V.alloc[2][0]}</div>
<div class="card" style="top:${y(d, 1700)}px;left:${W - u(d, 810)}px;width:${u(d, 740)}px;transform:rotate(3deg)">
  <div class="lb">普通預金 ${V.bank}</div>
  <div class="bar">${V.alloc.map(([, c, n]) => `<div style="flex:${n};background:${c}"></div>`).join('')}<div style="flex:${V.unalloc};background:#d5dbd9"></div></div>
  ${V.alloc.map(([name, c, n]) => `<div class="row"><i style="background:${c}"></i><span>${name}</span><b>${yen(n)}</b></div>`).join('\n  ')}
  <div class="row" style="color:#5c656d"><i style="background:#d5dbd9"></i><span>未配分</span><b>${yen(V.unalloc)}</b></div>
</div>
<!-- 合計 ${yen(total)}（普通預金の残高と一致させること） -->`, 'pair', W);
}

// 3枚目以降。side: 端末を右に寄せるか左に寄せるか
function single(d, { eyebrow, h1, sub, screen, side = 'right', tilt = 4, float }) {
  const devW = d.frame.w;
  const left = side === 'right' ? d.W - devW - u(d, 30) : u(d, 30);
  return page(d, `
<div class="deco" style="width:${u(d, 1000)}px;height:${u(d, 1000)}px;left:${side === 'right' ? -u(d, 500) : d.W - u(d, 500)}px;top:${d.H - u(d, 900)}px"></div>
${head(eyebrow, h1, sub ? `<div class="sub">${sub}</div>` : '')}
<div class="dev" style="width:${devW}px;top:${d.singleTop}px;left:${left}px;transform:rotate(${side === 'right' ? tilt : -tilt}deg)">${screen}</div>
${float(d, side)}`, 'single', d.W);
}

const SLIDES = (d) => [
  ['03', single(d, {
    eyebrow: '記帳するだけ', h1: '貸借対照表も、<br><em>自動</em>で。', screen: img(d, 'bs'), side: 'right',
    float: (d) => `<div class="card" style="top:${y(d, 1650)}px;left:${u(d, 60)}px;width:${u(d, 760)}px;transform:rotate(-3deg)">
  <div class="row" style="margin-top:0"><span>資産合計</span><b>${V.assets}</b></div>
  <div class="row"><span>負債合計</span><b>${V.liabilities}</b></div>
  <div class="row total"><span>純資産</span><b>${V.netWorth}</b></div>
</div>`,
  })],
  // 1.0.2 では外す（実機で撮るとテスト広告が写るため撮れなかった）。撮れたら戻す
  ['_receipt', single(d, {
    eyebrow: 'レシート撮影', h1: 'レシートは、<br><em>撮るだけ</em>。', sub: '文字の読み取りは端末の中だけで行います',
    screen: todo('撮影と読み取り結果'), side: 'right',
    // ⚠ レシートは撮影に使った実物と同じ内容に差し替える（画面の読み取り結果と食い違わないように）
    float: (d) => `<div class="receipt" style="top:${y(d, 1500)}px;left:${u(d, 90)}px;transform:rotate(-7deg)">
  <h4>スーパーマルエツ</h4>
  <p><span>牛乳</span><span>¥228</span></p><p><span>食パン</span><span>¥198</span></p><p><span>たまご</span><span>¥258</span></p><p><span>バナナ</span><span>¥178</span></p>
  <p class="sum"><span>合計</span><span>¥862</span></p>
</div>`,
  })],
  ['04', single(d, {
    eyebrow: 'クレジットカード', h1: 'カードの引落し、<br><em>先まで</em>見える。', screen: img(d, 'card'), side: 'left',
    float: (d) => `<div class="card" style="top:${y(d, 1750)}px;left:${d.W - u(d, 800)}px;width:${u(d, 740)}px;transform:rotate(3deg)">
  <div class="lb">${V.ccNextLabel}</div><div class="big" style="color:#cf4436">${V.ccNext}</div>
  <div class="row"><span style="color:#5c656d">メインカード → 普通預金</span></div>
</div>`,
  })],
  ['_safety', single(d, {
    eyebrow: '安心して使える', h1: '銀行連携なし。<br><em>だから安心</em>。',
    screen: todo('アプリロックの画面'), side: 'right',
    float: (d) => `<div class="card" style="top:${y(d, 1600)}px;left:${u(d, 60)}px;width:${u(d, 800)}px;transform:rotate(-3deg)">
  <div class="feat">${ICON.bank}<span>銀行とつながない</span></div>
  <div class="feat">${ICON.lock}<span>Face ID でロック</span></div>
  <div class="feat">${ICON.shield}<span>端末で暗号化</span></div>
</div>`,
  })],
];

fs.mkdirSync(new URL('./gen/', import.meta.url), { recursive: true });
for (const [name, d] of Object.entries(DEVICES)) {
  fs.writeFileSync(new URL(`./gen/${name}-01-02.html`, import.meta.url), pair(d));
  for (const [n, html] of SLIDES(d)) fs.writeFileSync(new URL(`./gen/${name}-${n}.html`, import.meta.url), html);
}
console.log('ok: gen/{iphone,ipad}-01-02, 03〜06');
