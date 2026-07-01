import { useRef, useState } from 'react';
import { useData } from '../../contexts/DataContext';
import { useAuth } from '../../contexts/AuthContext';
import { useUI } from '../../contexts/UIContext';
import { useToast } from '../Common/Toast';
import { HIDEABLE_NAV } from '../../config/nav';
import EncryptionPanel from './EncryptionPanel';

export default function SettingsPage() {
  const { exportAll, importAll } = useData();
  const { guestMode, deleteAccount } = useAuth();
  const { isHidden, toggleNav } = useUI();
  const toast = useToast();
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      await deleteAccount();
      // 成功すると未認証状態になりログイン画面へ自動遷移する
    } catch (err) {
      toast('削除に失敗しました: ' + (err.message || ''));
      setDeleting(false);
    }
  };

  const handleExport = async () => {
    try {
      const data = await exportAll();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kakeibo_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast('エクスポートしました');
    } catch {
      toast('エクスポートに失敗しました');
    }
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    let payload;
    try {
      payload = JSON.parse(await file.text());
    } catch {
      toast('JSONの読み込みに失敗しました');
      return;
    }
    if (!payload || !Array.isArray(payload.accounts)) {
      toast('家計簿のバックアップJSONではないようです');
      return;
    }

    const cnt = payload.journals?.length || 0;
    if (!window.confirm(
      `仕訳 ${cnt} 件を含むデータを取り込みます。\n同じIDの項目は上書き、新規は追加されます。よろしいですか？`
    )) return;

    setBusy(true);
    try {
      const r = await importAll(payload);
      toast(`インポート完了（${r.imported ?? ''}件）`);
    } catch (err) {
      toast('インポートに失敗しました: ' + (err.message || ''));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ maxWidth: 640 }}>
      <div className="pg-header"><div className="pg-title">設定</div><div className="pg-sub">表示メニューの調整やデータのバックアップ・移行ができます</div></div>

      {/* 表示する画面のカスタマイズ */}
      <div style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 10, padding: 18, marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, marginBottom: 6 }}>表示する画面</h3>
        <p style={{ color: 'var(--tx3)', fontSize: 12, marginBottom: 12 }}>
          使わない画面のチェックを外すと、左メニューから隠せます（ダッシュボード・仕訳入力・設定は常に表示）。
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
          {HIDEABLE_NAV.map((item) => (
            <label key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={!isHidden(item.id)} onChange={() => toggleNav(item.id)} />
              {item.label}
            </label>
          ))}
        </div>
      </div>

      <div data-tour="backup" style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 10, padding: 18, marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, marginBottom: 6 }}>エクスポート</h3>
        <p style={{ color: 'var(--tx3)', fontSize: 12, marginBottom: 12 }}>
          現在のデータをJSONファイルとして保存します。
        </p>
        <button className="btn btn-p" onClick={handleExport}>JSONをダウンロード</button>
      </div>

      <div style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 10, padding: 18 }}>
        <h3 style={{ fontSize: 14, marginBottom: 6 }}>インポート / 移行</h3>
        <p style={{ color: 'var(--tx3)', fontSize: 12, marginBottom: 12 }}>
          旧アプリの「エクスポート」で書き出したJSON、または上のエクスポートで保存したJSONを取り込みます。
          同じIDの項目は上書きされます。
        </p>
        <input ref={fileRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleFile} />
        <button className="btn btn-p" disabled={busy} onClick={() => fileRef.current?.click()}>
          {busy ? '取り込み中...' : 'JSONファイルを選択'}
        </button>
      </div>

      <div data-tour="e2e"><EncryptionPanel /></div>

      {!guestMode && (
        <div style={{ background: 'var(--bg1)', border: '1px solid var(--red)', borderRadius: 10, padding: 18, marginTop: 24 }}>
          <h3 style={{ fontSize: 14, marginBottom: 6, color: 'var(--red)' }}>アカウント削除</h3>
          <p style={{ color: 'var(--tx3)', fontSize: 12, marginBottom: 12 }}>
            アカウントと<strong>すべての家計データ</strong>を完全に削除します。この操作は取り消せません。
            必要なデータは事前に上の「エクスポート」で保存してください。
          </p>
          {!confirming ? (
            <button className="btn btn-d" onClick={() => setConfirming(true)}>アカウントを削除</button>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              <p style={{ fontSize: 12, color: 'var(--tx2)' }}>
                確認のため <strong>削除</strong> と入力してください。
              </p>
              <input className="fc" value={confirmText} onChange={(e) => setConfirmText(e.target.value)}
                placeholder="削除" style={{ maxWidth: 200 }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-g" disabled={deleting}
                  onClick={() => { setConfirming(false); setConfirmText(''); }}>キャンセル</button>
                <button className="btn btn-d" disabled={deleting || confirmText !== '削除'}
                  onClick={handleDeleteAccount}>
                  {deleting ? '削除中...' : '完全に削除する'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
