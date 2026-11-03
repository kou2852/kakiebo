import { WEB_UPDATES } from '../../config/updates';

// ダッシュボードに着いたとき、画面の上へ重ねて出す「更新情報」カード。まだ読んでいない新着があるときだけ。
// 閉じる（✕・閉じる）と既読になる。「一覧を見る」は更新情報の一覧を開く（そのときも既読）。
// 出す・出さないの判断は App.jsx。ここは見た目だけ。
export default function UpdatesOverlay({ open, onClose, onList }) {
  const latest = WEB_UPDATES[0];
  if (!open || !latest) return null;
  return (
    <div className="mo open" role="dialog" aria-label="更新情報">
      <div className="md" style={{ maxWidth: 420 }}>
        <div className="md-handle" aria-hidden="true" />
        <div className="md-t">
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            更新情報
            <span style={{ background: 'var(--red)', color: '#fff', borderRadius: 9, padding: '1px 8px', fontSize: 11, fontWeight: 800 }}>新着</span>
          </span>
          <button type="button" className="md-x" onClick={onClose} aria-label="閉じる">×</button>
        </div>
        <button type="button" onClick={onList}
          style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--tx)' }}>
          {latest.date ? <div style={{ fontSize: 12, color: 'var(--tx3)' }}>{latest.date}</div> : null}
          <div style={{ fontSize: 15.5, fontWeight: 700, margin: '4px 0' }}>{latest.title}</div>
          {latest.items?.[0] ? <div style={{ fontSize: 13, color: 'var(--tx2)', lineHeight: 1.7 }}>{latest.items[0]}</div> : null}
          <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ac)', marginTop: 8 }}>一覧を見る ›</div>
        </button>
        <div className="md-f">
          <button className="btn btn-g" onClick={onClose}>閉じる</button>
        </div>
      </div>
    </div>
  );
}
