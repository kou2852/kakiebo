// クレジットカードの「締め→引落」サイクルを計算する純関数群。
// 引き落とし設定（ccClose=締め日, ccDay=引落日, ccDelay=引き落とし月, ccFrom=引落口座）を持つ
// 負債科目について、利用期間ごとの利用額・引落予定日・引落状態をまとめる。

function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** ローカル日付の YYYY-MM-DD（今日） */
export function todayYmd() {
  return ymd(new Date());
}

// 月末締め対応: 指定日が当月の末日を超える場合は末日に丸める（例: 締め31日→4月は30日）
function clampDay(yy, mm, day) {
  const last = new Date(yy, mm + 1, 0).getDate();
  return new Date(yy, mm, Math.min(day, last));
}

/** 引き落とし設定済みのクレジットカード（負債科目）か */
export function isCreditCard(a) {
  return a.type === 'liability' && !!a.ccClose && !!a.ccDay && !!a.ccFrom;
}

/**
 * 締め日 close の「直前に到来した締め日」を YYYY-MM-DD で返す。
 *
 * カードの開始残高（＝次回の引落額）をこの日付で記帳すると、締め済み・未引落の
 * サイクルに乗り、次回引落として正しく出る。今日の日付だと締め前のサイクルに入り、
 * 引き落とされるのが1サイクル先へずれ込む。
 * 締まったかどうかの境界は creditCardCycles と揃える（締め日当日はまだ締め前）。
 */
export function lastClosingDate(close, now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth();
  const thisClose = clampDay(y, m, close);
  return ymd(now) > ymd(thisClose) ? ymd(thisClose) : ymd(clampDay(y, m - 1, close));
}

// 返済（引落）仕訳か: カード借方 ＋ 資産(口座)貸方。利用額・内訳には含めない。
function isSettlementJournal(j, cardId, assetIds) {
  return j.lines.some((l) => l.accountId === cardId && l.side === 'dr') &&
    j.lines.some((l) => assetIds.has(l.accountId) && l.side === 'cr');
}

/**
 * 締め→引落サイクルを新しい順で返す（利用のあるサイクル＋現在締め前のサイクルのみ）。
 * cap は遡って生成する最大サイクル数（既定36＝3年）。期間での絞り込みは呼び出し側で settleDate を見て行う。
 * 各要素: { periodStart, periodEnd, settleDate, usage, items, status }
 *   usage  = 期間内のカード利用額（負債の純増 = 貸方−借方）
 *   items  = [{ date, desc, amount }]（利用明細。amount は仕訳ごとの純増）
 *   status = 'open'(締め前) | 'settled'(引落済) | 'unsettled'(未引落) | 'none'(利用なし)
 */
export function creditCardCycles(card, journals, accounts = [], cap = 36) {
  const close = card.ccClose;
  const delay = card.ccDelay || 1;
  const now = new Date();
  const todayStr = ymd(now);
  const assetIds = new Set(accounts.filter((a) => a.type === 'asset').map((a) => a.id));

  // 現在開いているサイクルの締め月。今日が締め日を過ぎていれば翌月が締め。
  const y = now.getFullYear();
  const thisClose = clampDay(y, now.getMonth(), close);
  const baseMonth = now.getMonth() + (ymd(now) > ymd(thisClose) ? 1 : 0);

  const cycles = [];
  for (let k = 0; k < cap; k++) {
    const closeD = clampDay(y, baseMonth - k, close);
    const prevCloseD = clampDay(y, baseMonth - k - 1, close);
    const startD = new Date(prevCloseD); startD.setDate(startD.getDate() + 1); // 前回締めの翌日
    const periodEnd = ymd(closeD);
    const periodStart = ymd(startD);
    const settleDate = ymd(clampDay(y, baseMonth - k + delay, card.ccDay));

    const items = [];
    let usage = 0;
    journals.forEach((j) => {
      if (j.date < periodStart || j.date > periodEnd) return;
      if (isSettlementJournal(j, card.id, assetIds)) return; // 引落仕訳は利用額に含めない
      let net = 0;
      j.lines.forEach((l) => {
        if (l.accountId === card.id) net += l.side === 'cr' ? l.amount : -l.amount;
      });
      if (net !== 0) { usage += net; items.push({ date: j.date, desc: j.desc || '', amount: net }); }
    });
    items.sort((a, b) => a.date.localeCompare(b.date));

    // 引落済み判定: 引落日に自動生成の返済仕訳がある、または同日にカード借方の仕訳がある
    const settled = journals.some((j) =>
      j.date === settleDate &&
      ((j.desc || '').startsWith(`クレカ返済: ${card.name}`) ||
        j.lines.some((l) => l.accountId === card.id && l.side === 'dr'))
    );

    let status;
    if (periodEnd > todayStr) status = 'open';      // 締め前（利用中）
    else if (usage <= 0) status = 'none';            // 締め済みだが利用なし
    else if (settled) status = 'settled';            // 引落済み
    else status = 'unsettled';                       // 締め済み・未引落
    cycles.push({ periodStart, periodEnd, settleDate, usage, items, status });
  }
  // 利用のあるサイクルと現在締め前のサイクルのみ（空の過去サイクルは省く）
  return cycles.filter((c) => c.usage > 0 || c.status === 'open');
}

/**
 * 指定期間 [startStr, endStr] のカード利用を、相手の借方科目（費用等）で集計。
 * 返り値: [{ accountId, name, value }]（金額降順）。円グラフ用。
 */
export function creditUsageByCategory(card, journals, accounts, startStr, endStr) {
  const assetIds = new Set(accounts.filter((a) => a.type === 'asset').map((a) => a.id));
  const name = (id) => accounts.find((a) => a.id === id)?.name || '(不明)';
  const byAcc = {};
  journals.forEach((j) => {
    if (j.date < startStr || j.date > endStr) return;
    if (isSettlementJournal(j, card.id, assetIds)) return;
    let cardNet = 0;
    j.lines.forEach((l) => { if (l.accountId === card.id) cardNet += l.side === 'cr' ? l.amount : -l.amount; });
    if (cardNet <= 0) return; // 利用（純増）のみ対象
    // カードの相手側（借方科目）へ金額を按分
    const drOthers = j.lines.filter((l) => l.accountId !== card.id && l.side === 'dr');
    const drTotal = drOthers.reduce((s, l) => s + l.amount, 0) || cardNet;
    drOthers.forEach((l) => {
      byAcc[l.accountId] = (byAcc[l.accountId] || 0) + cardNet * (l.amount / drTotal);
    });
  });
  return Object.entries(byAcc)
    .map(([accountId, value]) => ({ accountId, name: name(accountId), value: Math.round(value) }))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value);
}
