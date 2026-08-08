import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import Ad from '../Common/Ad';
import { AD_CONFIG } from '../../config/tiers';
import { NAV_SECTIONS } from '../../config/nav';

export default function Sidebar({ currentPage, onNavigate, open, onClose, tier, hiddenNav = [], onOpenGuide, onOpenWhatsNew, hasUnread }) {
  const { signOut } = useAuth();
  const { encEnabled, recoverySaved } = useData();

  const handleThemeToggle = () => {
    const body = document.body;
    const current = body.dataset.theme || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    body.dataset.theme = next;
    localStorage.setItem('kk_theme', next);
  };

  const Icon = ({ d }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      style={{ width: 16, height: 16, flexShrink: 0, opacity: 0.75 }}>
      <path d={d} />
    </svg>
  );

  return (
    <nav id="sidebar" className={`sidebar ${open ? 'open' : ''}`}
      style={{
        width: 224, background: 'var(--bg1)', borderRight: '1px solid var(--bd)',
        position: 'fixed', top: 0, left: 0, bottom: 0,
        display: 'flex', flexDirection: 'column', overflowY: 'auto', zIndex: 100,
      }}
    >
      <div className="s-logo" style={{ padding: '18px 12px 8px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <img src="/favicon.svg" width="26" height="26" style={{ borderRadius: 7, flexShrink: 0 }} alt="" aria-hidden="true" />
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontFamily: 'inherit', fontSize: 16, fontWeight: 800, letterSpacing: '-0.01em', color: 'var(--tx)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              kurofukubo
            </h1>
            <span style={{ fontSize: 10.5, color: 'var(--tx3)', display: 'block', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              資産が見える家計簿
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
          {encEnabled && !recoverySaved && (
            <button className="bell-btn" onClick={() => onNavigate('settings')} aria-label="リカバリキー未設定"
              title="リカバリキー未保存：パスフレーズを忘れるとデータを復元できません。クリックして保存。"
              style={{ color: 'var(--red)' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </button>
          )}
          {onOpenWhatsNew && (
            <button className="bell-btn" onClick={onOpenWhatsNew} aria-label="更新情報" title="更新情報">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              {hasUnread && <span className="bell-dot" />}
            </button>
          )}
        </div>
      </div>
      <button
        onClick={onClose}
        style={{
          display: 'none', position: 'absolute', top: 14, right: 12,
          background: 'none', border: 'none', color: 'var(--tx3)', fontSize: 18, cursor: 'pointer',
        }}
        className="s-close-btn"
      >✕</button>

      {/* はじめかた（いつでも初期セットアップを再表示） */}
      <div style={{ padding: '10px 0 2px' }}>
        <div className="s-item" onClick={onOpenGuide} style={{ color: 'var(--ac)', fontWeight: 600 }}>
          <span style={{ width: 16, textAlign: 'center', flexShrink: 0 }}>🚀</span>
          はじめかた
        </div>
      </div>

      {NAV_SECTIONS.map((section) => {
        const items = section.items.filter((it) => !hiddenNav.includes(it.id));
        if (items.length === 0) return null;
        return (
          <div key={section.label} style={{ padding: '6px 0' }}>
            <div style={{ fontSize: 10, letterSpacing: '.14em', color: 'var(--tx3)', padding: '4px 23px 6px', textTransform: 'uppercase', fontWeight: 700 }}>
              {section.label}
            </div>
            {items.map((item) => (
              <div
                key={item.id}
                data-tour={`nav-${item.id}`}
                className={`s-item ${currentPage === item.id ? 'active' : ''}`}
                onClick={() => onNavigate(item.id)}
              >
                {item.icon ? <Icon d={item.icon} /> : <span style={{ width: 16, flexShrink: 0 }} />}
                {item.label}
              </div>
            ))}
          </div>
        );
      })}

      {AD_CONFIG[tier]?.sidebar && (
        <div style={{ marginTop: 'auto', padding: '0 12px' }}><Ad /></div>
      )}

      <div style={AD_CONFIG[tier]?.sidebar
        ? { borderTop: '1px solid var(--bd)', padding: '10px 0' }
        : { marginTop: 'auto', borderTop: '1px solid var(--bd)', padding: '10px 0' }}>
        <div className={`s-item ${currentPage === 'inquiry' ? 'active' : ''}`} onClick={() => onNavigate('inquiry')}>
          <span style={{ width: 16, textAlign: 'center', flexShrink: 0 }}>💬</span>
          ご意見・お問い合わせ
        </div>
        <div className="theme-toggle" onClick={handleThemeToggle}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="5" />
          </svg>
          <span>テーマ切替</span>
        </div>
        <div className="s-item" onClick={signOut} style={{ color: 'var(--red)' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            style={{ width: 16, height: 16, flexShrink: 0, opacity: 0.75 }}>
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          ログアウト
        </div>
      </div>
    </nav>
  );
}
