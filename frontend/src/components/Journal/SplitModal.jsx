import { useState, useEffect, useMemo } from 'react';
import { useData } from '../../contexts/DataContext';
import { fa } from '../../utils/format';
import Modal from '../Common/Modal';

// 仕訳行のタグ分割（kakeibo.html の openSplitM/saveSplits を踏襲）
export default function SplitModal({ open, onClose, line, onApply }) {
  const { accounts, tags } = useData();
  const [splits, setSplits] = useState([]);

  const lineAmount = parseFloat(line?.amount) || 0;
  const acctName = useMemo(
    () => accounts.find((a) => a.id === line?.accountId)?.name || '(未選択)',
    [accounts, line]
  );

  useEffect(() => {
    if (!open) return;
    const existing = line?.splits?.length ? line.splits.map((s) => ({ ...s })) : [{ tagId: '', amount: 0 }];
    setSplits(existing);
  }, [open, line]);

  const sum = splits.reduce((s, x) => s + (parseFloat(x.amount) || 0), 0);
  const rem = lineAmount - sum;

  const updateSplit = (i, field, value) => {
    setSplits((prev) => prev.map((s, idx) => idx === i
      ? { ...s, [field]: field === 'amount' ? (parseFloat(value) || 0) : value }
      : s));
  };

  const addSplit = () => setSplits((prev) => [...prev, { tagId: '', amount: 0 }]);

  const removeSplit = (i) => {
    setSplits((prev) => {
      const next = prev.filter((_, idx) => idx !== i);
      return next.length ? next : [{ tagId: '', amount: 0 }];
    });
  };

  const handleApply = () => {
    onApply(splits.filter((s) => s.amount > 0 && s.tagId));
    onClose();
  };

  const handleClear = () => {
    onApply([]);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="タグ分割"
      footer={<>
        <button className="btn btn-g" onClick={onClose}>キャンセル</button>
        <button className="btn btn-g" onClick={handleClear}>クリア</button>
        <button className="btn btn-p" onClick={handleApply}>適用</button>
      </>}>

      <div style={{ fontSize: 13, color: 'var(--tx2)', marginBottom: 12 }}>
        {acctName} — <span className="mono">{fa(lineAmount)}</span>
      </div>

      <div id="sp-lines">
        {splits.map((s, i) => (
          <div key={i} className="split-line">
            <select className="fc" value={s.tagId} onChange={(e) => updateSplit(i, 'tagId', e.target.value)}>
              <option value="">— タグ —</option>
              {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <input className="fc" type="number" min="0" step="1" placeholder="金額"
              value={s.amount || ''} onChange={(e) => updateSplit(i, 'amount', e.target.value)} />
            <button className="btn btn-d btn-s" onClick={() => removeSplit(i)} style={{ padding: '5px 7px' }}>✕</button>
          </div>
        ))}
      </div>

      <button className="btn btn-g btn-s mt-6" onClick={addSplit}>＋ タグ追加</button>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 16, marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--bd)' }}>
        <span style={{ fontSize: 12, color: 'var(--tx3)' }}>合計 <span className="mono">{fa(sum)}</span></span>
        <span style={{ fontSize: 12 }}>残り <span className="mono" style={{ color: Math.abs(rem) < 0.01 ? 'var(--grn)' : 'var(--red)' }}>{fa(rem)}</span></span>
      </div>
    </Modal>
  );
}
