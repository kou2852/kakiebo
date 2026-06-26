// X投稿用のプロモ・スクショを新規生成。ゲスト警告バナーを隠したクリーンな見た目で、
// ダッシュボード/クレジット/仕訳入力/貸借対照表 を撮影。出力 ./shots/x-*.png
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.APP_URL || 'https://app.kurofukubo.com/';
const OUT = new URL('./shots/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
mkdirSync(OUT, { recursive: true });

const DEFAULT_ACCOUNTS = [
  {id:'a01',code:'1001',name:'現金',type:'asset',sys:1},{id:'a02',code:'1002',name:'普通預金',type:'asset',sys:1},{id:'a03',code:'1003',name:'定期預金',type:'asset',sys:1},{id:'a05',code:'1201',name:'有価証券',type:'asset',sys:1},
  // クレカに CC設定を付与（締め15/引落27/翌月/普通預金）→ クレジット画面が埋まる
  {id:'b03',code:'2101',name:'楽天カード',type:'liability',sys:1,ccClose:15,ccDay:27,ccDelay:1,ccFrom:'a02'},
  {id:'c01',code:'3001',name:'元入金',type:'equity',sys:1},
  {id:'d01',code:'4001',name:'給与収入',type:'income',sys:1},{id:'d02',code:'4002',name:'副業収入',type:'income',sys:1},{id:'d04',code:'4004',name:'雑収入',type:'income',sys:1},
  {id:'e01',code:'5001',name:'食費',type:'expense',sys:1},{id:'e02',code:'5002',name:'日用品費',type:'expense',sys:1},{id:'e03',code:'5003',name:'光熱費',type:'expense',sys:1},{id:'e04',code:'5004',name:'通信費',type:'expense',sys:1},{id:'e05',code:'5005',name:'交通費',type:'expense',sys:1},{id:'e06',code:'5006',name:'医療費',type:'expense',sys:1},{id:'e07',code:'5007',name:'娯楽費',type:'expense',sys:1},{id:'e09',code:'5009',name:'住居費',type:'expense',sys:1},{id:'e10',code:'5010',name:'保険料',type:'expense',sys:1},
];

let jid = 0;
const J = (date, desc, lines) => ({ id: 'j' + (++jid), date, desc, lines });
const dr = (accountId, amount) => ({ accountId, side: 'dr', amount });
const cr = (accountId, amount) => ({ accountId, side: 'cr', amount });
const mm = (m) => String(m).padStart(2, '0');

const journals = [
  J('2026-01-01', '開業時の元入れ', [dr('a02', 1500000), cr('c01', 1500000)]),
  J('2026-01-01', '財布の現金', [dr('a01', 80000), cr('c01', 80000)]),
  J('2026-01-01', '投資信託', [dr('a05', 500000), cr('c01', 500000)]),
];
for (let m = 1; m <= 6; m++) {
  journals.push(J(`2026-${mm(m)}-25`, '給与', [dr('a02', 320000), cr('d01', 320000)]));
  journals.push(J(`2026-${mm(m)}-27`, '家賃', [dr('e09', 95000), cr('a02', 95000)]));
  journals.push(J(`2026-${mm(m)}-10`, '電気・ガス・水道', [dr('e03', 11000 + m * 300), cr('a02', 11000 + m * 300)]));
  journals.push(J(`2026-${mm(m)}-15`, 'スマホ・回線', [dr('e04', 8200), cr('a02', 8200)]));
  journals.push(J(`2026-${mm(m)}-01`, '生命保険', [dr('e10', 6500), cr('a02', 6500)]));
  journals.push(J(`2026-${mm(m)}-05`, 'スーパー（食料品）', [dr('e01', 14200), cr('a01', 14200)]));
  journals.push(J(`2026-${mm(m)}-12`, 'コンビニ・外食', [dr('e01', 9800), cr('b03', 9800)]));
  journals.push(J(`2026-${mm(m)}-18`, '日用品', [dr('e02', 4300), cr('a01', 4300)]));
  journals.push(J(`2026-${mm(m)}-20`, '交通（IC）', [dr('e05', 6200), cr('b03', 6200)]));
  journals.push(J(`2026-${mm(m)}-22`, '映画・書籍', [dr('e07', 5400), cr('b03', 5400)]));
}
journals.push(J('2026-03-28', '副業（受託）', [dr('a02', 40000), cr('d02', 40000)]));
journals.push(J('2026-06-08', '通院', [dr('e06', 3200), cr('a01', 3200)]));

const demo = {
  accounts: DEFAULT_ACCOUNTS,
  journals,
  tags: [
    { id: 't1', name: '生活費', color: '#6090d8' }, { id: 't2', name: '趣味', color: '#d8709a' }, { id: 't3', name: '固定費', color: '#70b890' },
  ],
  wallets: [
    { id: 'w1', name: 'メイン口座', accountId: 'a02', defaultTagName: '生活費', defaultTagColor: '#6090d8' },
    { id: 'w2', name: '財布', accountId: 'a01' },
    { id: 'w3', name: '楽天カード', accountId: 'b03' },
  ],
  budgets: [ { accountId: 'e01', amount: 60000 }, { accountId: 'e03', amount: 15000 }, { accountId: 'e07', amount: 20000 }, { accountId: 'e04', amount: 9000 } ],
  presets: [
    { id: 'p1', walletId: 'w3', type: 'out', name: '家賃', desc: '家賃', lines: [dr('e09', 95000), cr('a02', 95000)] },
    { id: 'p2', walletId: 'w2', type: 'out', name: 'スーパー', desc: 'スーパー', lines: [dr('e01', 0), cr('a01', 0)] },
    { id: 'p3', walletId: 'w1', type: 'in', name: '給与', desc: '給与', lines: [dr('a02', 320000), cr('d01', 320000)] },
  ],
  recurring: [], rules: [], allocs: [],
};

const hideBanner = (page) => page.addStyleTag({ content: 'main > div[style*="sticky"]{display:none !important}' });

const run = async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 820 }, deviceScaleFactor: 2 });
  await ctx.addInitScript((d) => {
    localStorage.setItem('kk_guest', '1'); localStorage.setItem('kk4_guest', JSON.stringify(d));
    localStorage.setItem('kk_theme', 'light'); localStorage.setItem('kk_onboarded', '1'); localStorage.setItem('kk_guest_promo', '1');
    localStorage.setItem('kk_setup_dismissed', '1'); localStorage.setItem('kk_setup_report', '1');
  }, demo);
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('.s-item', { timeout: 30000 });
  await hideBanner(page);
  await page.waitForTimeout(800);

  const shots = [
    ['ダッシュボード', 'x-1-dashboard.png'],
    ['クレジット', 'x-2-credit.png'],
    ['仕訳入力', 'x-3-journal.png'],
    ['貸借対照表', 'x-4-bs.png'],
  ];
  for (const [label, file] of shots) {
    await page.locator('.s-item', { hasText: label }).first().click();
    await page.waitForTimeout(700);
    await hideBanner(page); // ナビ再描画でバナーが戻るため都度隠す
    if (label === 'ダッシュボード') {
      // 宣伝画像向けにオンボーディング/登録カードを隠す
      await page.evaluate(() => {
        const hideCard = (needle) => {
          const el = [...document.querySelectorAll('main *')].find((e) => e.children.length === 0 && (e.textContent || '').includes(needle));
          const card = el && (el.closest('.card') || el.parentElement);
          if (card) card.style.display = 'none';
        };
        hideCard('安全に保存');
      });
    }
    await page.waitForTimeout(300);
    await page.screenshot({ path: OUT + file, fullPage: true });
    console.log('shot:', file);
  }
  await ctx.close(); await browser.close();
  console.log('DONE ->', OUT);
};
run().catch((e) => { console.error('ERROR', e); process.exit(1); });
