import { chromium } from 'playwright';
import { buildDataset } from './seed-data.mjs';
const seed = JSON.stringify(buildDataset());
const NI = 'C:/dev/BudgetBook/kakeibo-saas/docs/note-images';
const hide = () => {
  document.querySelectorAll('.main > div').forEach(el => { const t = el.textContent||''; if (t.includes('ゲストモード') && t.length < 140) el.style.display='none'; });
  document.querySelectorAll('.card').forEach(el => { const t = el.textContent||''; if (t.includes('はじめかた（') || t.includes('アカウント登録でデータを安全に保存')) el.style.display='none'; });
};
const b = await chromium.launch({ channel: 'chrome', headless: true });
async function cap(name, w, h, navLabel) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  await ctx.addInitScript((s)=>{localStorage.setItem('kk4_guest',s);localStorage.setItem('kk_guest','1');localStorage.setItem('kk_onboarded','1');localStorage.setItem('kk_update_seen','2027-12-31');localStorage.setItem('kk_guest_promo','1');localStorage.setItem('kk_recovery_saved','1');localStorage.setItem('kk_theme','light');}, seed);
  const p = await ctx.newPage();
  await p.goto('http://localhost:4173/?guest',{waitUntil:'networkidle'});
  await p.waitForSelector('.s-item',{timeout:30000}).catch(()=>{});
  if (navLabel) {
    const burger=p.locator('.hamburger'); if(await burger.count()&&await burger.isVisible()){await burger.click();await p.waitForTimeout(300);}
    await p.locator('.s-item',{hasText:navLabel}).first().click(); await p.waitForTimeout(700);
  }
  await p.evaluate(hide); await p.waitForTimeout(300);
  await p.screenshot({ path: `${NI}/${name}` });
  await ctx.close(); console.log('shot', name);
}
await cap('full-dashboard.png', 1300, 1380, null);
await cap('full-credit.png', 1300, 1120, 'クレジット');
await cap('full-calendar.png', 1300, 1080, 'カレンダー');
await cap('full-dashboard-mobile.png', 390, 880, null);
await b.close();
console.log('done');
