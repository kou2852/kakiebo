import { useState, useRef, useEffect } from 'react';

// 「エクスポート ▾」ボタン。メニューから CSV / PDF を選んでダウンロード。
export default function ExportMenu({ onCSV, onPDF }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const run = async (fn) => {
    setOpen(false);
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  };

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button className="btn btn-g" disabled={busy} onClick={() => setOpen((o) => !o)}>
        {busy ? '出力中…' : 'エクスポート ▾'}
      </button>
      {open && (
        <div style={{
          position: 'absolute', right: 0, top: 'calc(100% + 4px)', minWidth: 190, zIndex: 50,
          background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 8,
          boxShadow: 'var(--csh)', overflow: 'hidden',
        }}>
          <button className="export-item" onClick={() => run(onCSV)}>CSVでダウンロード</button>
          <button className="export-item" onClick={() => run(onPDF)}>PDFでダウンロード</button>
        </div>
      )}
    </div>
  );
}
