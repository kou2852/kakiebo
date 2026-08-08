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
  // 口座名を手で直したか。触っていなければ科目名で自動補完する。
  const [nameTouched, setNameTouched] = useState(false);

  // 紐づけ可能な科目は資産・負債のうち、まだ口座になっていないものだけ（編集中の科目は残す）。
  // 全科目を出すと同じ科目に口座を二重登録できてしまう。
  const walletAccounts = useMemo(() => {
    const taken = new Set(wallets.filter((w) => w.id !== editId).map((w) => w.accountId));
    return accounts.filter((a) => (a.type === 'asset' || a.type === 'liability') && !taken.has(a.id));
  }, [accounts, wallets, editId]);

  useEffect(() => {
    if (!open) return;
    if (editId) {
      const w = wallets.find((x) => x.id === editId);
      if (w) {
        setName(w.name); setAccountId(w.accountId);
        setDefaultTagName(w.defaultTagName || ''); setDefaultTagColor(w.defaultTagColor || '#888');
        setNote(w.note || '');
      }
      setNameTouched(true); // 既存の名前を勝手に書き換えない
    } else {
      // 初期値は未選択にする。先頭の科目を勝手に選ぶと、気づかず別の科目に紐づけてしまう。
      setName(''); setAccountId('');
      setDefaultTagName(''); setDefaultTagColor('#888'); setNote('');
      setNameTouched(false);
    }
  }, [open, editId, wallets]);

  // 科目を選んだら口座名を自動で入れる（手打ちの手間と取り違えを減らす）
  const pickAccount = (id) => {
    setAccountId(id);
    if (nameTouched) return;
    setName(accounts.find((a) => a.id === id)?.name || '');
  };

  const handleSave = async () => {
    if (!accountId) { toast('紐づく勘定科目を選んでください'); return; }
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
        <div className="fg"><label className="fl">紐づく勘定科目</label>
          <select className="fc" value={accountId} onChange={(e) => pickAccount(e.target.value)}>
            <option value="">— 選択 —</option>
            {walletAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          {!editId && walletAccounts.length === 0 && (
            <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 4 }}>
              資産・負債の科目がすべて口座に登録済みです。先に「＋ 科目」で科目を追加してください。
            </div>
          )}
        </div>
        <div className="fg"><label className="fl">口座名</label>
          <input type="text" className="fc" placeholder="例：みずほ銀行" maxLength={50} value={name}
            onChange={(e) => { setNameTouched(true); setName(e.target.value); }} />
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
