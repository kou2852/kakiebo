import { useState, useEffect, useMemo } from 'react';
import { useData } from '../../contexts/DataContext';
import { uid } from '../../utils/format';
import { useToast } from '../Common/Toast';
import Modal from '../Common/Modal';

const emptyLine = (side = 'dr') => ({ accountId: '', side, amount: 0, tagId: '' });

// プリセット編集（kakeibo.html の openPE/savePE を踏襲）
export default function PresetModal({ open, onClose, editId, walletId, type }) {
  const { accounts, tags, wallets, presets, savePresets } = useData();
  const toast = useToast();

  const [wlt, setWlt] = useState('');
  const [ptype, setPtype] = useState('out');
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [lines, setLines] = useState([emptyLine('dr'), emptyLine('cr')]);

  const sortedAccounts = useMemo(
    () => [...accounts].sort((a, b) => (a.code || '').localeCompare(b.code || '')),
    [accounts]
  );

  useEffect(() => {
    if (!open) return;
    if (editId) {
      const p = presets.find((x) => x.id === editId);
      if (p) {
        setWlt(p.walletId); setPtype(p.type); setName(p.name); setDesc(p.desc || '');
        setLines((p.lines?.length ? p.lines : [emptyLine('dr'), emptyLine('cr')]).map((l) => ({ ...l })));
      }
    } else {
      setWlt(walletId || wallets[0]?.id || '');
      setPtype(type || 'out');
      setName(''); setDesc('');
      setLines([emptyLine('dr'), emptyLine('cr')]);
    }
  }, [open, editId, presets, wallets, walletId, type]);

  const updateLine = (i, field, value) => {
    setLines((prev) => prev.map((l, idx) => idx === i
      ? { ...l, [field]: field === 'amount' ? (parseFloat(value) || 0) : value }
      : l));
  };

  const addLine = () => setLines((prev) => [...prev, emptyLine('dr')]);

  const removeLine = (i) => {
    setLines((prev) => {
      const next = prev.filter((_, idx) => idx !== i);
      return next.length ? next : [emptyLine('dr')];
    });
  };

  const handleSave = () => {
    if (!name.trim()) { toast('名前を入力してください'); return; }
    const validLines = lines.filter((l) => l.accountId).map((l) => ({
      accountId: l.accountId, side: l.side, amount: l.amount || 0, tagId: l.tagId || '',
    }));
    if (validLines.length < 1) { toast('少なくとも1行入力してください'); return; }
    const data = { walletId: wlt, type: ptype, name: name.trim(), desc: desc.trim(), lines: validLines };
    if (editId) {
      savePresets(presets.map((p) => p.id === editId ? { ...p, ...data } : p));
    } else {
      savePresets([...presets, { id: uid(), ...data }]);
    }
    toast('保存しました');
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={editId ? 'プリセット編集' : 'プリセット追加'}
      footer={<><button className="btn btn-g" onClick={onClose}>キャンセル</button><button className="btn btn-p" onClick={handleSave}>保存</button></>}>

      <div style={{ display: 'grid', gap: 10, marginBottom: 14 }}>
        <div className="form-row">
          <div className="fg"><label className="fl">口座</label>
            <select className="fc" value={wlt} onChange={(e) => setWlt(e.target.value)}>
              {wallets.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div className="fg"><label className="fl">種別</label>
            <select className="fc" value={ptype} onChange={(e) => setPtype(e.target.value)}>
              <option value="out">出金</option><option value="in">入金</option>
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="fg"><label className="fl">プリセット名</label>
            <input type="text" className="fc" placeholder="例：給料入金" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="fg"><label className="fl">摘要テンプレート</label>
            <input type="text" className="fc" placeholder="例：給料" value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="je-hdr" style={{ gridTemplateColumns: '2fr 100px 100px 110px 36px' }}>
        <span>勘定科目</span><span>借方/貸方</span><span>金額(0=都度)</span><span>タグ</span><span />
      </div>

      {lines.map((l, i) => (
        <div key={i} className="pe-line">
          <select className="fc" value={l.accountId} onChange={(e) => updateLine(i, 'accountId', e.target.value)}>
            <option value="">— 選択 —</option>
            {sortedAccounts.map((a) => <option key={a.id} value={a.id}>{a.code ? `${a.code} ` : ''}{a.name}</option>)}
          </select>
          <select className="fc" value={l.side} onChange={(e) => updateLine(i, 'side', e.target.value)}>
            <option value="dr">借方</option><option value="cr">貸方</option>
          </select>
          <input className="fc" type="number" min="0" step="1" placeholder="0"
            value={l.amount || ''} onChange={(e) => updateLine(i, 'amount', e.target.value)} />
          <select className="fc" value={l.tagId} onChange={(e) => updateLine(i, 'tagId', e.target.value)}>
            <option value="">(なし)</option>
            {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <button className="btn btn-d btn-s" onClick={() => removeLine(i)} style={{ padding: '5px 7px' }}>✕</button>
        </div>
      ))}

      <button className="btn btn-g btn-s mt-6" onClick={addLine}>＋ 行追加</button>
    </Modal>
  );
}
