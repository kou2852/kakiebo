import { useState } from 'react';
import { useData } from '../../contexts/DataContext';
import { useAuth } from '../../contexts/AuthContext';

// 暗号化済みで未解錠のときに表示する解錠画面。パスフレーズ or リカバリーキーで解錠。
// どちらも失った人がここから出られないと、アプリごと使えなくなる（ログインし直しても
// 暗号文はサーバー側にあるので同じ画面に戻る）。そのための出口を下部に置いている。
export default function EncryptionUnlock() {
  const { unlockEncryption, recoverEncryption, exportEncryptedBackup, wipeEncryption } = useData();
  const { signOut } = useAuth();
  const [mode, setMode] = useState('pass'); // 'pass' | 'recovery'
  const [val, setVal] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const [helpOpen, setHelpOpen] = useState(false);
  const [backupDone, setBackupDone] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [wipeErr, setWipeErr] = useState('');

  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      if (mode === 'pass') await unlockEncryption(val);
      else await recoverEncryption(val.trim());
    } catch {
      setErr(mode === 'pass' ? 'パスフレーズが正しくありません' : 'リカバリーキーが正しくありません');
    } finally { setBusy(false); }
  };

  const saveBackup = async () => {
    setWipeErr(''); setBusy(true);
    try {
      const backup = await exportEncryptedBackup();
      const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `kurofukubo-encrypted-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setBackupDone(true);
    } catch {
      // 書き出す暗号文が無い＝バックアップしても意味がない。破棄は止めない。
      setWipeErr('バックアップできる暗号化データが見つかりませんでした。このまま破棄できます。');
      setBackupDone(true);
    } finally { setBusy(false); }
  };

  const doWipe = async () => {
    setWipeErr(''); setBusy(true);
    try { await wipeEncryption(); }
    catch { setWipeErr('破棄に失敗しました。通信を確認して、もう一度お試しください。'); }
    finally { setBusy(false); }
  };

  const box = { background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 16, padding: 32, width: '100%', maxWidth: 380, boxShadow: 'var(--csh)' };
  const note = { fontSize: 11.5, color: 'var(--tx3)', lineHeight: 1.75 };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg0)', padding: 20 }}>
      <div style={box}>
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

        {/* ── どちらも分からない人の出口 ── */}
        <div style={{ borderTop: '1px solid var(--bd)', marginTop: 20, paddingTop: 16 }}>
          {!helpOpen ? (
            <div style={{ textAlign: 'center', fontSize: 12 }}>
              <a href="#" style={{ color: 'var(--tx3)' }}
                onClick={(e) => { e.preventDefault(); setHelpOpen(true); }}>
                どちらも分からない場合
              </a>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <p style={{ ...note, color: 'var(--tx2)' }}>
                <strong style={{ color: 'var(--tx)' }}>データを元に戻す方法はありません。</strong>
                鍵はあなたの端末から出ていないため、運営者にも復号できません。
                いまここでできるのは、<strong style={{ color: 'var(--tx)' }}>暗号化されたままの状態を保存しておくこと</strong>と、
                <strong style={{ color: 'var(--tx)' }}>それを捨ててやり直すこと</strong>です。
              </p>

              {/* ① バックアップ */}
              <div>
                <button className="btn btn-g" type="button" disabled={busy} onClick={saveBackup}
                  style={{ width: '100%', justifyContent: 'center', padding: '9px 0' }}>
                  {backupDone ? '✓ バックアップを保存しました' : '① バックアップを保存する'}
                </button>
                <p style={{ ...note, marginTop: 6 }}>
                  暗号化されたままのファイルです。いまは開けませんが、
                  <strong style={{ color: 'var(--tx2)' }}>後でパスフレーズかリカバリーキーを思い出せば、設定のインポートから復元できます。</strong>
                </p>
              </div>

              {/* ② 破棄 */}
              <div style={{ border: '1px solid var(--red)', borderRadius: 8, padding: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--red)', marginBottom: 6 }}>② 暗号化データを破棄してやり直す</div>
                <p style={{ ...note, marginBottom: 8 }}>
                  暗号化された家計データを削除し、空の状態から使えるようにします。
                  <strong style={{ color: 'var(--red)' }}>この操作は取り消せません。</strong>
                  アカウントとログインはそのまま残ります。
                </p>
                {!backupDone ? (
                  <p style={{ ...note, color: 'var(--red)' }}>先に①でバックアップを保存してください。</p>
                ) : (
                  <>
                    <label className="fl" htmlFor="wipe-confirm">続けるには「削除」と入力してください</label>
                    <input id="wipe-confirm" className="fc" type="text" value={confirmText} placeholder="削除"
                      onChange={(e) => setConfirmText(e.target.value)} />
                    <button className="btn btn-d" type="button" disabled={busy || confirmText.trim() !== '削除'}
                      onClick={doWipe}
                      style={{ width: '100%', justifyContent: 'center', padding: '9px 0', marginTop: 8 }}>
                      {busy ? '破棄中…' : '破棄してやり直す'}
                    </button>
                  </>
                )}
                {wipeErr && <p style={{ color: 'var(--red)', fontSize: 12, marginTop: 8 }}>{wipeErr}</p>}
              </div>

              {/* ③ ログアウト */}
              <div style={{ textAlign: 'center', fontSize: 12 }}>
                <a href="#" style={{ color: 'var(--tx3)' }}
                  onClick={(e) => { e.preventDefault(); signOut(); }}>
                  ③ ログアウトする（別のアカウントで入り直す）
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
