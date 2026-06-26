import { useEffect, useCallback } from 'react';

export default function Modal({ open, onClose, title, wide, children, footer }) {
  const handleBg = useCallback((e) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  // Escキーで閉じる
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // スクロールロック
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  return (
    <div className="mo open" onClick={handleBg}>
      <div className={`md ${wide ? 'md-w' : ''}`}>
        <div className="md-t">{title}</div>
        {children}
        {footer && <div className="md-f">{footer}</div>}
      </div>
    </div>
  );
}
