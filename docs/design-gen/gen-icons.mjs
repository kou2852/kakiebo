import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
const svg = readFileSync('C:/dev/BudgetBook/kakeibo-saas/frontend/public/favicon.svg','utf8');
const b = await chromium.launch({ channel: 'chrome', headless: true });
const sizes = [[16,'favicon-16.png'],[32,'favicon-32.png'],[180,'apple-touch-icon.png'],[192,'icon-192.png'],[512,'icon-512.png']];
const dirs = ['C:/dev/BudgetBook/kakeibo-saas/frontend/public','C:/dev/BudgetBook/kakeibo-saas/lp'];
for (const [n,name] of sizes){
  const ctx = await b.newContext({ viewport:{width:n,height:n}, deviceScaleFactor:1 });
  const p = await ctx.newPage();
  await p.setContent(`<!DOCTYPE html><html><body style="margin:0">${svg.replace('width="512" height="512"',`width="${n}" height="${n}"`)}</body></html>`,{waitUntil:'networkidle'});
  const buf = await p.screenshot({ omitBackground:true });
  for (const d of dirs) writeFileSync(`${d}/${name}`, buf);
  await ctx.close();
}
// 確認用プレビュー(256)
const ctx2 = await b.newContext({ viewport:{width:256,height:256}, deviceScaleFactor:2 });
const p2 = await ctx2.newPage();
await p2.setContent(`<!DOCTYPE html><html><body style="margin:0">${svg.replace('width="512" height="512"','width="256" height="256"')}</body></html>`,{waitUntil:'networkidle'});
await p2.screenshot({ path:'shots/redesign-applied/icon-final.png' });
await ctx2.close();
await b.close();
console.log('icons generated to public/ and lp/');
