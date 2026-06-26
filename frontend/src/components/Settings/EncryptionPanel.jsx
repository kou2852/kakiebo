import { useState } from 'react';
import { useData } from '../../contexts/DataContext';
import Modal from '../Common/Modal';
import { useToast } from '../Common/Toast';

// 設定画面の「端末データの暗号化（E2E）」セクション。ローカル/ゲスト時のみ有効。
export default function EncryptionPanel() {
  const { encAvailable, encEnabled, recoverySaved, enableEncryption, disableEncryption, changeEncPassphrase, regenerateRecoveryKey, markRecoverySaved } = useData();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState('setup'); // 'setup' | 'recovery' | 'change'
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [recoveryKey, setRecoveryKey] = useState('');
  const [busy, setBusy] = useState(false);

  const openSetup = () => { setStep('setup'); setP1(''); setP2(''); setRecoveryKey(''); setOpen(true); };
  const openChange = () => { setStep('change'); setP1(''); setP2(''); setOpen(true); };

  const validate = () => {
    if (p1.length < 8) { toast('パスフレーズは8文字以上にしてください'); return false; }
    if (p1 !== p2) { toast('パスフレーズが一致しません'); return false; }
    return true;
  };

  const doEnable = async () => {
    if (!validate()) return;
    setBusy(true);
    try { setRecoveryKey(await enableEncryption(p1)); setStep('recovery'); }
    catch { toast('暗号化の有効化に失敗しました'); }
    finally { setBusy(false); }
  };
  const doChange = async () => {
    if (!validate()) return;
    setBusy(true);
    try { await changeEncPassphrase(p1); toast('パスフレーズを変更しました'); setOpen(false); }
    catch { toast('変更に失敗しました'); }
    finally { setBusy(false); }
  };
  const doDisable = async () => {
    if (!confirm('暗号化を解除しますか？このあとデータは端末に平文で保存されます。')) return;
    try { await disableEncryption(); toast('暗号化を解除しました'); } catch { toast('解除に失敗しました'); }
  };
  // リカバリキーを再発行して表示（「後で」にした場合や紛失時）
  const showRecoveryAgain = async () => {
    setBusy(true);
    try { setRecoveryKey(await regenerateRecoveryKey()); setStep('recovery'); setOpen(true); }
    catch { toast('リカバリキーの発行に失敗しました'); }
    finally { setBusy(false); }
  };

  const downloadKey = () => {
    const body = `kurofukubo リカバリキー\n発行日時: ${new Date().toLocaleString('ja-JP')}\n\n${recoveryKey}\n\n` +
      'パスフレーズを忘れた/再設定した際に、暗号化データを復元できる唯一の手段です。\n安全な場所に保管してください。運営者はこのキーを保持しておらず、復元できません。';
    const url = URL.createObjectURL(new Blob([body], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'kurofukubo-recovery-key.txt'; a.click();
    URL.revokeObjectURL(url);
  };
  const copyKey = async () => { try { await navigator.clipboard.writeText(recoveryKey); toast('コピーしました'); } catch { toast('コピーに失敗しました'); } };

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-title">端末データの暗号化（プライバシー強化）</div>

      {!encAvailable ? (
        <p className="nd">ログイン中のデータは現在この機能の対象外です（準備中）。「ゲストとして試す」など、この端末で使う場合に、運営者でも復号できない暗号化を有効にできます。</p>
      ) : encEnabled ? (
        <>
          <p style={{ fontSize: 13, color: 'var(--grn)', marginBottom: 8 }}>✓ この端末のデータは暗号化されています（運営者でも復号できません）。</p>
          {!recoverySaved && (
            <p style={{ fontSize: 12, color: 'var(--red)', marginBottom: 10 }}>
              ⚠️ リカバリキーが未保存です。パスフレーズを忘れると復元できません。
            </p>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-p btn-s" disabled={busy} onClick={showRecoveryAgain}>リカバリキーを{recoverySaved ? '再発行' : '表示・保存'}</button>
            <button className="btn btn-g btn-s" onClick={openChange}>パスフレーズを変更</button>
            <button className="btn btn-d btn-s" onClick={doDisable}>暗号化を解除</button>
          </div>
        </>
      ) : (
        <>
          <p style={{ fontSize: 13, color: 'var(--tx2)', marginBottom: 10 }}>
            この端末のデータをパスフレーズで暗号化します。パスフレーズは運営者に送信されず、<strong>忘れるとリカバリキーでしか復元できません</strong>。
          </p>
          <button className="btn btn-p btn-s" onClick={openSetup}>端末データを暗号化する</button>
        </>
      )}

      <Modal
        open={open}
        onClose={() => { if (step !== 'recovery') setOpen(false); }}
        title={step === 'recovery' ? '🔑 リカバリキーを保存' : step === 'change' ? 'パスフレーズの変更' : '端末データの暗号化'}
        footer={
          step === 'recovery'
            ? <>
                <button className="btn btn-g" onClick={() => setOpen(false)}>後で</button>
                <button className="btn btn-p" onClick={() => { markRecoverySaved(); setOpen(false); toast('リカバリキーを保存済みにしました'); }}>保存しました・閉じる</button>
              </>
            : <>
                <button className="btn btn-g" onClick={() => setOpen(false)}>キャンセル</button>
                <button className="btn btn-p" disabled={busy} onClick={step === 'change' ? doChange : doEnable}>{busy ? '処理中…' : (step === 'change' ? '変更' : '有効にする')}</button>
              </>
        }
      >
        {step === 'recovery' ? (
          <div>
            <p style={{ fontSize: 13, color: 'var(--tx2)', marginBottom: 10 }}>
              パスフレーズを忘れた場合の<strong>唯一の復元手段</strong>です。安全な場所に保管してください（運営者は復元できません）。
            </p>
            <div className="mono" style={{ background: 'var(--bg3)', border: '1px solid var(--bd)', borderRadius: 6, padding: '12px 14px', fontSize: 15, textAlign: 'center', letterSpacing: '.05em', wordBreak: 'break-all', marginBottom: 10 }}>{recoveryKey}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-p btn-s" onClick={downloadKey}>ファイルでダウンロード</button>
              <button className="btn btn-g btn-s" onClick={copyKey}>コピー</button>
            </div>
            <p style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 8 }}>「後で」を選ぶと、設定からいつでも再発行できます（その都度新しいキーになります）。</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="fg">
              <label className="fl">{step === 'change' ? '新しいパスフレーズ（8文字以上）' : 'パスフレーズ（8文字以上）'}</label>
              <input className="fc" type="password" value={p1} onChange={(e) => setP1(e.target.value)} autoFocus />
            </div>
            <div className="fg">
              <label className="fl">確認のためもう一度</label>
              <input className="fc" type="password" value={p2} onChange={(e) => setP2(e.target.value)} />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
