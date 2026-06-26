// データが無い画面で「次にやること」を案内する共通の空状態。
export default function EmptyState({ icon = '📝', title, desc, action, media }) {
  return (
    <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--tx3)' }}>
      <div style={{ fontSize: 30, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontSize: 14, color: 'var(--tx2)', marginBottom: desc ? 4 : 14 }}>{title}</div>
      {desc && <div style={{ fontSize: 12, lineHeight: 1.6, marginBottom: 14, maxWidth: 360, marginLeft: 'auto', marginRight: 'auto' }}>{desc}</div>}
      {media && <img src={media} alt="操作の例" loading="lazy" style={{ width: '100%', maxWidth: 420, borderRadius: 8, border: '1px solid var(--bd)', margin: '0 auto 14px', display: 'block' }} />}
      {action}
    </div>
  );
}
