import { useState, useEffect, useMemo } from 'react';
import { useData } from '../../contexts/DataContext';
import { ACCOUNT_TYPES } from '../../utils/format';
import { useToast } from '../Common/Toast';
import Modal from '../Common/Modal';

export default function AccountModal({ open, onClose, editId, defaultType, prefill }) {
  const { accounts, addAccount, updateAccount } = useData();
  const toast = useToast();

  const [name, setName] = useState('');
  const [type, setType] = useState('asset');
  const [code, setCode] = useState('');
  const [note, setNote] = useState('');
  const [ccClose, setCcClose] = useState('');
  const [ccDay, setCcDay] = useState('');
  const [ccDelay, setCcDelay] = useState('1');
  const [ccFrom, setCcFrom] = useState('');

  const assetAccounts = useMemo(() => accounts.filter((a) => a.type === 'asset'), [accounts]);

  useEffect(() => {
    if (!open) return;
    if (editId) {
      const a = accounts.find((x) => x.id === editId);
      if (a) {
        setName(a.name); setType(a.type); setCode(a.code || ''); setNote(a.note || '');
        setCcClose(a.ccClose || ''); setCcDay(a.ccDay || ''); setCcDelay(String(a.ccDelay || 1)); setCcFrom(a.ccFrom || '');
      }
    } else {
      // テンプレから開いた場合は内容をプリフィル（編集して保存できる）
      setName(prefill?.name || ''); setType(prefill?.type || defaultType || 'asset'); setCode(prefill?.code || ''); setNote('');
      setCcClose(''); setCcDay(''); setCcDelay('1'); setCcFrom('');
    }
  }, [open, editId, accounts, defaultType, prefill]);

  const handleSave = async () => {
    if (!name.trim()) { toast('科目名を入力してください'); return; }
    const data = { name: name.trim(), type, code: code.trim(), note: note.trim() };
    if (type === 'liability') {
      data.ccClose = parseInt(ccClose) || 0;
      data.ccDay = parseInt(ccDay) || 0;
      data.ccDelay = parseInt(ccDelay) || 1;
      data.ccFrom = ccFrom || '';
    }
    try {
      if (editId) { await updateAccount(editId, data); }
      else { await addAccount(data); }
      toast('保存しました');
      onClose();
    } catch { toast('保存に失敗しました'); }
  };

  return (
    <Modal open={open} onClose={onClose} title={editId ? '科目編集' : '科目追加'}
      footer={<><button className="btn btn-g" onClick={onClose}>キャンセル</button><button className="btn btn-p" onClick={handleSave}>保存</button></>}>

      <div style={{ display: 'grid', gap: 10 }}>
        <div className="fg"><label className="fl">科目名</label><input type="text" className="fc" maxLength={50} value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="fg"><label className="fl">区分</label>
          <select className="fc" value={type} onChange={(e) => setType(e.target.value)}>
            {Object.entries(ACCOUNT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="fg"><label className="fl">コード</label><input type="text" className="fc" placeholder="1001" maxLength={20} value={code} onChange={(e) => setCode(e.target.value)} /></div>
        <div className="fg"><label className="fl">備考</label><input type="text" className="fc" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} /></div>
      </div>

      {type === 'liability' && (
        <div style={{ marginTop: 14, padding: 12, border: '1px solid var(--bd)', borderRadius: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--ac)', marginBottom: 10 }}>CC設定</div>
          <div className="form-row">
            <div className="fg"><label className="fl">締め日（毎月）</label><input type="number" className="fc" min="1" max="31" placeholder="15" value={ccClose} onChange={(e) => setCcClose(e.target.value)} /></div>
            <div className="fg"><label className="fl">引落日（毎月）</label><input type="number" className="fc" min="1" max="31" placeholder="27" value={ccDay} onChange={(e) => setCcDay(e.target.value)} /></div>
          </div>
          <div className="form-row mt-6">
            <div className="fg"><label className="fl">引落月ずれ</label>
              <select className="fc" value={ccDelay} onChange={(e) => setCcDelay(e.target.value)}>
                <option value="1">翌月</option><option value="2">翌々月</option>
              </select>
            </div>
            <div className="fg"><label className="fl">引落口座</label>
              <select className="fc" value={ccFrom} onChange={(e) => setCcFrom(e.target.value)}>
                <option value="">— 選択 —</option>
                {assetAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
