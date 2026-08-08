import { useState, useEffect, useMemo } from 'react';
import { useData } from '../../contexts/DataContext';
import { fa } from '../../utils/format';
import Modal from '../Common/Modal';

// 仕訳行のタグ分割（kakeibo.html の openSplitM/saveSplits を踏襲）
// ratioHint: プリセット編集から開いたとき。金額が都度入力(0)なら、入れた数字は比率として扱う。
export default function SplitModal({ open, onClose, line, onApply, ratioHint = false }) {
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
  // 金額が決まっていない（都度入力の）プリセットでは「残り」に意味が無い
  const ratioMode = ratioHint && lineAmount === 0;

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

      <div style={{ fontSize: 13, color: 'var(--tx2)', marginBottom: ratioMode ? 6 : 12 }}>
        {acctName}{ratioMode ? ' — 金額は記帳時に入力' : <> — <span className="mono">{fa(lineAmount)}</span></>}
      </div>
      {ratioMode && (
        <div style={{ fontSize: 11.5, color: 'var(--tx3)', lineHeight: 1.75, marginBottom: 12 }}>
          このプリセットは金額を都度入力するため、ここに入れた数字は<strong style={{ color: 'var(--tx2)' }}>比率</strong>として扱われます
          （例：<span className="mono">70</span> と <span className="mono">30</span> なら 7:3 で分けます）。
        </div>
      )}

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
        {!ratioMode && (
          <span style={{ fontSize: 12 }}>残り <span className="mono" style={{ color: Math.abs(rem) < 0.01 ? 'var(--grn)' : 'var(--red)' }}>{fa(rem)}</span></span>
        )}
      </div>
    </Modal>
  );
}
