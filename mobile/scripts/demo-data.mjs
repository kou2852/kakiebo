// App Store 審査用のデモ口座に、3か月分の帳簿を入れる。
//
// 審査員は空の家計簿を渡されても、ダッシュボードもレポートも白紙のままで、
// このアプリが何をするものか分からない。4.2（最低限の機能）を判断してもらうには
// 中身の入った状態を見せる必要がある。
//
// 使い方:
//   node scripts/demo-data.mjs --dry          … JSON を書き出すだけ（既定）
//   DEMO_EMAIL=... DEMO_PASSWORD=... \
//   node scripts/demo-data.mjs --push         … 本番のデモ口座へ投入する
//
// ⚠ --push は本番へ書き込む。審査用に用意した使い捨て口座だけに使うこと。
//
// 生成は乱数を種から回すので、何度実行しても同じ帳簿になる。審査で差し戻された
// ときに作り直しても、スクリーンショットと食い違わない。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AuthenticationDetails, CognitoUser, CognitoUserPool } from 'amazon-cognito-identity-js';
import { DEFAULT_ACCOUNTS, DEFAULT_PRESETS } from '../src/db/defaults.js';
import { ENVIRONMENTS } from '../src/config.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', '..', 'docs', 'appstore', 'demo-data.json');

// ── 乱数（種つき）──────────────────────────────────────────────
// Math.random だと実行のたびに帳簿が変わる。審査のやり直しで数字が動くと、
// 提出済みのスクリーンショットと合わなくなる。
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20260902);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
// 端数の出ない金額にする。1円単位の乱数は「本物っぽさ」に寄与しないうえ、
// スクリーンショットで桁が揃わず読みにくい。
const around = (base, spread) => Math.round((base + (rand() - 0.5) * 2 * spread) / 10) * 10;

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// ── 口座・カードの設定 ───────────────────────────────────────
const CARD = 'b03';   // クレジットカード
const BANK = 'a02';   // 普通預金
const CASH = 'a01';   // 現金
const CC_CLOSE = 15;  // 毎月15日締め
const CC_DAY = 10;    // 翌月10日引落

const accounts = DEFAULT_ACCOUNTS.map((a) =>
  (a.id === CARD ? { ...a, name: 'メインカード', ccClose: CC_CLOSE, ccDay: CC_DAY, ccDelay: 1, ccFrom: BANK } : a));

const tags = [
  { id: 't1', name: '生活費', color: '#2f9e8d' },
  { id: 't2', name: '固定費', color: '#3f7cad' },
  { id: 't3', name: '交際費', color: '#d98324' },
  // 目的別の取り分け（タグ配分）。ストアの画像と審査で「口座のお金を目的ごとに」を見せるため（2026-10-01）
  { id: 't4', name: '旅行', color: '#5b8def' },
  { id: 't5', name: '積立', color: '#e0a526' },
];

// 普通預金の残高のうち、目的ごとに取り分けている額。残りは未配分として表示される。
// ⚠ 残高より大きくしない（開始残高 84万＋給与3か月分で、どの日に生成しても下回らない額にしている）
const allocs = [
  { accountId: BANK, tagId: 't1', amount: 300000 },
  { accountId: BANK, tagId: 't4', amount: 200000 },
  { accountId: BANK, tagId: 't5', amount: 400000 },
];

const wallets = [
  { id: 'w1', name: '財布', accountId: CASH },
  { id: 'w2', name: '生活口座', accountId: BANK },
  { id: 'w3', name: 'メインカード', accountId: CARD },
];

const budgets = [
  { accountId: 'e01', amount: 60000 },  // 食費
  { accountId: 'e02', amount: 15000 },  // 日用品費
  { accountId: 'e05', amount: 12000 },  // 交通費
  { accountId: 'e07', amount: 20000 },  // 娯楽費
  { accountId: 'e08', amount: 10000 },  // 衣服費
];

const rules = [
  { id: 'r1', keyword: 'セブン', drAccountId: 'e01', crAccountId: CASH },
  { id: 'r2', keyword: 'スーパー', drAccountId: 'e01', crAccountId: CARD },
  { id: 'r3', keyword: 'ドラッグ', drAccountId: 'e02', crAccountId: CARD },
  { id: 'r4', keyword: 'JR', drAccountId: 'e05', crAccountId: CASH },
];

// ── 仕訳 ────────────────────────────────────────────────────
const journals = [];
let n = 0;
const add = (date, desc, lines) => journals.push({ id: `demo${String(++n).padStart(4, '0')}`, date, desc, lines });
const entry = (date, desc, dr, cr, amount, tagId) =>
  add(date, desc, [
    { accountId: dr, side: 'dr', amount, taxRate: 0, ...(tagId ? { tagId } : {}) },
    { accountId: cr, side: 'cr', amount, taxRate: 0 },
  ]);

const today = new Date();
const start = new Date(today.getFullYear(), today.getMonth() - 2, 1);

// 開始残高。元入金を相手にして、預金と現金の初期値を置く。
// これが無いと期首から残高がマイナスで始まり、貸借対照表が不自然になる。
entry(ymd(start), '開始残高（普通預金）', BANK, 'c01', 840000);
entry(ymd(start), '開始残高（現金）', CASH, 'c01', 32000);
entry(ymd(start), '開始残高（有価証券）', 'a05', 'c01', 500000);

const SUPER = ['スーパーマルエツ', 'ライフ', '業務スーパー', 'オーケーストア'];
const CONVENI = ['セブン-イレブン', 'ファミリーマート', 'ローソン'];
const CAFE = ['スターバックス', 'ドトール', 'コメダ珈琲'];

for (let m = 0; m < 3; m++) {
  const base = new Date(start.getFullYear(), start.getMonth() + m, 1);
  const y = base.getFullYear();
  const mo = base.getMonth();
  const lastDay = new Date(y, mo + 1, 0).getDate();
  const day = (d) => ymd(new Date(y, mo, Math.min(d, lastDay)));

  // 固定の出入り
  entry(day(25), '給与', BANK, 'd01', 328000);
  entry(day(27), '家賃', 'e09', BANK, 92000, 't2');
  entry(day(5), '電気・ガス・水道', 'e03', BANK, around(14000, 2500), 't2');
  entry(day(15), '携帯・回線', 'e04', BANK, 8800, 't2');
  entry(day(20), '生命保険', 'e10', BANK, 12000, 't2');
  entry(day(8), 'ATM 引き出し', CASH, BANK, 30000);

  // 買い物。曜日を問わず散らす。
  // 当月だけ日を詰める。月初に投入すると当月の記録が数件しか残らず、
  // 既定の期間が「今月」のダッシュボードがほぼ空で表示される。
  const step = m === 2 ? 1 : 2;
  for (let d = 2; d <= lastDay; d += step) {
    const r = rand();
    if (r < 0.42) entry(day(d), pick(SUPER), 'e01', CARD, around(4200, 1800), 't1');
    else if (r < 0.68) entry(day(d), pick(CONVENI), 'e01', CASH, around(780, 400), 't1');
    else if (r < 0.78) entry(day(d), 'ドラッグストア', 'e02', CARD, around(2600, 1200), 't1');
    else if (r < 0.86) entry(day(d), 'JR 交通系IC チャージ', 'e05', CASH, 3000, 't1');
    else if (r < 0.94) entry(day(d), pick(CAFE), 'e07', CARD, around(880, 350), 't3');
    else entry(day(d), '書籍', 'e11', CARD, around(1900, 800));
  }

  // 月に一度の大きめの支出。直近の月に寄せる。
  // 一番古い月に置くと、予算カード（既定は当月、実質は直近）で実績が 0 のまま出る。
  // 当月に置くと日付が未来になって切り落とされる。中間の月が確実に残る。
  if (m === 0) entry(day(12), '歯科', 'e06', CASH, 3400);
  if (m === 1) entry(day(18), '衣料品', 'e08', CARD, 12800);
  if (m === 1) entry(day(22), '友人と食事', 'e07', CARD, 6800, 't3');

  // 積立投資
  entry(day(26), '投信つみたて', 'a05', BANK, 30000);

  // カードの引き落とし。締めた分が翌月10日に口座から落ちる。
  // これを入れないと負債が減らず、貸借対照表が実態と合わない。
  const cycleEnd = new Date(y, mo - 1, CC_CLOSE);
  const used = journals
    .filter((j) => j.date > ymd(new Date(y, mo - 2, CC_CLOSE)) && j.date <= ymd(cycleEnd))
    .reduce((s, j) => s + j.lines.filter((l) => l.accountId === CARD && l.side === 'cr')
      .reduce((t, l) => t + l.amount, 0), 0);
  if (used > 0) entry(day(CC_DAY), 'カード引き落とし', CARD, BANK, used);
}

// 未来の日付は落とす。まだ起きていない取引が並んでいると残高も収支も実態と合わず、
// 審査員には不具合に見える。生成は月単位で回すので、当月分がはみ出す。
const TODAY = ymd(today);
const past = journals.filter((j) => j.date <= TODAY);

const dataset = {
  accounts, tags, wallets, budgets, rules, allocs,
  journals: past,
  presets: DEFAULT_PRESETS,
  recurring: [
    { id: 'rc1', name: '家賃', frequency: 'monthly', day: 27, nextDate: ymd(new Date(today.getFullYear(), today.getMonth() + 1, 27)),
      lines: [{ accountId: 'e09', side: 'dr', amount: 92000 }, { accountId: BANK, side: 'cr', amount: 92000 }] },
    { id: 'rc2', name: '携帯・回線', frequency: 'monthly', day: 15, nextDate: ymd(new Date(today.getFullYear(), today.getMonth() + 1, 15)),
      lines: [{ accountId: 'e04', side: 'dr', amount: 8800 }, { accountId: BANK, side: 'cr', amount: 8800 }] },
  ],
};

// ── 出力 ────────────────────────────────────────────────────
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(dataset, null, 2));

const spent = past
  .flatMap((j) => j.lines.filter((l) => l.side === 'dr' && l.accountId.startsWith('e')))
  .reduce((s, l) => s + l.amount, 0);
console.log(`仕訳 ${past.length} 件 / 期間 ${past[3].date} 〜 ${past[past.length - 1].date}`
  + `（未来のため除外 ${journals.length - past.length} 件）`);
console.log(`費用の合計 ${spent.toLocaleString('ja-JP')} 円`);
console.log(`書き出し: ${OUT}`);

if (!process.argv.includes('--push')) {
  console.log('\n投入するには DEMO_EMAIL と DEMO_PASSWORD を渡して --push を付ける。');
  process.exit(0);
}

// ── 投入（本番のデモ口座へ書き込む）────────────────────────
const { DEMO_EMAIL, DEMO_PASSWORD } = process.env;
if (!DEMO_EMAIL || !DEMO_PASSWORD) {
  console.error('DEMO_EMAIL と DEMO_PASSWORD が要る。');
  process.exit(1);
}

// amazon-cognito-identity-js はブラウザ前提で localStorage を触る。
// Node には無いので、その場限りの入れ物を渡す。
const mem = new Map();
const storage = {
  setItem: (k, v) => mem.set(k, String(v)),
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  removeItem: (k) => mem.delete(k),
  clear: () => mem.clear(),
};

const env = ENVIRONMENTS.prod;
const pool = new CognitoUserPool({ UserPoolId: env.userPoolId, ClientId: env.clientId, Storage: storage });
const user = new CognitoUser({ Username: DEMO_EMAIL, Pool: pool, Storage: storage });

const token = await new Promise((resolve, reject) => {
  user.authenticateUser(
    new AuthenticationDetails({ Username: DEMO_EMAIL, Password: DEMO_PASSWORD }),
    { onSuccess: (s) => resolve(s.getIdToken().getJwtToken()), onFailure: reject },
  );
});

const res = await fetch(`${env.apiUrl}/api/import`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify(dataset),
});
if (!res.ok) {
  console.error('投入に失敗:', res.status, await res.text());
  process.exit(1);
}
console.log('投入しました:', JSON.stringify(await res.json()));
