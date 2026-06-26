/**
 * 仕訳配列から勘定科目ごとの借方・貸方合計を計算。
 * @param {Array} journals - 仕訳配列
 * @param {Array} accounts - 勘定科目配列
 * @returns {Object} { [accountId]: { dr: number, cr: number } }
 */
export function calcBalances(journals, accounts) {
  const bal = {};
  accounts.forEach((a) => { bal[a.id] = { dr: 0, cr: 0 }; });
  journals.forEach((j) =>
    j.lines.forEach((l) => {
      if (!bal[l.accountId]) bal[l.accountId] = { dr: 0, cr: 0 };
      bal[l.accountId][l.side] += l.amount;
    })
  );
  return bal;
}

/**
 * 勘定科目の残高を計算（借方残高 or 貸方残高）。
 * 資産・費用 → 借方-貸方、負債・純資産・収益 → 貸方-借方
 */
export function accountBalance(accountId, accounts, balances) {
  const account = accounts.find((a) => a.id === accountId);
  if (!account || !balances[accountId]) return 0;
  const { dr, cr } = balances[accountId];
  return (account.type === 'asset' || account.type === 'expense')
    ? dr - cr
    : cr - dr;
}

/**
 * 期間フィルタ付き仕訳取得。
 */
export function filterByPeriod(journals, start, end) {
  return journals.filter((j) => j.date >= start && j.date <= end);
}

/**
 * 期間の開始日・終了日を計算。
 */
export function getPeriodRange(mode, custom = {}) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  switch (mode) {
    case 'month':
      return { start: fmt(new Date(y, m, 1)), end: fmt(new Date(y, m + 1, 0)) };
    case 'lastm':
      return { start: fmt(new Date(y, m - 1, 1)), end: fmt(new Date(y, m, 0)) };
    case 'last2m':
      return { start: fmt(new Date(y, m - 2, 1)), end: fmt(new Date(y, m - 1, 0)) };
    case 'year':
      return { start: `${y}-01-01`, end: `${y}-12-31` };
    case 'custom':
      return { start: custom.start || `${y}-01-01`, end: custom.end || fmt(now) };
    case 'all':
    default:
      return { start: '1900-01-01', end: '2999-12-31' };
  }
}

/**
 * タグ別残高計算（仕訳のsplitsから）。
 */
export function computeTagBalances(journals, accounts) {
  const result = {};
  journals.forEach((j) =>
    j.lines.forEach((l) => {
      const splits = l.splits || [];
      if (!splits.length) return;
      const account = accounts.find((a) => a.id === l.accountId);
      if (!account) return;
      const sign =
        (account.type === 'asset' || account.type === 'expense')
          ? (l.side === 'dr' ? 1 : -1)
          : (l.side === 'cr' ? 1 : -1);
      splits.forEach((sp) => {
        if (!sp.tagId) return;
        if (!result[l.accountId]) result[l.accountId] = {};
        if (!result[l.accountId][sp.tagId]) result[l.accountId][sp.tagId] = 0;
        result[l.accountId][sp.tagId] += sp.amount * sign;
      });
    })
  );
  return result;
}

/**
 * 月次推移データ生成（直近N ヶ月）。
 */
export function monthlyTrend(journals, accounts, months = 6) {
  const now = new Date();
  const data = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const start = fmt(d);
    const end = fmt(new Date(d.getFullYear(), d.getMonth() + 1, 0));
    const mj = filterByPeriod(journals, start, end);
    const bal = calcBalances(mj, accounts);
    const income = accounts
      .filter((a) => a.type === 'income')
      .reduce((s, a) => s + accountBalance(a.id, accounts, bal), 0);
    const expense = accounts
      .filter((a) => a.type === 'expense')
      .reduce((s, a) => s + accountBalance(a.id, accounts, bal), 0);
    data.push({ label: `${d.getMonth() + 1}月`, income, expense });
  }
  return data;
}

/**
 * 月末純資産の推移（直近N ヶ月）。各月末時点の累計残高から 資産−負債 を算出。
 * @returns {Array<{label:string, net:number}>}
 */
export function netWorthTrend(journals, accounts, months = 6) {
  const now = new Date();
  const data = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = fmt(new Date(d.getFullYear(), d.getMonth() + 1, 0)); // その月の末日
    const upto = journals.filter((j) => j.date <= end);
    const bal = calcBalances(upto, accounts);
    const asset = accounts.filter((a) => a.type === 'asset').reduce((s, a) => s + accountBalance(a.id, accounts, bal), 0);
    const liab = accounts.filter((a) => a.type === 'liability').reduce((s, a) => s + accountBalance(a.id, accounts, bal), 0);
    data.push({ label: `${d.getMonth() + 1}月`, net: asset - liab });
  }
  return data;
}

/** 現金・預金科目か（資産かつコード100x or 名称に現金/預金） */
export function isCashAccount(a) {
  return a.type === 'asset' && (/^100/.test(a.code || '') || /現金|預金/.test(a.name || ''));
}

/** 投資性の資産科目か（有価証券・固定資産。コード12x/13x or 名称一致） */
function isInvestmentAsset(a) {
  return a.type === 'asset' && (/^1[23]/.test(a.code || '') || /有価証券|固定資産|投資/.test(a.name || ''));
}

/** 相手科目のCF区分を判定（簡易直接法） */
function cfCategory(account) {
  if (!account) return 'operating';
  if (account.type === 'income' || account.type === 'expense') return 'operating';
  if (account.type === 'liability' || account.type === 'equity') return 'financing';
  if (account.type === 'asset') return isInvestmentAsset(account) ? 'investing' : 'operating';
  return 'operating';
}

/**
 * キャッシュフロー計算書（簡易直接法）。
 * 現金・預金科目の増減を、同一仕訳の相手科目区分で営業/投資/財務に3分類する。
 * @returns {Object} { operating, investing, financing, net, items: {operating[], investing[], financing[]} }
 *   items の各要素は { accountId, amount }（流入が正、流出が負）
 */
export function computeCashFlow(journals, accounts) {
  const cashSet = new Set(accounts.filter(isCashAccount).map((a) => a.id));
  const cats = { operating: {}, investing: {}, financing: {} };
  const totals = { operating: 0, investing: 0, financing: 0 };

  journals.forEach((j) => {
    const cashLines = j.lines.filter((l) => cashSet.has(l.accountId));
    if (!cashLines.length) return;
    const others = j.lines.filter((l) => !cashSet.has(l.accountId));
    if (!others.length) return; // 現金⇔現金の振替は対象外
    const cashDelta = cashLines.reduce((s, l) => s + (l.side === 'dr' ? l.amount : -l.amount), 0);
    if (cashDelta === 0) return;
    const otherTotal = others.reduce((s, l) => s + l.amount, 0);
    if (otherTotal === 0) return;
    // 現金増減を相手科目の金額按分で各区分へ配分
    others.forEach((l) => {
      const acc = accounts.find((a) => a.id === l.accountId);
      const cat = cfCategory(acc);
      const share = cashDelta * (l.amount / otherTotal);
      cats[cat][l.accountId] = (cats[cat][l.accountId] || 0) + share;
      totals[cat] += share;
    });
  });

  const toItems = (obj) => Object.entries(obj)
    .map(([accountId, amount]) => ({ accountId, amount }))
    .filter((x) => Math.abs(x.amount) >= 0.5)
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));

  return {
    operating: totals.operating,
    investing: totals.investing,
    financing: totals.financing,
    net: totals.operating + totals.investing + totals.financing,
    items: {
      operating: toItems(cats.operating),
      investing: toItems(cats.investing),
      financing: toItems(cats.financing),
    },
  };
}

function fmt(d) {
  // ローカル日付で YYYY-MM-DD（toISOString は UTC 変換で JST だと1日ずれるため使わない）
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
