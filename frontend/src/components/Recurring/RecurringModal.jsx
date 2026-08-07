import { useState, useEffect, useMemo } from 'react';
import { useData } from '../../contexts/DataContext';
import { uid, today, ymd } from '../../utils/format';
import { useToast } from '../Common/Toast';
import Modal from '../Common/Modal';

const emptyLine = () => ({ accountId: '', side: 'dr', amount: '', tagId: '' });

export default function RecurringModal({ open, onClose, editId }) {
  const { accounts, tags, recurring, saveRecurring } = useData();
  const toast = useToast();

  const [name, setName] = useState('');
  const [frequency, setFrequency] = useState('monthly');
  const [day, setDay] = useState('');
  const [desc, setDesc] = useState('');
  const [lines, setLines] = useState([emptyLine(), emptyLine()]);

  const sortedAccounts = useMemo(
    () => [...accounts].sort((a, b) => (a.code || '').localeCompare(b.code || '')),
    [accounts]
  );

  useEffect(() => {
    if (!open) return;
    if (editId) {
      const r = recurring.find((x) => x.id === editId);
      if (r) {
        setName(r.name); setFrequency(r.frequency); setDay(String(r.day)); setDesc(r.desc || '');
        setLines(r.lines.map((l) => ({ ...l })));
      }
    } else {
      setName(''); setFrequency('monthly'); setDay(''); setDesc('');
      setLines([emptyLine(), emptyLine()]);
    }
  }, [open, editId, recurring]);

  const updateLine = (i, field, value) => {
    setLines((prev) => prev.map((l, idx) => idx === i ? { ...l, [field]: value } : l));
  };

  const handleSave = async () => {
    if (!name.trim()) { toast('名前を入力してください'); return; }
    const validLines = lines.filter((l) => l.accountId && parseFloat(l.amount) > 0).map((l) => ({
      accountId: l.accountId, side: l.side, amount: parseFloat(l.amount), tagId: l.tagId || '',
    }));
    if (validLines.length < 2) { toast('少なくとも2行必要です'); return; }

    const dayNum = parseInt(day) || 1;
    const now = new Date();
    let nextDate;
    if (frequency === 'monthly') {
      const nd = new Date(now.getFullYear(), now.getMonth(), dayNum);
      if (nd <= now) nd.setMonth(nd.getMonth() + 1);
      nextDate = ymd(nd);
    } else if (frequency === 'yearly') {
      const nd = new Date(now.getFullYear(), dayNum - 1, 1);
      if (nd <= now) nd.setFullYear(nd.getFullYear() + 1);
      nextDate = ymd(nd);
    } else {
      nextDate = today();
    }

    const data = { name: name.trim(), frequency, day: dayNum, lines: validLines, desc: desc.trim(), nextDate };

    // 第2引数は「何をしたか」。他端末が先に保存していたとき、入力値を捨てずに載せ直すために使う。
    const item = { id: editId || uid(), ...data };
    const next = editId
      ? recurring.map((r) => (r.id === editId ? { ...r, ...data } : r))
      : [...recurring, item];
    try {
      await saveRecurring(next, { op: 'upsert', item });
      toast('保存しました');
      onClose();
    } catch { toast('保存に失敗しました'); }
  };

  const tagOpts = [{ id: '', name: '(なし)' }, ...tags];

  return (
    <Modal open={open} onClose={onClose} title={editId ? '定期取引編集' : '定期取引追加'}
      footer={<><button className="btn btn-g" onClick={onClose}>キャンセル</button><button className="btn btn-p" onClick={handleSave}>保存</button></>}>

      <div style={{ display: 'grid', gap: 10, marginBottom: 14 }}>
        <div className="fg"><label className="fl">名前</label><input type="text" className="fc" placeholder="例：家賃支払い" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="form-row">
          <div className="fg"><label className="fl">頻度</label>
            <select className="fc" value={frequency} onChange={(e) => setFrequency(e.target.value)}>
              <option value="monthly">毎月</option><option value="weekly">毎週</option><option value="yearly">毎年</option>
            </select>
          </div>
          <div className="fg"><label className="fl">実行日</label><input type="number" className="fc" min="1" max="31" placeholder="27" value={day} onChange={(e) => setDay(e.target.value)} /></div>
        </div>
        <div className="fg"><label className="fl">摘要</label><input type="text" className="fc" placeholder="摘要テンプレート" value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
      </div>

      <div className="je-hdr"><span>勘定科目</span><span>借方/貸方</span><span>金額</span><span>タグ</span><span /></div>
      {lines.map((l, i) => (
        <div key={i} className="rec-line">
          <select className="fc" value={l.accountId} onChange={(e) => updateLine(i, 'accountId', e.target.value)}>
            <option value="">— 選択 —</option>
            {sortedAccounts.map((a) => <option key={a.id} value={a.id}>{a.code ? `${a.code} ` : ''}{a.name}</option>)}
          </select>
          <select className="fc" value={l.side} onChange={(e) => updateLine(i, 'side', e.target.value)}>
            <option value="dr">借方</option><option value="cr">貸方</option>
          </select>
          <input className="fc" type="number" min="0" step="1" value={l.amount} onChange={(e) => updateLine(i, 'amount', e.target.value)} />
          <select className="fc" value={l.tagId || ''} onChange={(e) => updateLine(i, 'tagId', e.target.value)}>
            {tagOpts.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <button className="btn btn-d btn-s" onClick={() => setLines((p) => p.filter((_, j) => j !== i))} style={{ padding: '5px 7px' }}>✕</button>
        </div>
      ))}
      <button className="btn btn-g btn-s mt-6" onClick={() => setLines((p) => [...p, emptyLine()])}>＋ 行追加</button>
    </Modal>
  );
}
