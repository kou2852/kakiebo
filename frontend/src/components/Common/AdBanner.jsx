import { useEffect, useRef, useState } from 'react';

// AdSense の publisher ID / スロットID は env で設定（未設定なら何も表示しない）。
const CLIENT = import.meta.env.VITE_ADSENSE_CLIENT; // 例 ca-pub-1234567890123456
const SLOT = import.meta.env.VITE_ADSENSE_SLOT;     // 例 1234567890

// 単一の AdSense インライン広告枠。
// 広告がブロック/未配信のときは枠ごと非表示にして画面が崩れないようにする。
export default function AdBanner() {
  const insRef = useRef(null);
  const [hide, setHide] = useState(false);

  useEffect(() => {
    if (!CLIENT || !SLOT) return;
    if (!document.querySelector('script[src^="https://pagead2.googlesyndication.com"]')) {
      const s = document.createElement('script');
      s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${CLIENT}`;
      s.async = true;
      s.crossOrigin = 'anonymous';
      document.head.appendChild(s);
    }
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch { /* スクリプト読込前は無視（読込後にキュー処理される） */ }

    // 広告ブロッカー / 未配信なら枠を畳む
    const t = setTimeout(() => {
      const status = insRef.current?.getAttribute('data-ad-status');
      if (status !== 'filled') setHide(true);
    }, 2500);
    return () => clearTimeout(t);
  }, []);

  if (!CLIENT || !SLOT || hide) return null;

  return (
    <div style={{
      position: 'relative', margin: '12px 0', padding: 8,
      background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 7,
    }}>
      <div style={{ fontSize: 10, color: 'var(--tx3)', letterSpacing: '.06em', marginBottom: 4 }}>広告</div>
      <ins
        ref={insRef}
        className="adsbygoogle"
        style={{ display: 'block' }}
        data-ad-client={CLIENT}
        data-ad-slot={SLOT}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}
