import { useEffect } from 'react';

// 背景クリックでは閉じない（入力中の誤タップでの消失を防ぐ）。閉じる操作は✕かフッターのボタンに限る。
export default function Modal({ open, onClose, title, wide, children, footer, hideClose }) {
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
    <div className="mo open">
      <div className={`md ${wide ? 'md-w' : ''}`}>
        <div className="md-handle" aria-hidden="true" />
        <div className="md-t">
          <span>{title}</span>
          {!hideClose && <button type="button" className="md-x" onClick={onClose} aria-label="閉じる">×</button>}
        </div>
        {children}
        {footer && <div className="md-f">{footer}</div>}
      </div>
    </div>
  );
}
