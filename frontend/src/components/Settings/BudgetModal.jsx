import { useState, useEffect, useMemo } from 'react';
import { useData } from '../../contexts/DataContext';
import { useToast } from '../Common/Toast';
import Modal from '../Common/Modal';

export default function BudgetModal({ open, onClose }) {
  const { accounts, budgets, saveBudgets } = useData();
  const toast = useToast();

  const expenseAccts = useMemo(
    () => accounts.filter((a) => a.type === 'expense').sort((a, b) => (a.code || '').localeCompare(b.code || '')),
    [accounts]
  );

  const [values, setValues] = useState({});

  useEffect(() => {
    if (!open) return;
    const v = {};
    expenseAccts.forEach((a) => {
      const b = budgets.find((x) => x.accountId === a.id);
      v[a.id] = b ? String(b.amount) : '';
    });
    setValues(v);
  }, [open, budgets, expenseAccts]);

  const handleSave = async () => {
    const newBudgets = Object.entries(values)
      .filter(([, v]) => parseFloat(v) > 0)
      .map(([accountId, v]) => ({ accountId, amount: parseFloat(v) }));
    // 実際に入力を変えた科目だけを控えておく。他端末が先に保存していたときは、
    // 最新の予算にこの科目だけを載せ直す（触っていない科目は相手の値を残す）。
    const changed = {};
    Object.entries(values).forEach(([accountId, v]) => {
      const before = budgets.find((b) => b.accountId === accountId);
      const after = parseFloat(v) > 0 ? parseFloat(v) : 0;
      if ((before ? before.amount : 0) !== after) changed[accountId] = after;
    });
    try {
      await saveBudgets(newBudgets, { op: 'budgets', changed });
      toast('予算を保存しました');
      onClose();
    } catch { toast('保存に失敗しました'); }
  };

  return (
    <Modal open={open} onClose={onClose} title="月間予算設定"
      footer={<><button className="btn btn-g" onClick={onClose}>キャンセル</button><button className="btn btn-p" onClick={handleSave}>保存</button></>}>

      <div style={{ fontSize: 12, color: 'var(--tx3)', marginBottom: 12 }}>費用科目ごとに月間予算を設定（0=予算なし）</div>
      {expenseAccts.map((a) => (
        <div key={a.id} style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 8, alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: 13 }}>{a.name}</span>
          <input className="fc" type="number" min="0" step="1000" placeholder="0"
            value={values[a.id] || ''} onChange={(e) => setValues((v) => ({ ...v, [a.id]: e.target.value }))}
            style={{ padding: '6px 8px', fontSize: 12 }} />
        </div>
      ))}
    </Modal>
  );
}
