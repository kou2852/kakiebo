import { useEffect, useState } from 'react';
import { ANDROID_APP } from '../../config/release';
import { useData } from '../../contexts/DataContext';
import { track } from '../../utils/track';
import Modal from './Modal';

const KEY = 'kk_android_promo';

// iPhone・iPadのブラウザには出さない（Androidアプリは入れられない）。
const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// Androidアプリの案内。このブラウザで1回だけ出す。IosPromoModal と同じ作法。
//
// ⚠ 公開前は出さない（ANDROID_APP.live）。Google Play のページは公開するまで開けない。
// ⚠ まだ1件も記帳していない人には出さない。「まず1件記帳する」を邪魔しない。
// ⚠ 他のモーダルと重ねない（Modal は body の overflow を書き換える）。重なりそうなときは
//    キーを書かずに見送り、次回また試す。IosPromoModal と同時に出ようとした場合もここで片方が退く。
export default function AndroidPromoModal({ guestMode, blocked }) {
  const { journals, loading } = useData();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!ANDROID_APP.live || open || loading || blocked) return undefined;
    if (!journals.length) return undefined;
    if (isIos() || localStorage.getItem(KEY)) return undefined;
    // 起動直後は間を置く。IosPromoModal(2秒)より少し遅らせ、先に出ている側を優先する。
    const timer = setTimeout(() => {
      if (document.querySelector('.mo.open')) return;
      localStorage.setItem(KEY, '1');
      setOpen(true);
      track('android_promo_shown');
    }, 3000);
    return () => clearTimeout(timer);
  }, [open, loading, blocked, journals.length]);

  const close = () => setOpen(false);
  const go = () => { track('android_promo_click'); close(); };

  return (
    <Modal
      open={open}
      onClose={close}
      title="📱 Androidアプリができました"
      footer={(
        <>
          <button className="btn btn-g" onClick={close}>あとで</button>
          <a className="btn btn-p" href={ANDROID_APP.url} target="_blank" rel="noopener noreferrer"
            onClick={go} style={{ textDecoration: 'none' }}>
            Google Play で見る
          </a>
        </>
      )}
    >
      <p style={{ fontSize: 13, color: 'var(--tx2)', lineHeight: 1.8, margin: 0 }}>
        Google Play で「黒福簿」を公開しました。
        {guestMode
          ? 'アプリはアカウントでのログインが必要です。'
          : 'いまお使いのアカウントでログインすれば、同じ帳簿がそのまま見られます。'}
      </p>
      <ul style={{ margin: '12px 0 0', paddingLeft: 18, lineHeight: 1.9, fontSize: 13, color: 'var(--tx2)' }}>
        <li><strong>レシートを撮って記帳。</strong>文字の読み取りは端末の中だけで行い、写真も読み取り結果も外部には送りません</li>
        <li><strong>電波がなくても記帳できます。</strong>つながったときに自動で同期します</li>
        <li><strong>指紋・顔認証などでロックできます</strong></li>
      </ul>
      {guestMode && (
        <p style={{
          fontSize: 12.5, lineHeight: 1.8, marginTop: 12, padding: '8px 12px',
          background: 'var(--warn)', border: '1px solid var(--ac)', borderRadius: 7, color: 'var(--ac)',
        }}>
          ゲストのままだと、この端末に保存されているデータはアプリに引き継がれません。
          先に無料アカウントを作成してからインストールしてください。
        </p>
      )}
      <p style={{ fontSize: 12, color: 'var(--tx3)', marginTop: 12, marginBottom: 0 }}>
        ブラウザ版もこれまでどおりお使いいただけます。
      </p>
    </Modal>
  );
}
