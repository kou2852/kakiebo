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

// タグの符号判定。「そのタグのお金が増えたか減ったか」を科目区分と貸借から決める。
const TAG_SIGN = {
  asset: { dr: 1, cr: -1 },      // 口座に入る / 口座から出る
  expense: { dr: -1, cr: 1 },    // 使った / 返金された
  income: { dr: -1, cr: 1 },     // 収入が入った
  liability: { dr: -1, cr: 1 },  // 返済で出ていった / 借入で入ってきた
  equity: { dr: -1, cr: 1 },
};
// どの行に付いたタグを採用するかの優先順位（小さいほど優先）。
// 資産行は実際の口座の出入りそのものなので最優先。
const TAG_LEVEL = { asset: 0, expense: 1, income: 1, liability: 2, equity: 2 };
// 未知の区分（壊れたバックアップの取込など）は負債・純資産と同じ扱いにする
const tagSign = (type, side) => (TAG_SIGN[type] || TAG_SIGN.equity)[side];
const tagLevel = (type) => TAG_LEVEL[type] ?? 2;

/**
 * タグ別残高計算（仕訳のsplitsから）。
 *
 * タグは「口座のお金に色をつける封筒」。1つの仕訳につき1つのタグは1回だけ増減する。
 * どの行にタグを付けても向きがぶれないよう、次の優先順位で1段だけ採用する:
 *   1. 資産行  … 借方=増える / 貸方=減る（実際に口座を出入りした額）
 *   2. 費用・収益行 … 費用=減る / 収益=増える（カード払いなど資産が動かない取引も拾う）
 *   3. 負債・純資産行 … 借方=減る（返済） / 貸方=増える（借入）
 * これにより借方・貸方の両方に同じタグを付けても二重計上・相殺が起きない。
 *
 * 2・3 で拾った増減は同じ仕訳の資産行へ金額按分して口座に紐づける。資産行が無い
 * 取引（カード払いなど）は口座別配分には現れないが、タグ合計からは差し引く。
 *
 * @returns {{ byAccount: Object, byTag: Object }}
 *   byAccount: { [accountId]: { [tagId]: number } } 口座別のタグ配分
 *   byTag:     { [tagId]: number } タグ合計（口座に紐づかない分も含む）
 */
export function computeTagBalances(journals, accounts) {
  const byAccount = {};
  const byTag = {};
  const acctById = new Map(accounts.map((a) => [a.id, a]));

  const add = (accountId, tagId, amount) => {
    if (!amount) return;
    byTag[tagId] = (byTag[tagId] || 0) + amount;
    if (!accountId) return;
    if (!byAccount[accountId]) byAccount[accountId] = {};
    byAccount[accountId][tagId] = (byAccount[accountId][tagId] || 0) + amount;
  };

  journals.forEach((j) => {
    const lines = (j.lines || [])
      .map((l) => ({ ...l, account: acctById.get(l.accountId) }))
      .filter((l) => l.account && l.amount);
    if (!lines.length) return;

    // 旧クイック入力が仕訳直下に残した tagId。行にタグが無いときだけ全行に効かせる
    const jTag = j.tagId && !lines.some((l) => (l.splits || []).length) ? j.tagId : null;

    // タグごとに最優先の段の行だけを集める
    const perTag = {};
    lines.forEach((l) => {
      const splits = jTag ? [{ tagId: jTag, amount: l.amount }] : (l.splits || []);
      splits.forEach((sp) => {
        if (!sp.tagId || !sp.amount) return;
        const level = tagLevel(l.account.type);
        const cur = perTag[sp.tagId];
        if (!cur || level < cur.level) perTag[sp.tagId] = { level, entries: [{ line: l, amount: sp.amount }] };
        else if (level === cur.level) cur.entries.push({ line: l, amount: sp.amount });
      });
    });

    const assetLines = lines.filter((l) => l.account.type === 'asset');
    const assetAbs = assetLines.reduce((s, l) => s + Math.abs(l.amount), 0);

    Object.entries(perTag).forEach(([tagId, { level, entries }]) => {
      const signed = ({ line, amount }) => amount * tagSign(line.account.type, line.side);
      if (level === 0) {
        entries.forEach((e) => add(e.line.accountId, tagId, signed(e)));
        return;
      }
      const delta = entries.reduce((s, e) => s + signed(e), 0);
      if (!delta) return;
      if (!assetAbs) { add(null, tagId, delta); return; }
      let rest = delta;
      assetLines.forEach((l, i) => {
        const share = i === assetLines.length - 1 ? rest : Math.round(delta * (Math.abs(l.amount) / assetAbs));
        rest -= share;
        add(l.accountId, tagId, share);
      });
    });
  });

  return { byAccount, byTag };
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
export function isInvestmentAsset(a) {
  return a.type === 'asset' && (/^1[23]/.test(a.code || '') || /有価証券|固定資産|投資/.test(a.name || ''));
}

/** 評価損益の科目か（残高合わせの相手に使う。名称で判定） */
export function isValuationAccount(a) {
  return /評価損益/.test(a?.name || '');
}

/**
 * 投資性資産ごとの 元本 / 評価損益 / 時価。
 *
 * iDeCo やつみたてNISA は「いくら積んで、いくら増えたか」を見るものなので、科目を分けずに
 * 仕訳から振り分ける。同じ仕訳に「評価損益」科目が入っていれば評価替え、なければ拠出（元本）。
 * 給与天引きの拠出（相手が収益）も元本として拾える。元本＋評価損益は科目残高に一致する。
 *
 * @returns {Array<{account, principal, gain, value, rate, lastValuation}>} 時価の降順
 *   lastValuation は最後に評価替えした日（YYYY-MM-DD、未実施なら ''）
 */
export function investmentSummary(journals, accounts) {
  const targets = accounts.filter(isInvestmentAsset);
  if (!targets.length) return [];
  const valuationIds = new Set(accounts.filter(isValuationAccount).map((a) => a.id));
  const rows = new Map(targets.map((a) => [a.id, { account: a, principal: 0, gain: 0, lastValuation: '' }]));

  journals.forEach((j) => {
    const lines = j.lines || [];
    const isValuation = lines.some((l) => valuationIds.has(l.accountId));
    lines.forEach((l) => {
      const row = rows.get(l.accountId);
      if (!row) return;
      const delta = (l.side === 'dr' ? 1 : -1) * l.amount;
      if (isValuation) {
        row.gain += delta;
        if (j.date > row.lastValuation) row.lastValuation = j.date;
      } else {
        row.principal += delta;
      }
    });
  });

  return [...rows.values()]
    .filter((r) => r.principal !== 0 || r.gain !== 0)
    .map((r) => ({ ...r, value: r.principal + r.gain, rate: r.principal ? r.gain / r.principal : 0 }))
    .sort((a, b) => b.value - a.value);
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

/**
 * 口座（資産科目）ごとのタグ配分。タグ・配分ページとダッシュボードで共有する。
 *
 * computeTagBalances の byAccount（仕訳から拾った分）と allocs（手動配分）を足し合わせる。
 * 「行=タグ / 列=口座」の表のうち、列ごとに縦に読んだものにあたる。
 *
 * 表示するのは、残高があるか・配分があるか・口座として登録済みのいずれか。
 * 残高0で口座登録もない既定科目（売掛金・固定資産など）まで並べると読めなくなるため。
 * 以前は残高が正の口座だけを出していたので、作ったばかりの口座が出てこなかった。
 *
 * @returns {{account, bal, items, free, defaultTag, defaultColor}[]} 残高の多い順
 *   items: [{ tagId, name, color, amount }] 金額の多い順。使いすぎでマイナスになりうる
 *   free:  残高 − 配分合計。マイナスなら配分超過
 */
export function tagAllocation(journals, accounts, tags, allocs, wallets) {
  const bal0 = calcBalances(journals, accounts);
  const tagBals = computeTagBalances(journals, accounts);
  const tagById = new Map((tags || []).map((t) => [t.id, t]));

  return accounts
    .filter((a) => a.type === 'asset')
    .map((a) => {
      // 残高はマイナスにもなりうる。0 に丸めると、その口座が一覧から消えてしまう。
      const bal = accountBalance(a.id, accounts, bal0);
      const merged = {};
      (allocs || []).forEach((x) => {
        if (x.accountId === a.id) merged[x.tagId] = (merged[x.tagId] || 0) + x.amount;
      });
      Object.entries(tagBals.byAccount[a.id] || {}).forEach(([tid, amt]) => {
        merged[tid] = (merged[tid] || 0) + amt;
      });
      const items = Object.entries(merged)
        .filter(([, v]) => Math.round(v) !== 0)
        .map(([tagId, amount]) => ({
          tagId,
          name: tagById.get(tagId)?.name || '?',
          color: tagById.get(tagId)?.color || '#666',
          amount,
        }))
        .sort((x, y) => y.amount - x.amount);
      const allocated = items.reduce((s, x) => s + x.amount, 0);
      const w = (wallets || []).find((x) => x.accountId === a.id);
      return {
        account: a,
        bal,
        items,
        free: bal - allocated,
        defaultTag: w?.defaultTagName || '(未配分)',
        defaultColor: w?.defaultTagColor || '#888',
        isWallet: !!w,
      };
    })
    .filter((d) => d.bal !== 0 || d.items.length > 0 || d.isWallet)
    .sort((x, y) => y.bal - x.bal);
}
