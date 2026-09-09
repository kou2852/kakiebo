import Modal from './Modal';
import { APP_UPDATES } from '../../config/updates';
import { track } from '../../utils/track';

// アプリ内の更新情報。直近5回分の更新を履歴として一覧表示する。
export default function WhatsNewModal({ open, onClose }) {
  const updates = APP_UPDATES.slice(0, 5);
  if (!updates.length) return null;
  return (
    <Modal open={open} onClose={onClose} title="🆕 更新情報"
      footer={<button className="btn btn-p" onClick={onClose}>閉じる</button>}>
      {updates.map((u, ui) => (
        <div key={u.id} style={{ marginBottom: ui < updates.length - 1 ? 18 : 0, paddingBottom: ui < updates.length - 1 ? 18 : 0, borderBottom: ui < updates.length - 1 ? '1px solid var(--bd)' : 'none' }}>
          <div style={{ fontSize: 12, color: 'var(--tx3)', marginBottom: 8 }}>{u.date} ・ {u.title}</div>
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.9, fontSize: 13 }}>
            {u.items.map((it, i) => <li key={i}>{it}</li>)}
          </ul>
          {/* 外部事業者には渡さない。押されたという事実だけを自前ビーコンへ送る。 */}
          {u.link && (
            <a href={u.link.href} target="_blank" rel="noopener noreferrer"
              onClick={() => u.link.event && track(u.link.event)}
              style={{ display: 'inline-block', marginTop: 12, fontSize: 13, fontWeight: 600 }}>
              {u.link.label} →
            </a>
          )}
        </div>
      ))}
    </Modal>
  );
}
