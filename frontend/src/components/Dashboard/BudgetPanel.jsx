import { useState, useMemo } from 'react';
import { useData } from '../../contexts/DataContext';
import { fa } from '../../utils/format';
import { calcBalances, accountBalance, filterByPeriod } from '../../utils/bookkeeping';
import BudgetModal from '../Settings/BudgetModal';

// 今月の予算進捗（kakeibo.html の rDashBudget を移植）。予算は月次なので期間選択に依らず当月で表示する。
export default function BudgetPanel() {
  const { accounts, journals, budgets } = useData();
  const [modalOpen, setModalOpen] = useState(false);

  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysPassed = now.getDate();
  const daysLeft = daysInMonth - daysPassed;

  const rows = useMemo(() => {
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const start = `${now.getFullYear()}-${mm}-01`;
    const end = `${now.getFullYear()}-${mm}-${String(daysInMonth).padStart(2, '0')}`;
    const monthBal = calcBalances(filterByPeriod(journals, start, end), accounts);

    return accounts
      .filter((a) => a.type === 'expense' && budgets.some((b) => b.accountId === a.id))
      .map((a) => {
        const budget = budgets.find((b) => b.accountId === a.id).amount;
        const actual = Math.max(0, accountBalance(a.id, accounts, monthBal));
        const pct = budget > 0 ? Math.min(120, (actual / budget) * 100) : 0;
        const remain = budget - actual;
        const over = actual > budget;
        const warn = pct > 80 && !over;
        return { account: a, budget, actual, pct, remain, over, warn };
      });
  }, [accounts, journals, budgets]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="card mt-16">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span className="card-title" style={{ marginBottom: 0 }}>今月の予算</span>
        <button className="btn btn-g btn-s" onClick={() => setModalOpen(true)}>予算設定</button>
      </div>

      {rows.length === 0 ? (
        <p className="nd">予算未設定。「予算設定」から費目ごとの月間予算を設定できます。</p>
      ) : (
        <>
          <div style={{ fontSize: 10, color: 'var(--tx3)', marginBottom: 8 }}>
            今月 {daysPassed}/{daysInMonth}日経過（残{daysLeft}日）
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
