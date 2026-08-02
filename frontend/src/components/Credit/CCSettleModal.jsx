import { useState, useMemo, useEffect } from 'react';
import { useData } from '../../contexts/DataContext';
import { useToast } from '../Common/Toast';
import Modal from '../Common/Modal';
import { fa } from '../../utils/format';
import { pendingCC, postCCSettlements } from '../../utils/autoGen';

const md = (s) => { const p = s.split('-'); return `${+p[1]}/${+p[2]}`; };

// クレカ返済の確認＆記帳モーダル。締め済み・未引落のサイクルを一覧し、チェックで選択して記帳する。
// 引落前のサイクルも選択すれば「予定」として先に記帳できる（引落日到来分は初期選択）。
// cardId を渡すと、そのカードの分だけに絞り込む（クレジット画面のカード別ボタンから利用）。
export default function CCSettleModal({ open, onClose, cardId }) {
  const { accounts, journals, addJournal } = useData();
  const toast = useToast();
  const items = useMemo(() => {
    if (!open) return [];
    const all = pendingCC(accounts, journals);
    return cardId ? all.filter((x) => x.card.id === cardId) : all;
  }, [open, accounts, journals, cardId]);
  const [sel, setSel] = useState(() => new Set());
  const [busy, setBusy] = useState(false);

  // 開くたびに引落日到来済み(due)を初期選択
  useEffect(() => {
    if (open) setSel(new Set(items.filter((x) => x.due).map((x) => x.key)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const allKeys = items.map((x) => x.key);
  const allSel = items.length > 0 && allKeys.every((k) => sel.has(k));
  const toggle = (key) => setSel((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const toggleAll = () => setSel((s) => {
    const n = new Set(s);
    if (items.length > 0 && allKeys.every((k) => n.has(k))) allKeys.forEach((k) => n.delete(k));
    else allKeys.forEach((k) => n.add(k));
    return n;
  });

  const selected = items.filter((x) => sel.has(x.key));
  const confirm = async () => {
    if (busy || selected.length === 0) return;
    setBusy(true);
    try {
      const n = await postCCSettlements(selected, addJournal);
      toast(`${n}件のクレカ返済を記帳しました`);
      onClose();
    } catch { toast('記帳に失敗しました'); } finally { setBusy(false); }
  };

  const cardName = cardId ? accounts.find((a) => a.id === cardId)?.name : null;

  return (
    <Modal open={open} onClose={onClose} title={cardName ? `${cardName} の返済を記帳` : 'クレカ返済を記帳'} wide
      footer={
        <>
          <button className="btn btn-g" onClick={onClose} disabled={busy}>キャンセル</button>
          <button className="btn btn-p" onClick={confirm} disabled={busy || selected.length === 0}>
            {busy ? '記帳中…' : `選択した${selected.length}件を記帳`}
          </button>
        </>
      }>
      {items.length === 0 ? (
        <p className="nd" style={{ textAlign: 'center', padding: '20px 0' }}>未引落の返済対象はありません。</p>
      ) : (
        <>
          <p style={{ fontSize: 12, color: 'var(--tx3)', marginBottom: 10 }}>
            締め済みで未引落のサイクルです。<strong>「引落前（予定）」も選択すれば、引落日を待たずに先に記帳</strong>できます（引落日到来分は初期選択済み・「クレカ→引落口座」で記帳）。
          </p>
          <div className="tw">
            <table>
              <thead><tr>
                <th style={{ width: 28 }}><input type="checkbox" checked={allSel} onChange={toggleAll} aria-label="全選択" /></th>
                {!cardId && <th>カード</th>}
                <th>利用期間</th><th className="text-r">利用額</th><th>引落予定日</th><th>区分</th>
              </tr></thead>
              <tbody>
                {items.map((x) => (
                  <tr key={x.key} onClick={() => toggle(x.key)} style={{ cursor: 'pointer', ...(sel.has(x.key) ? { background: 'var(--acb)' } : {}) }}>
                    <td style={{ textAlign: 'center' }}><input type="checkbox" checked={sel.has(x.key)} readOnly aria-label="選択" /></td>
                    {!cardId && <td>{x.card.name}</td>}
                    <td>{md(x.cycle.periodStart)}〜{md(x.cycle.periodEnd)}</td>
                    <td className="text-r mono">{fa(x.cycle.usage)}</td>
                    <td className="text-m" style={{ whiteSpace: 'nowrap' }}>{x.cycle.settleDate}</td>
                    <td style={{ fontSize: 11, whiteSpace: 'nowrap', color: x.due ? 'var(--grn)' : 'var(--tx3)' }}>
                      {x.due ? '引落日到来' : '引落前（予定）'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Modal>
  );
}
