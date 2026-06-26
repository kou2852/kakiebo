// X投稿用の「アップデートのお知らせ」カード画像を生成（1200x675, @2x）
import { chromium } from 'playwright';
const out = new URL('./shots/x-update-card.png', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Zen+Old+Mincho:wght@700&family=Zen+Kaku+Gothic+New:wght@400;500;700&display=swap" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:1200px;height:675px;font-family:'Zen Kaku Gothic New',sans-serif;
    background:radial-gradient(130% 130% at 0% 0%, #271f17 0%, #15110e 62%); color:#f3ede2;
    padding:54px 64px; display:flex; flex-direction:column; overflow:hidden}
  .top{display:flex;justify-content:space-between;align-items:flex-start}
  .brand{font-family:'Zen Old Mincho',serif;font-weight:700;font-size:34px;color:#c9a35f;letter-spacing:.02em}
  .brand small{display:block;font-family:'Zen Kaku Gothic New',sans-serif;font-weight:400;font-size:12px;color:#9a8e7a;letter-spacing:.22em;margin-top:3px}
  .badge{font-size:15px;color:#1a1612;background:#c9a35f;font-weight:700;padding:7px 17px;border-radius:20px;letter-spacing:.05em}
  .head{margin-top:30px}
  .head h1{font-family:'Zen Old Mincho',serif;font-size:42px;font-weight:700;color:#f3ede2;line-height:1.25}
  .date{font-size:15px;color:#9a8e7a;margin-top:8px;letter-spacing:.1em}
  .list{margin-top:30px;display:flex;flex-direction:column;gap:19px;flex:1}
  .item{display:flex;gap:18px;align-items:flex-start}
  .ico{font-size:30px;line-height:1.1;flex-shrink:0;width:46px;text-align:center}
  .it-t{font-size:24px;font-weight:700;color:#f3ede2}
  .it-d{font-size:16px;color:#b9ad98;margin-top:3px;line-height:1.5}
  .foot{border-top:1px solid #3a3025;padding-top:18px;display:flex;justify-content:space-between;align-items:center}
  .url{font-size:21px;font-weight:700;color:#c9a35f}
  .tag{font-size:15px;color:#9a8e7a}
</style></head><body>
  <div class="top">
    <div class="brand">kurofukubo<small>DOUBLE-ENTRY BOOKKEEPING</small></div>
    <div class="badge">🆕 UPDATE</div>
  </div>
  <div class="head">
    <h1>アップデートのお知らせ</h1>
    <div class="date">2026.06.15</div>
  </div>
  <div class="list">
    <div class="item"><div class="ico">📈</div><div><div class="it-t">純資産の推移に「前月比」を表示</div><div class="it-d">グラフのホバーで「¥XXX（前月比 +¥XXX）」が一目でわかる</div></div></div>
    <div class="item"><div class="ico">🔔</div><div><div class="it-t">更新情報をベルでお知らせ</div><div class="it-d">直近5件の履歴をいつでも確認できるように</div></div></div>
    <div class="item"><div class="ico">📱</div><div><div class="it-t">スマホ表示を大幅改善</div><div class="it-d">メニューの重なりを解消、仕訳・仕訳帳がぐっと見やすく</div></div></div>
  </div>
  <div class="foot"><div class="url">app.kurofukubo.com</div><div class="tag">無料で使える・複式簿記の家計簿</div></div>
</body></html>`;

const b = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await b.newContext({ viewport: { width: 1200, height: 675 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
await p.setContent(html, { waitUntil: 'networkidle' });
await p.waitForTimeout(800); // Webフォント読み込み待ち
await p.screenshot({ path: out });
await ctx.close(); await b.close();
console.log('IMAGE:', out);
