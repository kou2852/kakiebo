import { useState, useEffect, useMemo } from 'react';
import { useData } from '../../contexts/DataContext';
import { uid, TAG_COLORS } from '../../utils/format';
import { useToast } from '../Common/Toast';
import Modal from '../Common/Modal';

// デフォルトタグ色のパレット（kakeibo.html の renderWmPal を踏襲）
const WALLET_COLORS = ['#888', '#6a7a8a', '#8a7060', '#7a8a6a', '#8a6a7a', '#6a8a8a', '#9a8a6a', '#6a6a9a', ...TAG_COLORS];

export default function WalletModal({ open, onClose, editId }) {
  const { accounts, wallets, saveWallets } = useData();
  const toast = useToast();

  const [name, setName] = useState('');
  const [accountId, setAccountId] = useState('');
  const [defaultTagName, setDefaultTagName] = useState('');
  const [defaultTagColor, setDefaultTagColor] = useState('#888');
  const [note, setNote] = useState('');

  // 紐づけ可能な科目は資産・負債のみ
  const walletAccounts = useMemo(
    () => accounts.filter((a) => a.type === 'asset' || a.type === 'liability'),
    [accounts]
  );

  useEffect(() => {
    if (!open) return;
    if (editId) {
      const w = wallets.find((x) => x.id === editId);
      if (w) {
        setName(w.name); setAccountId(w.accountId);
        setDefaultTagName(w.defaultTagName || ''); setDefaultTagColor(w.defaultTagColor || '#888');
        setNote(w.note || '');
      }
    } else {
      setName(''); setAccountId(walletAccounts[0]?.id || '');
      setDefaultTagName(''); setDefaultTagColor('#888'); setNote('');
    }
  }, [open, editId, wallets, walletAccounts]);

  const handleSave = async () => {
    if (!name.trim()) { toast('口座名を入力してください'); return; }
    const data = {
      name: name.trim(), accountId,
      defaultTagName: defaultTagName.trim(), defaultTagColor,
      note: note.trim(),
    };
    try {
      if (editId) {
        await saveWallets(wallets.map((w) => w.id === editId ? { ...w, ...data } : w));
      } else {
        await saveWallets([...wallets, { id: uid(), ...data }]);
      }
      toast('保存しました');
      onClose();
    } catch { toast('保存に失敗しました'); }
  };

  return (
    <Modal open={open} onClose={onClose} title={editId ? '口座編集' : '口座追加'}
      footer={<><button className="btn btn-g" onClick={onClose}>キャンセル</button><button className="btn btn-p" onClick={handleSave}>保存</button></>}>

      <div style={{ display: 'grid', gap: 10 }}>
        <div className="fg"><label className="fl">口座名</label>
          <input type="text" className="fc" placeholder="例：みずほ銀行" maxLength={50} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="fg"><label className="fl">紐づく勘定科目</label>
          <select className="fc" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {walletAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div className="fg"><label className="fl">デフォルトタグ名（タグ未設定の残高に表示）</label>
          <input type="text" className="fc" placeholder="例：予備費、自由枠" maxLength={30} value={defaultTagName} onChange={(e) => setDefaultTagName(e.target.value)} />
        </div>
        <div className="fg"><label className="fl">デフォルトタグの色</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {WALLET_COLORS.map((c) => (
              <div key={c} className={`tag-color-btn ${c === defaultTagColor ? 'sel' : ''}`}
                style={{ background: c }} onClick={() => setDefaultTagColor(c)} />
            ))}
          </div>
        </div>
        <div className="fg"><label className="fl">備考</label>
          <input type="text" className="fc" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}
