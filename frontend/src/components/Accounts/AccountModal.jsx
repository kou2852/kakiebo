import { useState, useEffect, useMemo, useRef } from 'react';
import { useData } from '../../contexts/DataContext';
import { ACCOUNT_TYPES } from '../../utils/format';
import { CODE_BASE, EQUITY_ID, nextCode } from '../../utils/accountCode';
import { useToast } from '../Common/Toast';
import Modal from '../Common/Modal';

export default function AccountModal({ open, onClose, editId, defaultType, prefill }) {
  const { accounts, addAccount, updateAccount, addJournal } = useData();
  const toast = useToast();

  const [name, setName] = useState('');
  const [type, setType] = useState('asset');
  const [code, setCode] = useState('');
  const [note, setNote] = useState('');
  const [ccClose, setCcClose] = useState('');
  const [ccDay, setCcDay] = useState('');
  const [ccDelay, setCcDelay] = useState('1');
  const [ccFrom, setCcFrom] = useState('');
  const [openingBalance, setOpeningBalance] = useState('');
  const nameRef = useRef(null);
  const balanceRef = useRef(null);

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
      // テンプレから開いた場合は内容をプリフィル（編集して保存できる）。
      // テンプレのコードが既に使われていれば、その区分の未使用最小コードに差し替える。
      const initialType = prefill?.type || defaultType || 'asset';
      const wantedCode = prefill?.code;
      const codeTaken = wantedCode && accounts.some((a) => a.code === wantedCode);
      setName(prefill?.name || ''); setType(initialType);
      setCode(wantedCode && !codeTaken ? wantedCode : nextCode(accounts, initialType));
      setNote('');
      setCcClose(''); setCcDay(''); setCcDelay('1'); setCcFrom('');
      setOpeningBalance('');
    }
  }, [open, editId, accounts, defaultType, prefill]);

  // 開始残高は新規の資産・負債科目のみ（収益・費用・純資産は「フロー」の科目で開始残高という概念がない）
  const showOpeningBalance = !editId && (type === 'asset' || type === 'liability');

  // 開いたら、いちばん価値のある入力（残高がある新規口座なら残高欄、それ以外は科目名）へフォーカスを合わせる
  useEffect(() => {
    if (!open) return;
    const t = requestAnimationFrame(() => (showOpeningBalance ? balanceRef : nameRef).current?.focus());
    return () => cancelAnimationFrame(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, showOpeningBalance]);

  // 新規作成時は、区分を変えたらその区分の未使用最小コードを自動で入れ直す（編集時はコードを保持）
  const handleTypeChange = (newType) => {
    setType(newType);
    if (!editId) setCode(nextCode(accounts, newType));
  };

  const handleSave = async () => {
    if (!name.trim()) { toast('科目名を入力してください'); return; }
    const trimmedCode = code.trim();
    if (trimmedCode && accounts.some((a) => a.code === trimmedCode && a.id !== editId)) {
      toast(`コード${trimmedCode}は既に使われています`); return;
    }
    const data = { name: name.trim(), type, code: trimmedCode, note: note.trim() };
    if (type === 'liability') {
      data.ccClose = parseInt(ccClose) || 0;
      data.ccDay = parseInt(ccDay) || 0;
      data.ccDelay = parseInt(ccDelay) || 1;
      data.ccFrom = ccFrom || '';
    }
    try {
      if (editId) {
        await updateAccount(editId, data);
      } else {
        const created = await addAccount(data);
        // 開始残高：資産は (借)新科目/(貸)元入金、負債（既存の借金）は (借)元入金/(貸)新科目
        const bal = Math.round(parseFloat(String(openingBalance).replace(/[¥,，]/g, '')) || 0);
        if (showOpeningBalance && bal > 0) {
          const lines = type === 'asset'
            ? [{ accountId: created.id, side: 'dr', amount: bal, taxRate: 0 }, { accountId: EQUITY_ID, side: 'cr', amount: bal, taxRate: 0 }]
            : [{ accountId: EQUITY_ID, side: 'dr', amount: bal, taxRate: 0 }, { accountId: created.id, side: 'cr', amount: bal, taxRate: 0 }];
          await addJournal({ date: new Date().toISOString().slice(0, 10), desc: `開始残高（${name.trim()}）`, lines }, { silent: true });
        }
      }
      toast('保存しました');
      onClose();
    } catch { toast('保存に失敗しました'); }
  };

  return (
    <Modal open={open} onClose={onClose} title={editId ? '科目編集' : '科目追加'}
      footer={<><button className="btn btn-g" onClick={onClose}>キャンセル</button><button className="btn btn-p" onClick={handleSave}>保存</button></>}>

      <div style={{ display: 'grid', gap: 10 }}>
        <div className="fg"><label className="fl">科目名</label><input ref={nameRef} type="text" className="fc" maxLength={50} value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="fg"><label className="fl">区分</label>
          <select className="fc" value={type} onChange={(e) => handleTypeChange(e.target.value)}>
            {Object.entries(ACCOUNT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="fg"><label className="fl">コード</label>
          <input type="number" className="fc" inputMode="numeric"
            min={CODE_BASE[type] + 1} max={CODE_BASE[type] + 999} step="1"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ''))}
            onKeyDown={(e) => { if (['e', 'E', '+', '-', '.'].includes(e.key)) e.preventDefault(); }}
          />
        </div>
        <div className="fg"><label className="fl">備考</label><input type="text" className="fc" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} /></div>
        {showOpeningBalance && (
          <div className="fg" data-tour="opening-balance">
            <label className="fl">{type === 'asset' ? 'いまの残高（任意）' : 'いまの残高・借入額（任意）'}</label>
            <input ref={balanceRef} type="text" inputMode="numeric" className="fc" placeholder="例: 100000" value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} />
            <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 4 }}>入力すると、保存と同時に純資産へ反映されます</div>
          </div>
        )}
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
