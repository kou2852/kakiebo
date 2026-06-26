// 新規SEO記事2本のレンダリング＋JSON-LD妥当性確認（file://、サーバー不要）。
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const OUT = 'shots/seo'; mkdirSync(OUT, { recursive: true });
const LP = 'C:/dev/BudgetBook/kakeibo-saas/lp';
const pages = ['guide-networth-trend.html'];

for (const f of pages) {
  const html = readFileSync(`${LP}/${f}`, 'utf8');
  const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  try { const j = JSON.parse(m[1]); console.log(`${f}: JSON-LD OK headline="${j.headline.slice(0, 28)}…" image=${j.image.split('/').pop()}`); }
  catch (e) { console.log(`${f}: JSON-LD NG`, e.message); }
}

const b = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await b.newContext({ viewport: { width: 820, height: 1100 } });
const p = await ctx.newPage();
for (const f of pages) {
  await p.goto(pathToFileURL(`${LP}/${f}`).href, { waitUntil: 'load' });
  await p.waitForTimeout(400);
  const title = await p.title();
  const h1 = await p.locator('h1').first().innerText();
  const links = await p.locator('.more a').count();
  console.log(`${f}: title="${title.slice(0, 30)}…" h1OK=${h1.length > 0} relLinks=${links}`);
  await p.screenshot({ path: `${OUT}/${f.replace('.html', '')}.png` });
}
await b.close();
console.log('✅ 完了 →', OUT);
