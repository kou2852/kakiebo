// X投稿用「プライバシー強化（E2E暗号化）」告知カード（1200x675, @2x）
import { chromium } from 'playwright';
const out = new URL('./shots/x-card-e2e.png', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
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
  .head{margin-top:28px}
  .head h1{font-family:'Zen Old Mincho',serif;font-size:40px;font-weight:700;color:#f3ede2;line-height:1.25}
  .head .sub{font-size:16px;color:#b9ad98;margin-top:8px}
  .date{font-size:14px;color:#9a8e7a;margin-top:6px;letter-spacing:.1em}
  .list{margin-top:26px;display:flex;flex-direction:column;gap:18px;flex:1}
  .item{display:flex;gap:18px;align-items:flex-start}
  .ico{font-size:30px;line-height:1.1;flex-shrink:0;width:46px;text-align:center}
  .it-t{font-size:23px;font-weight:700;color:#f3ede2}
  .it-d{font-size:15px;color:#b9ad98;margin-top:3px;line-height:1.5}
  .foot{border-top:1px solid #3a3025;padding-top:16px;display:flex;justify-content:space-between;align-items:center}
  .url{font-size:21px;font-weight:700;color:#c9a35f}
  .tag{font-size:15px;color:#9a8e7a}
</style></head><body>
  <div class="top">
    <div class="brand">kurofukubo<small>DOUBLE-ENTRY BOOKKEEPING</small></div>
    <div class="badge">🔒 PRIVACY UPDATE</div>
  </div>
  <div class="head">
    <h1>運営者でも中身を見られない<br>家計簿へ</h1>
    <div class="sub">端末側エンドツーエンド暗号化（ゼロ知識）に対応</div>
    <div class="date">2026.06.17</div>
  </div>
  <div class="list">
    <div class="item"><div class="ico">🔒</div><div><div class="it-t">端末で暗号化してから保存（E2E）</div><div class="it-d">鍵はあなたの端末だけ。運営者もサーバーも中身を復号できません</div></div></div>
    <div class="item"><div class="ico">🔑</div><div><div class="it-t">リカバリキー＋自動解錠</div><div class="it-d">同じ端末なら毎回のパス入力は不要。万一に備えて復元キーも発行</div></div></div>
    <div class="item"><div class="ico">📄</div><div><div class="it-t">「安全とデータの扱い」を公開</div><div class="it-d">第三者提供なし・銀行連携なし・データはあなたのもの</div></div></div>
  </div>
  <div class="foot"><div class="url">app.kurofukubo.com</div><div class="tag">無料・複式簿記の家計簿</div></div>
</body></html>`;

const b = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await b.newContext({ viewport: { width: 1200, height: 675 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
await p.setContent(html, { waitUntil: 'networkidle' });
await p.waitForTimeout(800);
await p.screenshot({ path: out });
await ctx.close(); await b.close();
console.log('IMAGE:', out);
