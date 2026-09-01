// 期日到来した自動取引（定期取引・クレカ返済）の集計と生成。
// クレカは creditCardCycles に準拠。引落前のサイクルも対象に含め、due フラグで到来済みを区別する。
import { ymd } from './format';
import { todayYmd, creditCardCycles, isCreditCard } from './creditCard';

/** 定期取引の次回日付を進める */
export function advanceDate(dateStr, frequency) {
  const nd = new Date(dateStr);
  if (frequency === 'monthly') nd.setMonth(nd.getMonth() + 1);
  else if (frequency === 'yearly') nd.setFullYear(nd.getFullYear() + 1);
  else nd.setDate(nd.getDate() + 7);
  return ymd(nd);
}

/** 定期取引の前回日付に戻す（advanceDate の逆） */
export function prevDate(dateStr, frequency) {
  const nd = new Date(dateStr);
  if (frequency === 'monthly') nd.setMonth(nd.getMonth() - 1);
  else if (frequency === 'yearly') nd.setFullYear(nd.getFullYear() - 1);
  else nd.setDate(nd.getDate() - 7);
  return ymd(nd);
}

/** その予定日が既に記帳済みか（同日・摘要一致で判定） */
function isRecorded(r, date, journals) {
  const desc = r.desc || r.name;
  return (journals || []).some((j) => j.date === date && (j.desc || '') === desc);
}

/** 日付 D が定期取引 r の予定日列（nextDate から period 単位）に乗っているか */
function onSchedule(r, D) {
  if (!r.nextDate) return false;
  if (D === r.nextDate) return true;
  let d = r.nextDate;
  let g = 0;
  if (D < d) { while (d > D && g++ < 1200) d = prevDate(d, r.frequency); }
  else { while (d < D && g++ < 1200) d = advanceDate(d, r.frequency); }
  return d === D;
}

/** r の予定日に一致して実際に記帳済みの日付（昇順） */
function recordedDates(r, journals) {
  const desc = r.desc || r.name;
  return (journals || [])
    .filter((j) => (j.desc || '') === desc && onSchedule(r, j.date))
    .map((j) => j.date)
    .sort();
}

/** 走査の起点：記帳済みがあれば最古の記帳済み予定日、無ければ nextDate（直近に起票された分を基準にする） */
function recurringAnchor(r, journals) {
  const rec = recordedDates(r, journals);
  return rec.length ? rec[0] : r.nextDate;
}

/** 実効「次回生成日」：起点以降で最初に未記帳の予定日（途中で削除されたギャップ＝生成対象を含む） */
export function effectiveNextDate(r, journals, todayStr = todayYmd()) {
  let d = recurringAnchor(r, journals);
  let g = 0;
  while (d && g++ < 1200) {
    if (!isRecorded(r, d, journals)) return d;
    d = advanceDate(d, r.frequency);
  }
  return r.nextDate;
}

/** nextDate<=today で未記帳の定期取引（各 r の生成すべき日付配列） */
export function dueRecurring(recurring, journals, todayStr = todayYmd()) {
  return (recurring || []).map((r) => {
    const dates = [];
    let next = recurringAnchor(r, journals);
    let guard = 0;
    while (next && next <= todayStr && guard < 600) {
      if (!isRecorded(r, next, journals)) dates.push(next);
      next = advanceDate(next, r.frequency); guard++;
    }
    return { id: r.id, name: r.name, dates };
  }).filter((x) => x.dates.length > 0);
}

/**
 * 削除された仕訳が定期取引の生成分（nextDate より前の予定日）なら、nextDate をその日付へ巻き戻す。
 * これにより「生成→削除」で次回生成日が進んだままになる不具合を解消（削除分を再生成可能に）。
 */
export function rollbackNextDate(recurring, deletedJournal) {
  const J = deletedJournal;
  if (!J) return recurring;
  return (recurring || []).map((r) => {
    if (!r.nextDate || (J.desc || '') !== (r.desc || r.name) || !(J.date < r.nextDate)) return r;
    // J.date が nextDate からの予定列（同周期）に乗っているか
    let d = r.nextDate;
    let g = 0;
    while (d > J.date && g++ < 600) d = prevDate(d, r.frequency);
    return d === J.date ? { ...r, nextDate: J.date } : r;
  });
}

/**
 * 締め済み・未引落で未生成のクレカサイクルを全件返す（引落前も含む）。
 * 各要素 { key, card, cycle, due }（due = 引落日が到来済み）。
 */
export function pendingCC(accounts, journals, todayStr = todayYmd()) {
  const out = [];
  (accounts || []).filter(isCreditCard).forEach((c) => {
    creditCardCycles(c, journals, accounts)
      .filter((cy) => cy.status === 'unsettled')
      .forEach((cy) => {
        const descPrefix = `クレカ返済: ${c.name}`;
        if (journals.some((j) => j.date === cy.settleDate && (j.desc || '').startsWith(descPrefix))) return;
        out.push({ key: `${c.id}:${cy.periodEnd}`, card: c, cycle: cy, due: cy.settleDate <= todayStr });
      });
  });
  return out.sort((a, b) => a.cycle.settleDate.localeCompare(b.cycle.settleDate));
}

/** バッジ用の件数。total は「放置中＝未記帳」とみなす 定期＋クレカ(引落到来済み) */
export function pendingCounts(recurring, accounts, journals, todayStr = todayYmd()) {
  const r = dueRecurring(recurring, journals, todayStr).reduce((s, x) => s + x.dates.length, 0);
  const cc = pendingCC(accounts, journals, todayStr);
  const ccDue = cc.filter((x) => x.due).length;
  return { recurring: r, ccDue, ccTotal: cc.length, total: r + ccDue };
}

/**
 * 定期取引を記帳（記帳済みはスキップ）。生成件数を返す。
 * - 既定は「今日まで」の未生成分を追いつき生成。
 * - preGenerate=true のときは期日前でも「次の未記帳予定日」まで1件先取り生成できる（事前生成）。
 * - onlyId 指定時はその定期取引のみ生成（他はそのまま保持）。
 * - nextDate の変更は saveRecurring（全配列）で永続化する。
 */
export async function generateRecurring({ recurring, journals = [], addJournal, saveRecurring, todayStr = todayYmd(), preGenerate = false, onlyId = null }) {
  let cnt = 0;
  const updated = (recurring || []).map((r) => ({ ...r }));
  let changed = false;
  for (const r of updated) {
    if (onlyId && r.id !== onlyId) continue;
    // 事前生成: 追いつき済み（次の予定日が未来）なら、その1件まで先取り生成する
    const eff = effectiveNextDate(r, journals, todayStr);
    const horizon = (preGenerate && eff && eff > todayStr) ? eff : todayStr;
    let next = recurringAnchor(r, journals);
    let gen = 0;
    while (next && next <= horizon && gen < 600) {
      if (!isRecorded(r, next, journals)) {
        const lines = r.lines.map((l) => {
          const ln = { accountId: l.accountId, side: l.side, amount: l.amount, taxRate: 0 };
          if (l.tagId) ln.splits = [{ tagId: l.tagId, amount: l.amount }];
          return ln;
        });
        await addJournal({ date: next, desc: r.desc || r.name, lines });
        cnt++;
      }
      next = advanceDate(next, r.frequency); gen++;
    }
    if (next && next !== r.nextDate) { r.nextDate = next; changed = true; }
  }
  if (changed && saveRecurring) await saveRecurring(updated);
  return cnt;
}

/** 選択された CC サイクル（pendingCC の要素）を記帳。生成件数を返す */
export async function postCCSettlements(items, addJournal) {
  let cnt = 0;
  for (const { card, cycle } of items) {
    const closeMonth = parseInt(cycle.periodEnd.slice(5, 7), 10);
    await addJournal({
      date: cycle.settleDate,
      desc: `クレカ返済: ${card.name} (${closeMonth}月締め分)`,
      lines: [
        { accountId: card.id, side: 'dr', amount: cycle.usage, taxRate: 0 },
        { accountId: card.ccFrom, side: 'cr', amount: cycle.usage, taxRate: 0 },
      ],
    });
    cnt++;
  }
  return cnt;
}
