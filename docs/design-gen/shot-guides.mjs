import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
const b = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await b.newContext({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 1.5 });
const p = await ctx.newPage();
const base = 'C:/dev/BudgetBook/kakeibo-saas/lp/';
for (const [f, out] of [['guides.html','lp-guides'],['guide-net-worth.html','lp-guide-article'],['security.html','lp-security']]) {
  await p.goto(pathToFileURL(base + f).href, { waitUntil: 'networkidle' });
  await p.waitForTimeout(700);
  await p.screenshot({ path: `shots/redesign-applied/${out}.png` });
  console.log('shot', out);
}
await ctx.close(); await b.close();
