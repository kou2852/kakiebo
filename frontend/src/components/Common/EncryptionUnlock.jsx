import { useState } from 'react';
import { useData } from '../../contexts/DataContext';

// 暗号化済みで未解錠のときに表示する解錠画面。パスフレーズ or リカバリーキーで解錠。
export default function EncryptionUnlock() {
  const { unlockEncryption, recoverEncryption } = useData();
  const [mode, setMode] = useState('pass'); // 'pass' | 'recovery'
  const [val, setVal] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      if (mode === 'pass') await unlockEncryption(val);
      else await recoverEncryption(val.trim());
    } catch {
      setErr(mode === 'pass' ? 'パスフレーズが正しくありません' : 'リカバリーキーが正しくありません');
    } finally { setBusy(false); }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg0)', padding: 20 }}>
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 16, padding: 32, width: '100%', maxWidth: 380, boxShadow: 'var(--csh)' }}>
        <h1 style={{ fontFamily: 'inherit', fontSize: 20, fontWeight: 800, letterSpacing: '-0.01em', color: 'var(--ac)', textAlign: 'center', marginBottom: 4 }}>🔒 ロック中</h1>
        <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--tx3)', marginBottom: 20 }}>
          {mode === 'pass' ? 'パスフレーズを入力して解錠してください' : 'リカバリーキーを入力してください'}
        </p>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input className="fc" type={mode === 'pass' ? 'password' : 'text'} value={val} autoFocus
            onChange={(e) => setVal(e.target.value)}
            placeholder={mode === 'pass' ? 'パスフレーズ' : 'XXXXX-XXXXX-…'} required />
          {err && <p style={{ color: 'var(--red)', fontSize: 12, textAlign: 'center' }}>{err}</p>}
          <button className="btn btn-p" type="submit" disabled={busy}
            style={{ width: '100%', justifyContent: 'center', padding: '10px 0', fontSize: 14 }}>
            {busy ? '解錠中…' : '解錠'}
          </button>
        </form>
        <div style={{ textAlign: 'center', marginTop: 16, fontSize: 12 }}>
          <a href="#" style={{ color: 'var(--tx3)' }}
            onClick={(e) => { e.preventDefault(); setErr(''); setVal(''); setMode(mode === 'pass' ? 'recovery' : 'pass'); }}>
            {mode === 'pass' ? 'パスフレーズを忘れた場合（リカバリーキーで解錠）' : 'パスフレーズで解錠に戻る'}
          </a>
        </div>
      </div>
    </div>
  );
}
