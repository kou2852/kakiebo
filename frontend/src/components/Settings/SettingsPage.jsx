import { useRef, useState } from 'react';
import { useData, ENC_BACKUP_TYPE } from '../../contexts/DataContext';
import { useAuth } from '../../contexts/AuthContext';
import { useUI } from '../../contexts/UIContext';
import { useToast } from '../Common/Toast';
import { HIDEABLE_NAV } from '../../config/nav';
import { track } from '../../utils/track';
import EncryptionPanel from './EncryptionPanel';
import EncryptedImportModal from './EncryptedImportModal';
import ReconcileModal from './ReconcileModal';
import MigrateModal from './MigrateModal';

export default function SettingsPage() {
  const { exportAll, importAll, encEnabled, exportEncryptedBackup } = useData();
  const { guestMode, deleteAccount } = useAuth();
  const { isHidden, toggleNav } = useUI();
  const toast = useToast();
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleteReason, setDeleteReason] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [encBackup, setEncBackup] = useState(null); // 取り込み待ちの暗号化バックアップ
  const [reconciling, setReconciling] = useState(false);
  const [migrating, setMigrating] = useState(false);

  // ⚠ 前後の空白は取り除いてから比べる。日本語入力では変換の確定で全角の空白が入りやすく、
  //   「削除 」と入れた人が、ボタンが押せない理由も分からないまま止まっていた。
  //   （String.prototype.trim は全角の空白 U+3000 も取り除く）
  const confirmOk = confirmText.trim() === '削除';

  const handleDeleteAccount = async () => {
    setDeleting(true);
    track('account_deleted'); // 離脱計測。イベント名のみ・理由はここに含めない（家計データではない自由記述は別途サーバーへ）
    try {
      await deleteAccount(deleteReason.trim() || undefined);
      // 成功すると未認証状態になりログイン画面へ自動遷移する
    } catch (err) {
      toast('削除に失敗しました: ' + (err.message || ''));
      setDeleting(false);
    }
  };

  const download = (obj, name) => {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExport = async () => {
    // 暗号化を有効にしていても、このファイルは復号済みの平文になる。保存先がクラウド同期されていると
    // 平文がそこへ上がるので、押す前に一度だけ確かめる。
    if (encEnabled && !window.confirm(
      'このファイルは暗号化されていません。金額や摘要がそのまま読める状態で保存されます。\n' +
      'ダウンロードフォルダがクラウドと同期されている場合は、そこにも平文で上がります。\n\n続けますか？'
    )) return;
    try {
      download(await exportAll(), `kakeibo_${new Date().toISOString().slice(0, 10)}.json`);
      toast('エクスポートしました');
    } catch {
      toast('エクスポートに失敗しました');
    }
  };

  // 暗号化したまま書き出す。取り込みは下の「JSONファイルを選択」でパスフレーズを入れて戻せる。
  const handleEncryptedExport = async () => {
    try {
      download(await exportEncryptedBackup(), `kurofukubo-encrypted-${new Date().toISOString().slice(0, 10)}.json`);
      toast('暗号化したまま保存しました');
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
    // 解錠画面から書き出した暗号化バックアップ。中身は読めないので専用モーダルへ回す。
    if (payload?.type === ENC_BACKUP_TYPE || (payload?.bundle && payload?.ct)) {
      setEncBackup(payload);
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

      {/* 実査。手入力の漏れで帳簿がずれるのを、実残高との突合で吸収する */}
      <div style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 10, padding: 18, marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, marginBottom: 6 }}>実査・評価替え</h3>
        <p style={{ color: 'var(--tx3)', fontSize: 12, marginBottom: 12 }}>
          通帳や財布の実際の残高を入れて、帳簿との差額を調整します。記帳の漏れがあっても、
          ここで合わせておけば貸借対照表と純資産の推移が実態から離れません。
          証券口座の時価を反映する評価替えも同じ画面から行えます。
        </p>
        <button className="btn btn-p" onClick={() => setReconciling(true)}>残高を照合する</button>
      </div>

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
          {encEnabled
            ? ' 暗号化を有効にしているので、ふだんは「暗号化したまま保存」を使ってください。通常のJSONは暗号化されず、中身がそのまま読めます。'
            : ' ファイルは暗号化されません。保管場所に気をつけてください。'}
        </p>
        {encEnabled ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-p" onClick={handleEncryptedExport}>暗号化したまま保存</button>
            <button className="btn btn-g" onClick={handleExport}>暗号化せずにJSONを保存</button>
          </div>
        ) : (
          <button className="btn btn-p" onClick={handleExport}>JSONをダウンロード</button>
        )}
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
        <p style={{ color: 'var(--tx3)', fontSize: 12, margin: '16px 0 12px' }}>
          他の家計簿アプリで書き出した CSV・JSON から、科目と仕訳をまとめて取り込みます（Android の「複式家計簿」・マネーフォワード ME・Zaim は自動で読み取ります）。
        </p>
        {/* ゲストは科目5件の上限があり、移行は必ず超える */}
        <button className="btn btn-g" disabled={guestMode} onClick={() => setMigrating(true)}>他のアプリから移行</button>
        {guestMode && <span style={{ color: 'var(--tx3)', fontSize: 12, marginLeft: 10 }}>アカウント登録すると使えます</span>}
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
              <div>
                <label className="fl" style={{ fontSize: 12, color: 'var(--tx2)' }}>削除の理由（任意・改善の参考にします）</label>
                <textarea className="fc" value={deleteReason} onChange={(e) => setDeleteReason(e.target.value)}
                  maxLength={500} rows={3} placeholder="よろしければ理由を教えてください"
                  style={{ resize: 'vertical', fontFamily: 'inherit' }} />
              </div>
              <p style={{ fontSize: 12, color: 'var(--tx2)' }}>
                確認のため <strong>削除</strong> と入力してください。
              </p>
              <input className="fc" value={confirmText} onChange={(e) => setConfirmText(e.target.value)}
                placeholder="削除" style={{ maxWidth: 200 }} />
              {/* 押せない理由を黙っていると、壊れているように見える */}
              {confirmText.trim() && !confirmOk && (
                <p style={{ fontSize: 12, color: 'var(--red)', margin: '-4px 0 0' }}>
                  「削除」の2文字だけを入力してください。
                </p>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-g" disabled={deleting}
                  onClick={() => { setConfirming(false); setConfirmText(''); setDeleteReason(''); }}>キャンセル</button>
                <button className="btn btn-d" disabled={deleting || !confirmOk}
                  onClick={handleDeleteAccount}>
                  {deleting ? '削除中...' : '完全に削除する'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <ReconcileModal open={reconciling} onClose={() => setReconciling(false)} />
      <MigrateModal open={migrating} onClose={() => setMigrating(false)} />

      <EncryptedImportModal open={!!encBackup} backup={encBackup}
        onClose={() => setEncBackup(null)}
        onDone={() => toast('取り込みました')} />
    </div>
  );
}
