import { useState, useEffect, useMemo, useCallback } from 'react';
import { useData } from '../../contexts/DataContext';
import { fa, uid, today, TAX_RATES } from '../../utils/format';
import { useToast } from '../Common/Toast';
import Modal from '../Common/Modal';
import InfoTip from '../Common/InfoTip';
import SplitModal from './SplitModal';

const emptyLine = (side = 'dr') => ({ id: uid(), accountId: '', side, amount: '', taxRate: 0, splits: [] });

// ポイント利用の目印（摘要に追記）＋編集時の検出に使用
const POINT_MARK = '（ポイント利用）';

export default function JournalModal({ open, onClose, editId, preset = null, defaultDate = null }) {
  const { accounts, tags, journals, addJournal, updateJournal } = useData();
  const toast = useToast();

  const [date, setDate] = useState(today());
  const [desc, setDesc] = useState('');
  const [lines, setLines] = useState([emptyLine('dr'), emptyLine('cr')]);
  const [splitLineId, setSplitLineId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [pointAmt, setPointAmt] = useState('');

  const sortedAccounts = useMemo(
    () => [...accounts].sort((a, b) => (a.code || '').localeCompare(b.code || '')),
    [accounts]
  );

  // ポイント利用分を計上する収益科目（雑収入を優先）
  const pointAccount = useMemo(
    () => accounts.find((a) => a.type === 'income' && a.name === '雑収入')
      || accounts.find((a) => a.type === 'income' && a.name.includes('ポイント'))
      || accounts.find((a) => a.type === 'income'),
    [accounts]
  );

  // 編集時: 既存データをロード
  useEffect(() => {
    if (!open) return;
    if (editId) {
      const j = journals.find((x) => x.id === editId);
      if (j) {
        setDate(j.date);
        setDesc(j.desc || '');
        const loaded = j.lines.map((l) => ({ ...l, id: uid(), amount: l.amount }));
        // ポイント振替（雑収入）行を検出 → フィールドへ戻し、出金行を使用額へ復元
        let pt = '';
        if ((j.desc || '').includes(POINT_MARK) && pointAccount) {
          const idx = loaded.findIndex((l) => l.side === 'cr' && l.accountId === pointAccount.id);
          if (idx >= 0) {
            const pval = loaded[idx].amount;
            pt = String(pval);
            loaded.splice(idx, 1);
            const payLines = loaded.filter((l) => l.side === 'cr');
            const target = payLines.sort((a, b) => b.amount - a.amount)[0];
            if (target) target.amount += pval; // 出金行に戻して「使用額」表示に復元
          }
        }
        setLines(loaded);
        setPointAmt(pt);
      }
    } else if (preset) {
      // プリセットから初期化（amount 0 = 都度入力 → 空欄）
      setDate(today());
      setDesc(preset.desc || '');
      setPointAmt('');
      setLines((preset.lines || []).map((l) => ({
        id: uid(),
        accountId: l.accountId,
        side: l.side,
        amount: l.amount ? l.amount : '',
        taxRate: 0,
        splits: l.tagId && l.amount ? [{ tagId: l.tagId, amount: l.amount }] : [],
      })));
    } else {
      setDate(defaultDate || today());
      setDesc('');
      setPointAmt('');
      setLines([emptyLine('dr'), emptyLine('cr')]);
    }
  }, [open, editId, preset, defaultDate, journals, pointAccount]);

  // 合計計算（ポイント分は記帳時に出金から差し引いて雑収入へ振替えるため、合計は使用額のまま）
  const pAmt = parseFloat(pointAmt) || 0;
  const drTotal = lines.filter((l) => l.side === 'dr').reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
  const crTotal = lines.filter((l) => l.side === 'cr').reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
  const mismatch = Math.abs(drTotal - crTotal) > 0.01 && (drTotal > 0 || crTotal > 0);

  const updateLine = useCallback((id, field, value) => {
    setLines((prev) => prev.map((l) => l.id === id ? { ...l, [field]: value } : l));
  }, []);

  const removeLine = useCallback((id) => {
    setLines((prev) => prev.filter((l) => l.id !== id));
  }, []);

  const addLine = useCallback(() => {
    setLines((prev) => [...prev, emptyLine('dr')]);
  }, []);

  const handleSave = async () => {
    if (saving) return; // 多重送信ガード（「記帳する」連打対策）
    if (!date) { toast('日付を入力してください'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { toast('日付は YYYY-MM-DD 形式で入力してください'); return; }
    let validLines = lines.filter((l) => l.accountId && parseFloat(l.amount) > 0).map((l) => ({
      accountId: l.accountId,
      side: l.side,
      amount: parseFloat(l.amount),
      taxRate: l.taxRate || 0,
      ...(l.splits?.length ? { splits: l.splits.filter((s) => s.tagId && s.amount > 0) } : {}),
    }));

    // ポイント分を「出金（貸方）から差し引き → 雑収入へ振替」。合計（使用額）は変えない。
    let finalDesc = desc;
    if (pAmt > 0) {
      if (!pointAccount) { toast('「雑収入」などの収益科目がありません。勘定科目・口座で追加してください'); return; }
      const payLines = validLines.filter((l) => l.side === 'cr' && l.accountId !== pointAccount.id);
      const target = payLines.sort((a, b) => b.amount - a.amount)[0];
      if (!target) { toast('ポイントを差し引く貸方（出金）の行がありません'); return; }
      if (pAmt > target.amount) { toast('ポイント額が出金額を超えています'); return; }
      target.amount -= pAmt;
      validLines.push({ accountId: pointAccount.id, side: 'cr', amount: pAmt, taxRate: 0 });
      validLines = validLines.filter((l) => l.amount > 0); // 全額ポイント等で0になった出金行は除去
      if (!finalDesc.includes(POINT_MARK)) finalDesc = finalDesc ? `${finalDesc} ${POINT_MARK}` : POINT_MARK;
    } else if (finalDesc.includes(POINT_MARK)) {
      finalDesc = finalDesc.replace(POINT_MARK, '').replace(/\s+$/, '');
    }

    if (validLines.length < 2) { toast('借方・貸方を最低1行ずつ入力してください'); return; }
    if (!validLines.some((l) => l.side === 'dr') || !validLines.some((l) => l.side === 'cr')) {
      toast('借方・貸方の両方が必要です'); return;
    }
    const d = validLines.filter((l) => l.side === 'dr').reduce((s, l) => s + l.amount, 0);
    const c = validLines.filter((l) => l.side === 'cr').reduce((s, l) => s + l.amount, 0);
    if (Math.abs(d - c) > 0.01) { toast(`借方(${fa(d)})と貸方(${fa(c)})が不一致`); return; }

    setSaving(true);
    try {
      if (editId) {
        await updateJournal(editId, { date, desc: finalDesc, lines: validLines });
        toast('更新しました');
      } else {
        await addJournal({ date, desc: finalDesc, lines: validLines });
        toast('記帳しました');
      }
      onClose();
    } catch (err) {
      toast('保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editId ? '仕訳編集' : '仕訳入力'}
      footer={
        <>
          <button className="btn btn-g" onClick={onClose} disabled={saving}>キャンセル</button>
          <button className="btn btn-p" onClick={handleSave} disabled={saving}>
            {saving ? '保存中…' : editId ? '更新する' : '記帳する'}
          </button>
        </>
      }
    >
      <div className="form-row mb-10">
        <div className="fg">
          <label className="fl">日付</label>
          <input type="date" className="fc" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="fg">
          <label className="fl">摘要</label>
          <input type="text" className="fc" placeholder="取引の内容" maxLength={100} value={desc} onChange={(e) => setDesc(e.target.value)} />
          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: 'var(--tx3)' }}>🏷 ポイント利用</span>
            <input type="number" className="fc" min="0" step="1" placeholder="0"
              value={pointAmt} onChange={(e) => setPointAmt(e.target.value)}
              style={{ width: 90, padding: '4px 8px', fontSize: 12 }} />
            <span style={{ fontSize: 11, color: 'var(--tx3)' }}>円</span>
            <InfoTip text="金額は使用額（定価）のまま入力してください。ポイント欄に使った分を入れると、記帳時にその額を出金（貸方）から差し引き、同額を『雑収入』へ振り替えます（合計は変わりません）。例: 食費3,000をカードで購入しポイント500利用 → 借方 食費3,000 ／ 貸方 カード2,500・雑収入500。" />
            {pAmt > 0 && pointAccount && (
              <span style={{ fontSize: 11, color: 'var(--ac)' }}>→ 出金から{fa(pAmt)}を差し引き、{pointAccount.name}へ振替</span>
            )}
            {pAmt > 0 && !pointAccount && (
              <span style={{ fontSize: 11, color: 'var(--red)' }}>収益科目（雑収入）が必要です</span>
            )}
          </div>
        </div>
      </div>

      <div className="je-hdr">
        <span>勘定科目</span>
        <span>借方/貸方<InfoTip text="借方(かりかた)は左側＝お金の使い道や増えた財産、貸方(かしかた)は右側＝お金の出どころ。例: 現金で食費を払う→借方:食費／貸方:現金。" /></span>
        <span>金額</span><span>税率</span><span>タグ</span><span />
      </div>

      {lines.map((line) => (
        <div key={line.id} className="je-line">
          <select className="fc" value={line.accountId} onChange={(e) => updateLine(line.id, 'accountId', e.target.value)}>
            <option value="">— 選択 —</option>
            {sortedAccounts.map((a) => (
              <option key={a.id} value={a.id}>{a.code ? `${a.code} ` : ''}{a.name}</option>
            ))}
          </select>
          <select className="fc" value={line.side} onChange={(e) => updateLine(line.id, 'side', e.target.value)}>
            <option value="dr">借方</option>
            <option value="cr">貸方</option>
          </select>
          <input className="fc" type="number" placeholder="金額" min="0" step="1"
            value={line.amount} onChange={(e) => updateLine(line.id, 'amount', e.target.value)} />
          <select className="fc" value={line.taxRate || 0} onChange={(e) => updateLine(line.id, 'taxRate', parseInt(e.target.value))}>
            {TAX_RATES.map((r) => <option key={r} value={r}>{r === 0 ? '無' : `${r}%`}</option>)}
          </select>
          <button
            className={`je-tag-btn ${line.splits?.length ? 'has' : ''}`}
            onClick={() => setSplitLineId(line.id)}
          >
            {line.splits?.length ? `🏷${line.splits.length}` : '🏷'}
          </button>
          <button className="btn btn-d btn-s" onClick={() => removeLine(line.id)} style={{ padding: '5px 7px' }}>✕</button>
        </div>
      ))}

      <button className="btn btn-g btn-s mt-6" onClick={addLine}>＋ 行追加</button>

      <div className="je-tot mt-6">
        <div className="je-tot-i">
          <span>借方</span>
          <span className="dr-c" style={mismatch ? { color: 'var(--red)' } : undefined}>{fa(drTotal)}</span>
        </div>
        <div className="je-tot-i">
          <span>貸方</span>
          <span className="cr-c" style={mismatch ? { color: 'var(--red)' } : undefined}>{fa(crTotal)}</span>
        </div>
      </div>
      {pAmt > 0 && (
        <div style={{ fontSize: 10, color: 'var(--tx3)', textAlign: 'right', marginTop: 2 }}>
          記帳時に出金から{fa(pAmt)}を差し引き、{pointAccount ? pointAccount.name : '雑収入'}へ振替えます
        </div>
      )}

      <SplitModal
        open={splitLineId !== null}
        onClose={() => setSplitLineId(null)}
        line={lines.find((l) => l.id === splitLineId)}
        onApply={(splits) => updateLine(splitLineId, 'splits', splits)}
      />
    </Modal>
  );
}
