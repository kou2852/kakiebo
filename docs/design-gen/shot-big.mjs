// 巨大数字で崩れ確認（journals/balances を大きくスケール）
import { chromium } from 'playwright';
import { buildDataset } from './seed-data.mjs';
const ds = buildDataset();
const K = 137; // ×137 で数千万〜数億規模
for (const j of ds.journals) for (const l of j.lines) l.amount *= K;
for (const a of ds.allocs) a.amount *= K;
for (const b of ds.budgets) b.amount *= K;
for (const r of ds.recurring) for (const l of r.lines) l.amount *= K;
const seed = JSON.stringify(ds);
const b = await chromium.launch({ channel: 'chrome', headless: true });
async function shoot(label, vw, ids){
  const ctx = await b.newContext({ viewport: vw, deviceScaleFactor: 1.5 });
  await ctx.addInitScript((s)=>{localStorage.setItem('kk4_guest',s);localStorage.setItem('kk_guest','1');localStorage.setItem('kk_onboarded','1');localStorage.setItem('kk_update_seen','2027-12-31');localStorage.setItem('kk_guest_promo','1');localStorage.setItem('kk_recovery_saved','1');localStorage.setItem('kk_theme','light');}, seed);
  const p = await ctx.newPage();
  await p.goto('http://localhost:4173/?guest',{waitUntil:'networkidle'});
  await p.waitForSelector('.s-item',{timeout:30000}).catch(()=>{});
  for (const [id,label2] of ids){
    const burger=p.locator('.hamburger'); if(await burger.count() && await burger.isVisible()){await burger.click();await p.waitForTimeout(300);}
    await p.locator('.s-item',{hasText:label2}).first().click(); await p.waitForTimeout(700);
    await p.screenshot({path:`shots/redesign-applied/big-${label}-${id}.png`});
  }
  await ctx.close();
}
const pages=[['dash','ダッシュボード'],['journal','仕訳入力'],['credit','クレジット'],['bs','貸借対照表']];
await shoot('m',{width:390,height:844},pages);
await shoot('d',{width:1440,height:1100},pages);
await b.close();
console.log('done big');
