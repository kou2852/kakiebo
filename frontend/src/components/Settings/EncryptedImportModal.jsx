import { useState, useEffect, useMemo } from 'react';
import { useData } from '../../contexts/DataContext';
import Modal from '../Common/Modal';

// 暗号化バックアップの取り込み。
// まず現在の鍵で復号を試し（破棄を挟んでいなければ鍵が同じなので何も聞かずに開く）、
// 失敗したときだけ、そのファイル用のパスフレーズ／リカバリーキーを尋ねる。
const ROWS = [
  ['journals', '仕訳'], ['accounts', '科目'], ['tags', 'タグ'], ['wallets', '口座'],
  ['presets', 'プリセット'], ['recurring', '定期取引'], ['rules', '自動分類ルール'],
  ['budgets', '予算'], ['allocs', 'タグ配分'],
];

export default function EncryptedImportModal({ open, onClose, backup, onDone }) {
  const { decryptBackup, importAll, accounts } = useData();
  const [phase, setPhase] = useState('trying'); // 'trying' | 'ask' | 'preview'
  const [kind, setKind] = useState('pass');     // 'pass' | 'recovery'
  const [secret, setSecret] = useState('');
  const [dataset, setDataset] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !backup) return;
    setPhase('trying'); setKind('pass'); setSecret(''); setDataset(null); setErr(''); setBusy(false);
    // 現在の鍵で開けるか試す。開けなければ入力を求める。
    decryptBackup(backup).then(
      (d) => { setDataset(d); setPhase('preview'); },
      () => setPhase('ask'),
    );
  }, [open, backup, decryptBackup]);

  const trySecret = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      const d = await decryptBackup(backup, secret, kind);
      setDataset(d); setPhase('preview');
    } catch {
      // AES-GCM は「鍵が違う」と「ファイルが壊れている」を区別できないため両方書く
      setErr(kind === 'pass'
        ? 'パスフレーズが違うか、ファイルが壊れています'
        : 'リカバリーキーが違うか、ファイルが壊れています');
    } finally { setBusy(false); }
  };

  // 名前は同じだがIDが違う科目＝取り込むと別物として並ぶ。既定科目は固定IDなので当たらない。
  const dupNames = useMemo(() => {
    if (!dataset?.accounts) return [];
    const byId = new Map(accounts.map((a) => [a.id, a]));
    const names = new Map(accounts.map((a) => [a.name, a.id]));
    return dataset.accounts
      .filter((a) => !byId.has(a.id) && names.has(a.name))
      .map((a) => a.name);
  }, [dataset, accounts]);

  const doImport = async () => {
    setBusy(true); setErr('');
    try { await importAll(dataset); onDone?.(dataset); onClose(); }
    catch (e) { setErr('取り込みに失敗しました: ' + (e.message || '')); }
    finally { setBusy(false); }
  };

  const exportedAt = backup?.exportedAt ? new Date(backup.exportedAt).toLocaleString('ja-JP') : null;
  const note = { fontSize: 11.5, color: 'var(--tx3)', lineHeight: 1.75 };

  return (
    <Modal open={open} onClose={onClose} title="暗号化バックアップの取り込み"
      footer={phase === 'preview' ? (
        <>
          <button className="btn btn-g" onClick={onClose}>やめる</button>
          <button className="btn btn-p" onClick={doImport} disabled={busy}>{busy ? '取り込み中…' : '取り込む'}</button>
        </>
      ) : <button className="btn btn-g" onClick={onClose}>やめる</button>}>

      {exportedAt && (
        <p style={{ ...note, marginBottom: 12 }}>このファイルは <strong style={{ color: 'var(--tx2)' }}>{exportedAt}</strong> に書き出されました。</p>
      )}

      {phase === 'trying' && <p className="nd">復号を試しています…</p>}

      {phase === 'ask' && (
        <form onSubmit={trySecret} style={{ display: 'grid', gap: 10 }}>
          <p style={{ ...note }}>
            いまの鍵では開けませんでした。<strong style={{ color: 'var(--tx2)' }}>このファイルを作ったときのパスフレーズ</strong>を入力してください。
            現在設定しているパスフレーズとは別物です。
          </p>
          <div className="fg">
            <label className="fl">{kind === 'pass' ? 'パスフレーズ' : 'リカバリーキー'}</label>
            <input className="fc" type={kind === 'pass' ? 'password' : 'text'} value={secret} autoFocus required
              placeholder={kind === 'pass' ? 'パスフレーズ' : 'XXXXX-XXXXX-…'}
              onChange={(e) => setSecret(e.target.value)} />
          </div>
          {err && <p style={{ color: 'var(--red)', fontSize: 12 }}>{err}</p>}
          <button className="btn btn-p" type="submit" disabled={busy}
            style={{ justifyContent: 'center', padding: '9px 0' }}>{busy ? '復号中…' : '復号する'}</button>
          <div style={{ textAlign: 'center', fontSize: 12 }}>
            <a href="#" style={{ color: 'var(--tx3)' }}
              onClick={(e) => { e.preventDefault(); setErr(''); setSecret(''); setKind(kind === 'pass' ? 'recovery' : 'pass'); }}>
              {kind === 'pass' ? 'リカバリーキーで復号する' : 'パスフレーズで復号する'}
            </a>
          </div>
        </form>
      )}

      {phase === 'preview' && dataset && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--grn)', marginBottom: 10 }}>復号しました</div>
          <div className="tw">
            <table>
              <tbody>
                {ROWS.filter(([k]) => (dataset[k]?.length || 0) > 0).map(([k, label]) => (
                  <tr key={k}>
                    <td>{label}</td>
                    <td className="text-r mono">{dataset[k].length} 件</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ ...note, marginTop: 10 }}>
            <strong style={{ color: 'var(--tx2)' }}>いまのデータは削除されません。</strong>
            同じIDの項目は上書きされ、無いものは追加されます。
          </p>
          {dupNames.length > 0 && (
            <p style={{ fontSize: 11.5, color: 'var(--red)', lineHeight: 1.75, marginTop: 8 }}>
              同じ名前で別IDの科目が {dupNames.length} 件あります（{dupNames.slice(0, 3).join('・')}
              {dupNames.length > 3 ? ' ほか' : ''}）。取り込むと一覧に2つ並びます。不要な方は後から削除してください。
            </p>
          )}
          {err && <p style={{ color: 'var(--red)', fontSize: 12, marginTop: 8 }}>{err}</p>}
        </div>
      )}
    </Modal>
  );
}
