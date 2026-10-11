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
    shots: { dashboard: '01_dashboard', bs: '03_balance_sheet', card: '04_credit_card',
      // 2026-10-11 撮影（1.0.3・デモ帳簿・先月）
      journal: '06_journal', calendar: '07_calendar', repBs: '08_report_bs', repPl: '09_report_pl', repCf: '10_report_cf' },
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

// 4枚目（レシート）のダミー。撮影画面に写すレシートと、浮かせる読み取り結果の両方をここから作る。
// 店名は架空。読み取りは先頭の行を店名に、「合計」の行を金額に採る（mobile/src/utils/receipt.js）。
// この版面の行を extractReceipt に通すと date/amount/store がこの値になることを確かめた（2026-10-11）
const RECEIPT = {
  store: 'みどりマート 中央店', date: '2026年10月11日(日) 18:42', isoDate: '2026-10-11',
  items: [['牛乳', 228], ['食パン', 198], ['たまご', 258], ['バナナ', 178]],
};
RECEIPT.total = RECEIPT.items.reduce((s, [, n]) => s + n, 0);

// iOS のカメラ（アプリは標準のカメラを開く）でレシートを写している画面。
// 寸法は画面幅に対する比（cqw）で書くので iPhone と iPad で同じ定義が使える。iPad はシャッターが右の縦帯。
function camera(d) {
  const R = RECEIPT;
  const pad = d === DEVICES.ipad;
  const p = (l, r, cls = '') => `<p class="${cls}"><span>${l}</span><span>${r}</span></p>`;
  // バーコードは見た目だけ。店名から決まる並びにして、作り直しても形が変わらないようにする
  let seed = [...R.store].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0;
  const bars = Array.from({ length: 46 }, (_, i) => {
    seed = (seed * 1103515245 + 12345) >>> 0;
    return `<i style="flex:${1 + (seed >>> 16) % 3};background:${i % 2 ? 'transparent' : '#1c1c1c'}"></i>`;
  }).join('');
  const shutter = '<div class="sh"><i></i></div>';
  const thumb = '<div class="th"></div>';
  const flip = `<div class="fl">${ICON.flip}</div>`;
  const ui = pad
    ? `<div class="cb r">${flip}<b>写真</b>${shutter}${thumb}</div>`
    : `<div class="cb t">${ICON.flash}<span class="chev"></span>${ICON.live}</div>
  <div class="cb b"><div class="modes"><span>ビデオ</span><b>写真</b><span>ポートレート</span></div>
    <div class="ctl">${thumb}${shutter}${flip}</div></div>`;
  return `<div class="cam${pad ? ' pad' : ''}">
  <div class="vf"><div class="rcw"><div class="rc">
    <h5>${R.store}</h5><div class="c">いつもありがとうございます</div>
    <div class="c">${R.date}</div><div class="sm"><span>レジ02</span><span>No.0123</span></div><hr>
    ${R.items.map(([name, n]) => p(`${name} ※`, '¥' + n)).join('')}
    <hr>${p(`小計（${R.items.length}点）`, yen(R.total))}
    ${p('合計', yen(R.total), 'big')}
    ${p('（8%対象 内消費税', yen(Math.floor(R.total * 8 / 108)) + '）', 'sm')}
    ${p('お預り', yen(1000))}${p('お釣', yen(1000 - R.total))}
    <div class="nt">※印は軽減税率（8%）対象商品</div>
    <div class="bc">${bars}</div>
  </div></div></div>
  ${ui}
</div>`;
}

const css = (d) => `
@import url('https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@500;700;900&family=BIZ+UDGothic:wght@400;700&display=swap');
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
.cam { position: relative; container-type: inline-size; aspect-ratio: ${d === DEVICES.ipad ? '2064 / 2752' : '1242 / 2688'}; overflow: hidden;
  border-radius: ${d.frame.radius - d.frame.pad}px; background: #000; }
.cam .vf { position: absolute; inset: 0; box-shadow: inset 0 0 22cqw rgba(40,28,10,.28);
  background: radial-gradient(75% 55% at 45% 36%, rgba(255,252,245,.6), rgba(255,252,245,0) 70%),
    repeating-linear-gradient(93deg, rgba(110,80,40,.04) 0 .5cqw, transparent .5cqw 2.4cqw, rgba(110,80,40,.025) 2.4cqw 2.9cqw, transparent 2.9cqw 4.6cqw),
    linear-gradient(170deg, #e9e0d1, #d8ccb8 60%, #c9bba4); }
.cam .rcw { position: absolute; left: 47%; top: 36%; width: 47cqw; transform: translate(-50%, -50%) rotate(3deg);
  filter: drop-shadow(0 2.2cqw 2.4cqw rgba(70,50,20,.35)) drop-shadow(0 .3cqw .4cqw rgba(70,50,20,.25)); }
.cam .rc { position: relative; color: #1f1f1f; font-family: 'BIZ UDGothic', 'MS Gothic', monospace; font-size: 2.9cqw; line-height: 1.6; letter-spacing: .02em;
  padding: 4.6cqw 4.2cqw 6.4cqw; background: linear-gradient(180deg, #fffefb, #faf7f0);
  clip-path: polygon(0 0,100% 0,100% 98.6%,96% 100%,92% 98.6%,88% 100%,84% 98.6%,80% 100%,76% 98.6%,72% 100%,68% 98.6%,64% 100%,60% 98.6%,56% 100%,52% 98.6%,48% 100%,44% 98.6%,40% 100%,36% 98.6%,32% 100%,28% 98.6%,24% 100%,20% 98.6%,16% 100%,12% 98.6%,8% 100%,4% 98.6%,0 100%); }
.cam .rc::after { content: ''; position: absolute; left: 0; right: 0; top: 52%; height: 6%; background: linear-gradient(180deg, transparent, rgba(0,0,0,.035), transparent); }
.cam .rc h5 { font-size: 3.9cqw; font-weight: 700; text-align: center; letter-spacing: .04em; white-space: nowrap; }
.cam .rc .c { text-align: center; }
.cam .rc p, .cam .rc .sm { display: flex; justify-content: space-between; }
.cam .rc .sm, .cam .rc .nt { font-size: 2.4cqw; color: #444; }
.cam .rc .nt { margin-top: 1.2cqw; }
.cam .rc .big { font-size: 4.1cqw; font-weight: 700; margin: .6cqw 0; }
.cam .rc hr { border: 0; border-top: .25cqw dashed #555; margin: 1.2cqw 0; }
.cam .rc .bc { display: flex; height: 5.5cqw; margin: 2.4cqw 4cqw 0; }
.cam .cb { position: absolute; background: #000; display: flex; align-items: center; color: #fff; }
.cam .cb svg { width: 6.4cqw; height: 6.4cqw; }
.cam .cb.t { left: 0; right: 0; top: 0; height: 11%; justify-content: space-between; padding: 4cqw 6cqw 0; }
.cam .chev { width: 2.6cqw; height: 2.6cqw; border-left: .5cqw solid #fff; border-top: .5cqw solid #fff; transform: rotate(45deg); margin-top: 1cqw; }
.cam .cb.b { left: 0; right: 0; bottom: 0; height: 22%; flex-direction: column; justify-content: flex-start; padding-top: 3.6cqw; gap: 4.4cqw; }
.cam .modes { width: 100%; display: grid; grid-template-columns: 1fr auto 1fr; gap: 5.6cqw; font: 600 3.1cqw -apple-system, 'Segoe UI', sans-serif; letter-spacing: .04em; }
.cam .modes span { color: rgba(255,255,255,.85); }
.cam .modes span:first-child { justify-self: end; }
.cam b { color: #ffd60a; font: 700 3.1cqw -apple-system, 'Segoe UI', sans-serif; letter-spacing: .04em; }
.cam .ctl { width: 100%; display: flex; align-items: center; justify-content: space-between; padding: 0 9cqw; }
.cam .sh { width: 18cqw; height: 18cqw; border-radius: 50%; border: 1.1cqw solid #fff; display: flex; align-items: center; justify-content: center; }
.cam .sh i { width: 84%; height: 84%; border-radius: 50%; background: #fff; }
.cam .th { width: 11cqw; height: 11cqw; border-radius: 1.6cqw; border: .3cqw solid rgba(255,255,255,.6);
  background: linear-gradient(170deg, #e0d6c6, #c9bba4); position: relative; overflow: hidden; }
.cam .th::after { content: ''; position: absolute; left: 30%; top: 14%; width: 40%; height: 72%; background: #fbf8f1; transform: rotate(3deg); }
.cam .fl { width: 11cqw; height: 11cqw; border-radius: 50%; background: #2b2b2d; display: flex; align-items: center; justify-content: center; }
.cam .fl svg { width: 6cqw; height: 6cqw; }
/* iPad: 画面が広いのでレシートを小さく左上へ。シャッターは見えている範囲の中ほどに（下は端末ごと切れる） */
.cam.pad .rcw { left: 42%; top: 32%; transform: translate(-50%, -50%) rotate(3deg) scale(.7); }
.cam.pad .cb.r { top: 0; bottom: 0; right: 0; width: 14%; flex-direction: column; justify-content: flex-start; padding-top: 26cqw; gap: 3.4cqw; }
.cam.pad .sh { width: 10cqw; height: 10cqw; border-width: .7cqw; }
.cam.pad .th, .cam.pad .fl { width: 6.4cqw; height: 6.4cqw; }
.cam.pad .fl svg { width: 3.6cqw; height: 3.6cqw; }
.cam.pad b { font-size: 1.9cqw; }
.rd { padding: calc(44px * var(--u)) calc(56px * var(--u)); }
.rd .row { font-size: calc(46px * var(--u)); margin-top: calc(18px * var(--u)); padding-top: calc(18px * var(--u)); border-top: 2px solid #edf0ef; }
.rd .row span { color: #5c656d; }
svg.trend { position: absolute; inset: 0; z-index: 1; }
`;

const ICON = {
  flash: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#2b2b2d"/><path d="M13 4 7 13h4l-1 7 6-9h-4z" fill="#fff"/></svg>',
  live: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff"><circle cx="12" cy="12" r="9.5" stroke-width="1.4" stroke-dasharray="1.6 1.8"/><circle cx="12" cy="12" r="6" stroke-width="1.6"/><circle cx="12" cy="12" r="2.6" fill="#fff" stroke="none"/></svg>',
  flip: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round"><path d="M5 10a7 7 0 0 1 12.5-3.5M19 14a7 7 0 0 1-12.5 3.5"/><path d="M18 3v4h-4M6 21v-4h4"/></svg>',
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

// 複数の画面を少しずつ斜めにずらして重ねる。keys は奥→手前の順（最後が一番手前で、全体が見える）
const has = (d, ...keys) => keys.every((k) => d.shots[k]);
function stack(d, { eyebrow, h1, sub, keys }) {
  const n = keys.length;
  const w = Math.round(d.W * (n === 3 ? 0.53 : 0.59));
  const m = u(d, 30);
  const dx = (d.W - w - m * 2) / (n - 1);
  const dy = u(d, n === 3 ? 130 : 200);
  const rot = (i) => -6 + (11 * i) / (n - 1);
  return page(d, `
<div class="deco" style="width:${u(d, 1000)}px;height:${u(d, 1000)}px;left:${d.W - u(d, 500)}px;top:${d.H - u(d, 900)}px"></div>
${head(eyebrow, h1, sub ? `<div class="sub">${sub}</div>` : '')}
${keys.map((k, i) => `<div class="dev" style="width:${w}px;top:${d.singleTop + dy * i}px;left:${Math.round(m + dx * i)}px;transform:rotate(${rot(i).toFixed(1)}deg)">${img(d, k)}</div>`).join('')}`, 'stack', d.W);
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
  // レポートは3画面を重ねる。手前が貸借対照表。iPad は撮れるまで1画面＋浮かせた部品のまま
  has(d, 'repBs', 'repPl', 'repCf') ? ['03', stack(d, {
    eyebrow: '記帳するだけ', h1: '貸借対照表も、<br><em>自動</em>で。', sub: '損益計算書・キャッシュフローも',
    keys: ['repCf', 'repPl', 'repBs'],
  })] : ['03', single(d, {
    eyebrow: '記帳するだけ', h1: '貸借対照表も、<br><em>自動</em>で。', screen: img(d, 'bs'), side: 'right',
    float: (d) => `<div class="card" style="top:${y(d, 1650)}px;left:${u(d, 60)}px;width:${u(d, 760)}px;transform:rotate(-3deg)">
  <div class="row" style="margin-top:0"><span>資産合計</span><b>${V.assets}</b></div>
  <div class="row"><span>負債合計</span><b>${V.liabilities}</b></div>
  <div class="row total"><span>純資産</span><b>${V.netWorth}</b></div>
</div>`,
  })],
  // 撮影画面ごと描く（ダミーのレシートをカメラで写している絵）。浮かせるのは、この RECEIPT を
  // 読み取ったときにアプリが出す「読み取り結果」の3行（app/scan.jsx の Row と同じ並び・書式）
  ['04', single(d, {
    eyebrow: 'レシート撮影', h1: 'レシートは、<br><em>撮るだけ</em>。', sub: '文字の読み取りは端末の中だけで行います',
    screen: camera(d), side: 'left',
    float: (d) => `<div class="card rd" style="top:${d === DEVICES.ipad ? 2000 : 2050}px;left:${d.W - u(d, 790)}px;width:${u(d, 750)}px;transform:rotate(3deg)">
  <div class="lb">読み取り結果</div>
  <div class="row"><span>日付</span><b>${RECEIPT.isoDate}</b></div>
  <div class="row"><span>合計</span><b>${yen(RECEIPT.total)}</b></div>
  <div class="row"><span>店名</span><b>${RECEIPT.store}</b></div>
</div>`,
  })],
  ['05', single(d, {
    eyebrow: 'クレジットカード', h1: 'カードの引落し、<br><em>先まで</em>見える。', screen: img(d, 'card'), side: 'right',
    float: (d) => `<div class="card" style="top:${y(d, 1750)}px;left:${u(d, 60)}px;width:${u(d, 740)}px;transform:rotate(-3deg)">
  <div class="lb">${V.ccNextLabel}</div><div class="big" style="color:#cf4436">${V.ccNext}</div>
  <div class="row"><span style="color:#5c656d">メインカード → 普通預金</span></div>
</div>`,
  })],
  // 仕訳帳の一覧とカレンダー（1.0.3 の色分け）。iPad は撮れるまで出さない
  ...(has(d, 'journal', 'calendar') ? [['06', stack(d, {
    eyebrow: '仕訳帳', h1: '毎日の出入りが、<br><em>カレンダー</em>で。', keys: ['journal', 'calendar'],
  })]] : []),
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

// プロダクトページのヘッダ（iOS 27 から製品ページの最上部に出る。21:9・3840×1646・透過なし）。
// 端末や向きで切り抜かれ方が変わるので、見出しと帯は中央のセーフエリアに収める。
// セーフエリアは Apple のテンプレートを実測した値（Apple は数値を公開していない）:
//   中央 1646×661、左上 (1097, 493)。外側の端末は横に広い画面でだけ見える飾り。
// ⚠ 帯の金額はスクリーンショット2枚目と同じ値（V.alloc / V.unalloc）。
function header() {
  const d = { ...DEVICES.iphone, W: 3840, H: 1646, frame: { w: 700, pad: 22, radius: 96 } };
  const S = { x: 1097, y: 493, w: 1646, h: 661 };
  const parts = [...V.alloc, ['未配分', '#d5dbd9', V.unalloc]];
  return page(d, `
<style>
.hd h1 { margin: 0; font-size: 104px; white-space: nowrap; line-height: 1.2; text-align: center; }
.hb { position: absolute; z-index: 4; background: #fff; color: #16191c; border-radius: 48px; padding: 28px 60px 30px; box-shadow: 0 60px 120px -40px rgba(0,0,0,.5); }
.hb .top { display: flex; justify-content: space-between; align-items: baseline; font-size: 48px; font-weight: 700; color: #5c656d; }
.hb .top b { font-size: 62px; font-weight: 900; color: #16191c; }
.hb .bar { height: 44px; border-radius: 22px; margin-top: 18px; }
.hb .lg { display: flex; justify-content: space-between; margin-top: 22px; }
.hb .lg span { font-size: 44px; font-weight: 700; display: flex; align-items: center; gap: 16px; }
.hb .lg i { width: 28px; height: 28px; border-radius: 50%; }
.hb .lg b { display: block; font-size: 54px; font-weight: 900; margin: 4px 0 0 44px; }
.brand { position: absolute; z-index: 5; display: flex; align-items: center; justify-content: center; gap: 28px; }
.brand img { width: 84px; height: 84px; border-radius: 19px; box-shadow: 0 10px 30px -10px rgba(0,0,0,.4); }
.brand span { font-size: 56px; font-weight: 900; letter-spacing: .01em; }
</style>
<div class="deco" style="width:1100px;height:1100px;left:-260px;top:900px"></div>
<div class="deco" style="width:900px;height:900px;left:3200px;top:-420px"></div>
<div class="dev" style="width:${d.frame.w}px;top:230px;left:230px;transform:rotate(-8deg)">${img(d, 'dashboard')}</div>
<div class="dev" style="width:${d.frame.w}px;top:230px;left:${d.W - 230 - d.frame.w}px;transform:rotate(8deg)">${img(d, 'bs')}</div>
<div class="hd" style="position:absolute;z-index:5;left:${S.x}px;top:${S.y}px;width:${S.w}px"><h1>口座のお金を、<em>目的ごと</em>に。</h1></div>
<div class="hb" style="left:${S.x}px;top:${S.y + 150}px;width:${S.w}px">
  <div class="top"><span>普通預金</span><b>${V.bank}</b></div>
  <div class="bar" style="display:flex;overflow:hidden">${parts.map(([, c, n]) => `<div style="flex:${n};background:${c}"></div>`).join('')}</div>
  <div class="lg">${parts.map(([name, c, n]) => `<div><span><i style="background:${c}"></i>${name}</span><b>${yen(n)}</b></div>`).join('')}</div>
</div>
<div class="brand" style="left:${S.x}px;width:${S.w}px;top:${S.y + S.h - 84}px"><img src="../../../../mobile/assets/icon.png" alt=""><span>kurofukubo（黒福簿）</span></div>`, 'header', d.W);
}

// 並びが変わったときに古い番号のファイルが残らないよう、作り直す
fs.rmSync(new URL('./gen/', import.meta.url), { recursive: true, force: true });
fs.mkdirSync(new URL('./gen/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('./gen/header.html', import.meta.url), header());
for (const [name, d] of Object.entries(DEVICES)) {
  fs.writeFileSync(new URL(`./gen/${name}-01-02.html`, import.meta.url), pair(d));
  for (const [n, html] of SLIDES(d)) fs.writeFileSync(new URL(`./gen/${name}-${n}.html`, import.meta.url), html);
}
console.log('ok: gen/*.html');
