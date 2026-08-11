import { useState, useMemo } from 'react';
import { useData } from '../../contexts/DataContext';
import { fa } from '../../utils/format';
import { calcBalances, accountBalance, filterByPeriod } from '../../utils/bookkeeping';
import BudgetModal from '../Settings/BudgetModal';

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * 予算の進捗。予算は「1ヶ月あたりの額」なので、期間が複数月にまたがるときは月数分に伸ばす。
 * 月数は日数から求める（暦の月末差を吸収するため30.44日を1ヶ月として端数も反映）。
 *
 * 全期間は「いつまでの予算か」が決まらないため当月に固定する。
 */
export default function BudgetPanel({ period = 'month', start, end }) {
  const { accounts, journals, budgets } = useData();
  const [modalOpen, setModalOpen] = useState(false);

  const now = new Date();
  const useCurrentMonth = period === 'all' || !start || !end;
  const from = useCurrentMonth ? ymd(new Date(now.getFullYear(), now.getMonth(), 1)) : start;
  const to = useCurrentMonth ? ymd(new Date(now.getFullYear(), now.getMonth() + 1, 0)) : end;

  const totalDays = Math.max(1, Math.round((new Date(`${to}T00:00:00`) - new Date(`${from}T00:00:00`)) / 86400000) + 1);
  const months = Math.max(1, Math.round((totalDays / 30.44) * 10) / 10);
  const today = ymd(now);
  const inProgress = from <= today && today <= to; // 進行中の期間だけ「残り日数」に意味がある
  const daysPassed = inProgress
    ? Math.round((new Date(`${today}T00:00:00`) - new Date(`${from}T00:00:00`)) / 86400000) + 1
    : totalDays;
  const daysLeft = Math.max(0, totalDays - daysPassed);

  const rows = useMemo(() => {
    const periodBal = calcBalances(filterByPeriod(journals, from, to), accounts);
    return accounts
      .filter((a) => a.type === 'expense' && budgets.some((b) => b.accountId === a.id))
      .map((a) => {
        const budget = Math.round(budgets.find((b) => b.accountId === a.id).amount * months);
        const actual = Math.max(0, accountBalance(a.id, accounts, periodBal));
        const pct = budget > 0 ? Math.min(120, (actual / budget) * 100) : 0;
        const remain = budget - actual;
        const over = actual > budget;
        const warn = pct > 80 && !over;
        return { account: a, budget, actual, pct, remain, over, warn };
      });
  }, [accounts, journals, budgets, from, to, months]);

  return (
    <div className="card mt-16">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span className="card-title" style={{ marginBottom: 0 }}>
          {useCurrentMonth ? '今月の予算' : `予算（${months === 1 ? '1ヶ月' : `${months}ヶ月分`}）`}
        </span>
        <button className="btn btn-g btn-s" onClick={() => setModalOpen(true)}>予算設定</button>
      </div>

      {rows.length === 0 ? (
        <p className="nd">予算未設定。「予算設定」から費目ごとの月間予算を設定できます。</p>
      ) : (
        <>
          <div style={{ fontSize: 10, color: 'var(--tx3)', marginBottom: 8 }}>
            {from.slice(5).replace('-', '/')}〜{to.slice(5).replace('-', '/')}
            {inProgress ? `${daysPassed}/${totalDays}日経過（残${daysLeft}日）` : `${totalDays}日間（終了）`}
            {months !== 1 && `　月次予算 ×${months}`}
          </div>
          {rows.map(({ account, budget, actual, pct, remain, over, warn }) => {
            const color = over ? 'var(--red)' : warn ? 'var(--ac)' : 'var(--grn)';
            const dailyRemain = daysLeft > 0 ? Math.round(remain / daysLeft) : 0;
            const statusText = over
              ? `超過 ${fa(Math.abs(remain))}`
              : daysLeft > 0 ? `残 ${fa(remain)}（日あたり${fa(dailyRemain)}）` : `残 ${fa(remain)}`;
            return (
              <div key={account.id}>
                <div className="budget-row">
                  <span className="budget-label">{account.name}</span>
                  <div className="budget-bar-w">
                    <div className="budget-bar" style={{ background: color, width: `${pct.toFixed(1)}%` }} />
                  </div>
                  <span className={`budget-vals${over ? ' budget-over' : ''}`}>
                    {fa(actual)} / {fa(budget)} ({Math.round(pct)}%)
                  </span>
                </div>
                <div style={{ fontSize: 10, color, textAlign: 'right', margin: '-4px 0 6px', paddingRight: 2 }}>
                  {statusText}
                </div>
              </div>
            );
          })}
        </>
      )}
      <BudgetModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
