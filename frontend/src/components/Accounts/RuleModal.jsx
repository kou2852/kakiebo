import { useState, useEffect, useMemo } from 'react';
import { useData } from '../../contexts/DataContext';
import { uid } from '../../utils/format';
import { useToast } from '../Common/Toast';
import Modal from '../Common/Modal';

export default function RuleModal({ open, onClose, editId }) {
  const { accounts, tags, rules, saveRules } = useData();
  const toast = useToast();

  const [keyword, setKeyword] = useState('');
  const [drAccountId, setDrAccountId] = useState('');
  const [crAccountId, setCrAccountId] = useState('');
  const [tagId, setTagId] = useState('');

  const sortedAccounts = useMemo(
    () => [...accounts].sort((a, b) => (a.code || '').localeCompare(b.code || '')),
    [accounts]
  );

  useEffect(() => {
    if (!open) return;
    if (editId) {
      const r = rules.find((x) => x.id === editId);
      if (r) { setKeyword(r.keyword); setDrAccountId(r.drAccountId); setCrAccountId(r.crAccountId); setTagId(r.tagId || ''); }
    } else {
      setKeyword(''); setDrAccountId(''); setCrAccountId(''); setTagId('');
    }
  }, [open, editId, rules]);

  const handleSave = () => {
    if (!keyword.trim()) { toast('キーワードを入力してください'); return; }
    const data = { keyword: keyword.trim(), drAccountId, crAccountId, tagId: tagId || '' };
    if (editId) {
      saveRules(rules.map((r) => r.id === editId ? { ...r, ...data } : r));
    } else {
      saveRules([...rules, { id: uid(), ...data }]);
    }
    toast('保存しました');
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={editId ? 'ルール編集' : 'ルール追加'}
      footer={<><button className="btn btn-g" onClick={onClose}>キャンセル</button><button className="btn btn-p" onClick={handleSave}>保存</button></>}>

      <div style={{ display: 'grid', gap: 10 }}>
        <div className="fg">
          <label className="fl">キーワード（摘要に含まれる文字列）</label>
          <input type="text" className="fc" placeholder="例：スーパー、ドトール" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
        </div>
        <div className="form-row">
          <div className="fg"><label className="fl">借方科目</label>
            <select className="fc" value={drAccountId} onChange={(e) => setDrAccountId(e.target.value)}>
              <option value="">— 選択 —</option>
              {sortedAccounts.map((a) => <option key={a.id} value={a.id}>{a.code ? `${a.code} ` : ''}{a.name}</option>)}
            </select>
          </div>
          <div className="fg"><label className="fl">貸方科目</label>
            <select className="fc" value={crAccountId} onChange={(e) => setCrAccountId(e.target.value)}>
              <option value="">— 選択 —</option>
              {sortedAccounts.map((a) => <option key={a.id} value={a.id}>{a.code ? `${a.code} ` : ''}{a.name}</option>)}
            </select>
          </div>
        </div>
        <div className="fg"><label className="fl">タグ（任意）</label>
          <select className="fc" value={tagId} onChange={(e) => setTagId(e.target.value)}>
            <option value="">(なし)</option>
            {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      </div>
    </Modal>
  );
}
