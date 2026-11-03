import { useState } from 'react';
import { useData } from '../../contexts/DataContext';
import { useUI } from '../../contexts/UIContext';
import { isCreditCard } from '../../utils/creditCard';
import BudgetModal from '../Settings/BudgetModal';

// 基本設定の入口。科目・カード・口座・タグ・予算の件数を並べ、押すとそれぞれの設定へ行く（モバイルのホームと同じ）
export default function SetupPanel() {
  const { accounts, wallets, tags, budgets } = useData();
  const { navigate } = useUI();
  const [budgetOpen, setBudgetOpen] = useState(false);

  const rows = [
    { label: '勘定科目', n: accounts.filter((a) => !a.hidden).length, go: () => navigate('accounts') },
    { label: 'カード', n: accounts.filter((a) => isCreditCard(a) && !a.hidden).length, go: () => navigate('credit') },
    { label: '口座', n: wallets.filter((w) => accounts.find((a) => a.id === w.accountId)?.type !== 'liability').length, go: () => navigate('accounts') },
    { label: 'タグ', n: tags.length, go: () => navigate('tags') },
    { label: '予算', n: budgets.length, go: () => setBudgetOpen(true) },
  ];

  return (
    <div className="card mt-16">
      <div className="card-title">基本設定</div>
      {rows.map((x, i) => (
        <button key={x.label} type="button" onClick={x.go}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 2px',
            background: 'none', border: 'none', borderBottom: i < rows.length - 1 ? '1px solid var(--bd)' : 'none',
            color: 'var(--tx)', fontSize: 14, cursor: 'pointer', textAlign: 'left',
          }}>
          <span style={{ flex: 1 }}>{x.label}</span>
          <span style={{ color: x.n ? 'var(--tx2)' : 'var(--tx3)', fontSize: 13 }}>{x.n ? `${x.n} 件` : '未設定'}</span>
          <span aria-hidden="true" style={{ color: 'var(--tx3)' }}>›</span>
        </button>
      ))}
      <BudgetModal open={budgetOpen} onClose={() => setBudgetOpen(false)} />
    </div>
  );
}
