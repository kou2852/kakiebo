// 本番アプリ(app.kurofukubo.com)をゲストモードで開き、デモデータを注入して全画面をスクショ。
// システムChromeを使用（channel: 'chrome'）。出力: ./shots/*.png
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.APP_URL || 'https://app.kurofukubo.com/';
const OUT = new URL('./shots/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
mkdirSync(OUT, { recursive: true });

// ── デモ用の家計データ（ゲストキー kk4_guest に注入）──
const DEFAULT_ACCOUNTS = [
  {id:'a01',code:'1001',name:'現金',type:'asset',sys:1},{id:'a02',code:'1002',name:'普通預金',type:'asset',sys:1},{id:'a03',code:'1003',name:'定期預金',type:'asset',sys:1},{id:'a04',code:'1101',name:'売掛金',type:'asset',sys:1},{id:'a05',code:'1201',name:'有価証券',type:'asset',sys:1},{id:'a06',code:'1301',name:'固定資産',type:'asset',sys:1},
  {id:'b01',code:'2001',name:'買掛金',type:'liability',sys:1},{id:'b02',code:'2002',name:'未払金',type:'liability',sys:1},{id:'b03',code:'2101',name:'クレジットカード',type:'liability',sys:1},{id:'b04',code:'2201',name:'借入金',type:'liability',sys:1},
  {id:'c01',code:'3001',name:'元入金',type:'equity',sys:1},{id:'c02',code:'3101',name:'繰越利益',type:'equity',sys:1},
  {id:'d01',code:'4001',name:'給与収入',type:'income',sys:1},{id:'d02',code:'4002',name:'副業収入',type:'income',sys:1},{id:'d03',code:'4003',name:'利子収入',type:'income',sys:1},{id:'d04',code:'4004',name:'雑収入',type:'income',sys:1},
  {id:'e01',code:'5001',name:'食費',type:'expense',sys:1},{id:'e02',code:'5002',name:'日用品費',type:'expense',sys:1},{id:'e03',code:'5003',name:'光熱費',type:'expense',sys:1},{id:'e04',code:'5004',name:'通信費',type:'expense',sys:1},{id:'e05',code:'5005',name:'交通費',type:'expense',sys:1},{id:'e06',code:'5006',name:'医療費',type:'expense',sys:1},{id:'e07',code:'5007',name:'娯楽費',type:'expense',sys:1},{id:'e08',code:'5008',name:'衣服費',type:'expense',sys:1},{id:'e09',code:'5009',name:'住居費',type:'expense',sys:1},{id:'e10',code:'5010',name:'保険料',type:'expense',sys:1},{id:'e11',code:'5011',name:'教育費',type:'expense',sys:1},{id:'e12',code:'5012',name:'雑費',type:'expense',sys:1},
];

let jid = 0;
const J = (date, desc, lines) => ({ id: 'j' + (++jid), date, desc, lines });
const dr = (accountId, amount) => ({ accountId, side: 'dr', amount });
const cr = (accountId, amount) => ({ accountId, side: 'cr', amount });

const journals = [
  J('2026-01-01', '開業時の元入れ', [dr('a02', 1500000), cr('c01', 1500000)]),
  J('2026-01-01', '財布の現金', [dr('a01', 80000), cr('c01', 80000)]),
  J('2026-01-01', '投資信託', [dr('a05', 500000), cr('c01', 500000)]),
];
const mm = (m) => String(m).padStart(2, '0');
for (let m = 1; m <= 6; m++) {
  journals.push(J(`2026-${mm(m)}-25`, '給与', [dr('a02', 320000), cr('d01', 320000)]));
  journals.push(J(`2026-${mm(m)}-27`, '家賃', [dr('e09', 95000), cr('a02', 95000)]));
  journals.push(J(`2026-${mm(m)}-10`, '電気・ガス・水道', [dr('e03', 11000 + m * 300), cr('a02', 11000 + m * 300)]));
  journals.push(J(`2026-${mm(m)}-15`, 'スマホ・回線', [dr('e04', 8200), cr('a02', 8200)]));
  journals.push(J(`2026-${mm(m)}-01`, '生命保険', [dr('e10', 6500), cr('a02', 6500)]));
  journals.push(J(`2026-${mm(m)}-05`, 'スーパー（食料品）', [dr('e01', 14200), cr('a01', 14200)]));
  journals.push(J(`2026-${mm(m)}-12`, 'コンビニ・外食', [dr('e01', 9800), cr('b03', 9800)]));
  journals.push(J(`2026-${mm(m)}-18`, '日用品', [dr('e02', 4300), cr('a01', 4300)]));
  journals.push(J(`2026-${mm(m)}-20`, '交通（定期・IC）', [dr('e05', 6200), cr('b03', 6200)]));
  journals.push(J(`2026-${mm(m)}-22`, '映画・書籍', [dr('e07', 5400), cr('b03', 5400)]));
  // 前月カード利用分の引落
  journals.push(J(`2026-${mm(m)}-04`, 'クレジットカード引落', [dr('b03', 21400), cr('a02', 21400)]));
}
journals.push(J('2026-03-28', '副業（受託）', [dr('a02', 40000), cr('d02', 40000)]));
journals.push(J('2026-04-16', '衣服', [dr('e08', 12800), cr('b03', 12800)]));
journals.push(J('2026-06-08', '通院', [dr('e06', 3200), cr('a01', 3200)]));

const demo = {
  accounts: DEFAULT_ACCOUNTS,
  journals,
  tags: [
    { id: 't1', name: '生活費', color: '#6090d8', note: '' },
    { id: 't2', name: '趣味', color: '#d8709a', note: '' },
    { id: 't3', name: '固定費', color: '#70b890', note: '' },
  ],
  wallets: [
    { id: 'w1', name: 'メイン口座', accountId: 'a02', defaultTagName: '生活費', defaultTagColor: '#6090d8', note: '' },
    { id: 'w2', name: '財布', accountId: 'a01', defaultTagName: '', defaultTagColor: '#888', note: '' },
    { id: 'w3', name: '楽天カード', accountId: 'b03', defaultTagName: '', defaultTagColor: '#888', note: '' },
  ],
  budgets: [
    { accountId: 'e01', amount: 60000 }, { accountId: 'e03', amount: 15000 },
    { accountId: 'e07', amount: 20000 }, { accountId: 'e04', amount: 9000 },
  ],
  presets: [
    { id: 'p1', walletId: 'w3', type: 'out', name: '家賃', desc: '家賃', lines: [dr('e09', 95000), cr('a02', 95000)] },
    { id: 'p2', walletId: 'w2', type: 'out', name: 'スーパー', desc: 'スーパー', lines: [dr('e01', 0), cr('a01', 0)] },
    { id: 'p3', walletId: 'w1', type: 'in', name: '給与', desc: '給与', lines: [dr('a02', 320000), cr('d01', 320000)] },
  ],
  recurring: [
    { id: 'r1', name: '家賃', frequency: 'monthly', day: 27, nextDate: '2026-07-27', lines: [dr('e09', 95000), cr('a02', 95000)] },
    { id: 'r2', name: '給与', frequency: 'monthly', day: 25, nextDate: '2026-06-25', lines: [dr('a02', 320000), cr('d01', 320000)] },
  ],
  rules: [
    { id: 'rl1', keyword: 'コンビニ', drAccountId: 'e01', crAccountId: 'a01' },
  ],
  allocs: [
    { accountId: 'a02', tagId: 't3', amount: 300000 },
    { accountId: 'a02', tagId: 't1', amount: 250000 },
  ],
};

// クリックして撮るページ（サイドバーのラベルで指定）
const PAGES = [
  ['dashboard', 'ダッシュボード'],
  ['journal', '仕訳入力'],
  ['ledger', '仕訳帳'],
  ['bs', '貸借対照表'],
  ['pl', '損益計算書'],
  ['cf', 'キャッシュフロー'],
  ['accounts', '勘定科目・口座'],
  ['tags', 'タグ・配分'],
  ['calendar', 'カレンダー'],
  ['recurring', '定期取引'],
  ['settings', '設定'],
  ['guide', '操作ガイド'],
];

const run = async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });

  // 1) ログイン画面（ゲストフラグなし）
  const ctxLogin = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
  const pLogin = await ctxLogin.newPage();
  await pLogin.goto(BASE, { waitUntil: 'networkidle' });
  await pLogin.waitForSelector('text=Double-Entry Bookkeeping', { timeout: 30000 });
  await pLogin.waitForTimeout(500);
  await pLogin.screenshot({ path: OUT + '00-login.png' });
  console.log('shot: 00-login');
  await ctxLogin.close();

  // 1.5) 初回オンボーディングのモーダル（kk_onboarded 未設定で自動表示される様子）
  const ctxOb = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
  await ctxOb.addInitScript((d) => {
    localStorage.setItem('kk_guest', '1');
    localStorage.setItem('kk4_guest', JSON.stringify(d));
    localStorage.setItem('kk_theme', 'light');
    localStorage.setItem('kk_guest_promo', '1');
    // kk_onboarded は設定しない → ウェルカムモーダルが自動表示
  }, demo);
  const pOb = await ctxOb.newPage();
  await pOb.goto(BASE, { waitUntil: 'networkidle' });
  await pOb.waitForSelector('.md', { timeout: 30000 });
  await pOb.waitForTimeout(800);
  await pOb.screenshot({ path: OUT + '90-onboarding.png' });
  console.log('shot: 90-onboarding');
  await ctxOb.close();

  // 2) アプリ各画面（ゲスト + デモデータ注入。オンボーディングは表示済み扱いにして導線を妨げない）
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
  await ctx.addInitScript((d) => {
    localStorage.setItem('kk_guest', '1');
    localStorage.setItem('kk4_guest', JSON.stringify(d));
    localStorage.setItem('kk_theme', 'light');
    localStorage.setItem('kk_guest_promo', '1'); // 仕訳超過モーダルを抑制
    localStorage.setItem('kk_onboarded', '1');   // ウェルカムモーダルを抑制（画面遷移を妨げない）
  }, demo);
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('.s-item', { timeout: 30000 });
  await page.waitForTimeout(1200);

  let i = 1;
  for (const [id, label] of PAGES) {
    await page.locator('.s-item', { hasText: label }).first().click();
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}${String(i).padStart(2, '0')}-${id}.png`, fullPage: true });
    console.log('shot:', id);
    i++;
  }

  await ctx.close();
  await browser.close();
  console.log('DONE ->', OUT);
};

run().catch((e) => { console.error(e); process.exit(1); });
