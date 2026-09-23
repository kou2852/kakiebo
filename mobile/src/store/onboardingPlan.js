// オンボーディングで入れた内容を「意図」に変換する。純粋関数（保存も画面も触らない）。
//
// ⚠ 積む順序を変えないこと。同期は意図を積まれた順に処理し、科目を作るときサーバーが
//   id を振り直す（store/sync.js の remap）。科目より先に仕訳や口座を積むと、参照先の
//   無い仕訳ができて貸借が合わなくなる。画面にはエラーが出ないので気づけない。
//   順序: 科目 → 仕訳（開始残高）→ 口座 → 定期取引
//
// ⚠ ここを画面ごとに呼んで保存しない。オンボーディングの間は何も書かず、最後の
//   「はじめる」で一度だけ commitAll に渡す。途中でやめた人の端末に中途半端な口座が
//   残ると、そのあとログインしたとき「端末が空」の安全な取り込み経路を外れる。
//
// .js の拡張子付きで import しているのは、node で検証スクリプトを走らせるため（merge.js と同じ）。
import { upsert } from '../db/intents.js';
import { EQUITY_ID, nextCode } from '../utils/accountCode.js';

/**
 * A-1「どれを管理したいですか？」の選択肢。
 *
 * accountId は既定科目（db/defaults.js）の固定 id。利用者が消していれば作り直す。
 * wallet は「記帳画面で支払方法として選べるようにするか」。証券とローンは支払い手段では
 * ないので作らない（口座の定義は manage/wallets.jsx に合わせる）。
 */
export const KINDS = [
  { key: 'cash', label: '現金', sub: '財布の中のお金', type: 'asset', accountId: 'a01', wallet: true },
  { key: 'bank', label: '銀行口座', sub: '普通預金・定期預金', type: 'asset', accountId: 'a02', wallet: true },
  { key: 'card', label: 'クレジットカード', sub: '後払いの利用分', type: 'liability', accountId: 'b03', wallet: true },
  { key: 'emoney', label: '電子マネー', sub: '交通系・コード決済', type: 'asset', accountId: null, wallet: true },
  { key: 'invest', label: '証券・NISA', sub: '投資しているお金', type: 'asset', accountId: 'a05', wallet: false },
  { key: 'loan', label: 'ローン', sub: '住宅・車・奨学金', type: 'liability', accountId: 'b04', wallet: false },
];

/** A-2b「毎月決まっているお金」の候補。相手科目は既定科目の固定 id。 */
export const MONTHLY_PRESETS = [
  { key: 'salary', name: '給料', dir: 'in', accountId: 'd01' },
  { key: 'rent', name: '家賃', dir: 'out', accountId: 'e09' },
  { key: 'phone', name: '携帯電話', dir: 'out', accountId: 'e04' },
  { key: 'subs', name: 'サブスク', dir: 'out', accountId: 'e07' },
  { key: 'insure', name: '保険', dir: 'out', accountId: 'e10' },
];

/** 自分で入力したものの費目。どれとも言えないので雑費に寄せる。 */
export const CUSTOM_EXPENSE_ID = 'e12';

/**
 * 利用者が自分で入れたものがあるか。オンボーディングを出すかどうかはこれで決める。
 *
 * ⚠ 勘定科目とプリセットは見ない。これらは端末（db/defaults.js）とサーバー
 *   （backend/src/handlers/postConfirm.js）がそれぞれ初期データとして持っていて、
 *   中身が一致するかで判断すると次の2つで「帳簿がある」と誤判定し、オンボーディングを飛ばす。
 *   ・2つの初期データを揃え忘れた（片方だけに科目を足した等）
 *   ・サーバーの初期データ投入が失敗し、新しいアカウントが空で返ってきた
 *
 * ⚠ store/merge.js の hasContent と混同しないこと。あちらはログイン時に端末を上書きしてよいかの
 *   判定で、既定科目の名前を変えただけの端末も「中身あり」として守る必要があるので厳しい。
 */
const USER_COLLECTIONS = ['journals', 'wallets', 'recurring', 'budgets', 'rules', 'tags', 'allocs'];
export function hasUserData(ds) {
  return USER_COLLECTIONS.some((c) => (ds?.[c] || []).length > 0);
}

/** 「¥12,000」「12000」どちらでも読む。空や数字以外は0。 */
export function yen(v) {
  const n = parseFloat(String(v ?? '').replace(/[¥,，\s]/g, ''));
  return Number.isFinite(n) ? Math.round(n) : 0;
}

/**
 * 毎月 day 日の次回予定日。今日より前の日なら翌月へ送る。
 * 31日のように月末を超える指定は、その月の末日に丸める（2月なら28日）。
 */
export function nextMonthlyDate(day, todayStr) {
  const [y, m, d] = todayStr.split('-').map(Number);
  let yy = y;
  let mm = m;
  if (day < d) {
    mm += 1;
    if (mm > 12) { mm = 1; yy += 1; }
  }
  const last = new Date(yy, mm, 0).getDate(); // mm は1始まりなので、これで mm 月の末日
  const dd = Math.min(Math.max(1, day), last);
  return `${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

/**
 * 入れた残高の合計。A-3 に出す数字はこれで、buildPlan が作る仕訳と同じ元から計算する。
 * 返り値 { assets, liabilities, netWorth, rows }
 */
export function summarize(draft) {
  const picks = draft?.picks || [];
  const rows = KINDS
    .filter((k) => picks.includes(k.key))
    .map((k) => ({ key: k.key, label: k.label, type: k.type, amount: yen(draft?.balances?.[k.key]) }));
  const assets = rows.filter((r) => r.type === 'asset').reduce((s, r) => s + r.amount, 0);
  const liabilities = rows.filter((r) => r.type === 'liability').reduce((s, r) => s + r.amount, 0);
  return { assets, liabilities, netWorth: assets - liabilities, rows };
}

/**
 * 入れた内容を意図の配列にする。
 *
 * @param draft    { picks: string[], balances: {kind: string}, monthly: [{name, dir, day, amount, accountId?}] }
 * @param accounts 今の勘定科目（既定科目が消されているかを見る）
 * @param todayStr YYYY-MM-DD
 * @param newId    id を作る関数（utils/format.js の uid。テストで固定するため引数にする）
 */
export function buildPlan(draft, accounts, todayStr, newId) {
  const picks = draft?.picks || [];
  const intents = [];
  const made = []; // この場で作った科目。コードの採番で既存と一緒に見る
  const known = () => [...accounts, ...made];
  const exists = (id) => known().some((a) => a.id === id);

  // 1. 科目。既定科目があればそれを使い、無ければ作る。
  const accountOf = {};
  for (const k of KINDS) {
    if (!picks.includes(k.key)) continue;
    if (k.accountId && exists(k.accountId)) { accountOf[k.key] = k.accountId; continue; }
    const acc = { id: newId(), name: k.label, code: nextCode(known(), k.type), type: k.type };
    made.push(acc);
    intents.push(upsert('accounts', acc));
    accountOf[k.key] = acc.id;
  }

  // 2. 開始残高の仕訳。資産は (借)科目/(貸)元入金、負債は (借)元入金/(貸)科目。
  //
  // ⚠ 元入金が無い端末では記帳しない。相手科目が無いまま作ると貸借が合わない仕訳になり、
  //   残高が出なくなる（manage/accounts.jsx と同じ扱い）。科目と口座は作る。
  const hasEquity = exists(EQUITY_ID);
  for (const k of KINDS) {
    if (!picks.includes(k.key)) continue;
    const amount = yen(draft?.balances?.[k.key]);
    if (amount <= 0 || !hasEquity) continue;
    const id = accountOf[k.key];
    const lines = k.type === 'asset'
      ? [{ accountId: id, side: 'dr', amount, taxRate: 0 }, { accountId: EQUITY_ID, side: 'cr', amount, taxRate: 0 }]
      : [{ accountId: EQUITY_ID, side: 'dr', amount, taxRate: 0 }, { accountId: id, side: 'cr', amount, taxRate: 0 }];
    intents.push(upsert('journals', { id: newId(), date: todayStr, desc: `開始残高（${k.label}）`, lines }));
  }

  // 3. 口座（支払い手段）。
  for (const k of KINDS) {
    if (!picks.includes(k.key) || !k.wallet) continue;
    intents.push(upsert('wallets', { id: newId(), name: k.label, accountId: accountOf[k.key] }));
  }

  // 4. 定期取引。支払元・入金先は、選んだ口座のうち銀行→現金の順で決める。
  const payId = accountOf.bank || accountOf.cash || null;
  for (const item of draft?.monthly || []) {
    const amount = yen(item?.amount);
    const name = String(item?.name || '').trim();
    if (!name || amount <= 0 || !payId) continue;
    // 相手科目（給与収入・住居費など）。消されている端末では作らずに飛ばす。
    const otherId = item?.accountId || (item?.dir === 'in' ? 'd01' : CUSTOM_EXPENSE_ID);
    if (!exists(otherId)) continue;
    const day = Number(item?.day) || 1;
    const lines = item?.dir === 'in'
      ? [{ accountId: payId, side: 'dr', amount, tagId: '' }, { accountId: otherId, side: 'cr', amount, tagId: '' }]
      : [{ accountId: otherId, side: 'dr', amount, tagId: '' }, { accountId: payId, side: 'cr', amount, tagId: '' }];
    const nextDate = nextMonthlyDate(day, todayStr);
    intents.push(upsert('recurring', {
      id: newId(), name, desc: '', frequency: 'monthly',
      day: Number(nextDate.slice(8, 10)), nextDate, lines,
    }));
  }

  return intents;
}

/** buildPlan が作った id の一覧。ログイン時に「これだけなら捨ててよい」を判断するために覚えておく。 */
export function idsFromIntents(intents) {
  return (intents || []).map((i) => i?.item?.id).filter(Boolean);
}

/**
 * 指定した id のものを取り除いたデータセットを返す（引数は変更しない）。
 *
 * ⚠ 使うのは「既にアカウントに帳簿がある人がログインしたとき」だけ。渡すのは
 *   オンボーディングが作った id に限る。ゲストとして記帳したものの id は入らないので、
 *   その帳簿は必ず残る（store/merge.js の保証と同じ線を守る）。
 */
export function withoutIds(ds, ids) {
  const drop = new Set(ids || []);
  if (!drop.size) return ds;
  const out = {};
  for (const c of Object.keys(ds || {})) {
    const cur = ds[c];
    out[c] = Array.isArray(cur) ? cur.filter((x) => !drop.has(x?.id)) : cur;
  }
  return out;
}

/** 意図がオンボーディング由来か（未送信キューから取り除く判定）。 */
export function isOnboardingIntent(intent, ids) {
  const made = new Set(ids || []);
  if (intent?.t === 'upsert') return made.has(intent?.item?.id);
  if (intent?.t === 'remove') return made.has(intent?.id);
  return false; // replace（予算・タグ配分）はオンボーディングでは積まれない
}
