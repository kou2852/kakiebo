import { useEffect, useState } from 'react';
import { IOS_APP } from '../../config/release';
import { useData } from '../../contexts/DataContext';
import { track } from '../../utils/track';
import Modal from './Modal';

// 既読キーは公開前と公開後で分ける。公開前に「準備中」を見た人にも、
// 公開したときにもう一度知らせたいため。1つにすると片方しか出ない。
const KEY_SOON = 'kk_ios_soon';
const KEY_LIVE = 'kk_ios_promo';

// 実機のスクリーンショット（App Store に出したものと同じ）。public/ 配下。
const SHOTS = [
  { src: '/ios-dashboard.webp', alt: 'iPhoneアプリのダッシュボード。純資産と今月の収支、支出内訳が表示されている' },
  { src: '/ios-entry.webp', alt: 'iPhoneアプリの記帳画面。レシートを撮って記帳する導線がある' },
];

// iPhoneアプリの案内。このブラウザで1回だけ出す。
//
// ⚠ 公開前は App Store へのリンクを出さない。未公開IDは 404 を返すので、
//    リンクを置いた時点で死んだリンクを見せることになる。
//    公開前にできるのは「先にアカウントを作っておいてもらう」ところまで。
// ⚠ まだ1件も記帳していない人には出さない。使い始める前に案内を被せると、
//    本来やってほしい「まず1件記帳する」を邪魔して離脱の原因になる。
// ⚠ 他のモーダルと重ねない。Modal は body の overflow を書き換えるので、
//    2つ開くと片方を閉じた時点でスクロールロックが外れ、背面が動いてしまう。
//    重なりそうなときは出さずに見送る（キーを書かないので次回また試す）。
export default function IosPromoModal({ guestMode, blocked }) {
  const { journals, loading } = useData();
  const [open, setOpen] = useState(false);
  const live = IOS_APP.live;
  const key = live ? KEY_LIVE : KEY_SOON;

  useEffect(() => {
    if (open || loading || blocked) return;
    if (!journals.length) return;
    if (localStorage.getItem(key)) return;
    // 起動直後は間を置く。読み込み途中の一瞬の状態で開くのを防ぐ。
    const timer = setTimeout(() => {
      if (document.querySelector('.mo.open')) return; // 別のモーダルが出ている
      localStorage.setItem(key, '1');
      setOpen(true);
      track(live ? 'ios_promo_shown' : 'ios_soon_shown');
    }, 2000);
    return () => clearTimeout(timer);
  }, [open, loading, blocked, journals.length, key, live]);

  const close = () => setOpen(false);
  const go = () => { track('ios_promo_click'); close(); };

  return (
    <Modal
      open={open}
      onClose={close}
      title={live ? '📱 iPhoneアプリができました' : '📱 iPhoneアプリをまもなく公開します'}
      footer={live ? (
        <>
          <button className="btn btn-g" onClick={close}>あとで</button>
          {/* a要素なので既定の下線が出る。フッターの他のボタンと見た目を揃える。 */}
          <a className="btn btn-p" href={IOS_APP.url} target="_blank" rel="noopener noreferrer"
            onClick={go} style={{ textDecoration: 'none' }}>
            App Store で見る
          </a>
        </>
      ) : (
        <button className="btn btn-p" onClick={close}>わかりました</button>
      )}
    >
      {/* 端末の枠は描かない。暗い枠はダークテーマの背景に沈むうえ、
          この大きさでは枠のほうが目立ってしまう。境界線だけ引く。 */}
      <div style={{ display: 'flex', gap: 14, justifyContent: 'center', margin: '2px 0 16px' }}>
        {SHOTS.map((sh) => (
          <img key={sh.src} src={sh.src} alt={sh.alt} width="700" height="1515" loading="lazy"
            style={{
              // 狭い画面では写真が場所を取りすぎるので、幅に応じて縮める
              width: 'min(115px, 26vw)', height: 'auto', display: 'block', borderRadius: 12,
              border: '1px solid var(--bd2)', boxShadow: '0 10px 22px -14px rgba(20,24,40,.5)',
            }} />
        ))}
      </div>
      <p style={{ fontSize: 13, color: 'var(--tx2)', lineHeight: 1.8, margin: 0 }}>
        {live
          ? 'App Store で「黒福簿」を公開しました。'
          : 'iPhone版を作っていました。いまApp Storeの審査中です。'}
        {guestMode
          ? 'アプリはアカウントでのログインが必要です。'
          : live
            ? 'いまお使いのアカウントでログインすれば、同じ帳簿がそのまま見られます。'
            : 'いまお使いのアカウントでログインすれば、同じ帳簿がそのまま見られるようになります。'}
      </p>
      <ul style={{ margin: '12px 0 0', paddingLeft: 18, lineHeight: 1.9, fontSize: 13, color: 'var(--tx2)' }}>
        <li><strong>レシートを撮って記帳。</strong>文字の読み取りは端末の中だけで行い、写真も読み取り結果も外部には送りません</li>
        <li><strong>電波がなくても記帳できます。</strong>つながったときに自動で同期します</li>
        <li><strong>Face ID でロックできます</strong></li>
      </ul>
      {guestMode && (
        <p style={{
          fontSize: 12.5, lineHeight: 1.8, marginTop: 12, padding: '8px 12px',
          background: 'var(--warn)', border: '1px solid var(--ac)', borderRadius: 7, color: 'var(--ac)',
        }}>
          ゲストのままだと、この端末に保存されているデータはアプリに引き継がれません。
          {live
            ? '先に無料アカウントを作成してからインストールしてください。'
            : 'いま無料アカウントを作っておくと、公開後そのままログインするだけで続きから使えます。'}
        </p>
      )}
      <p style={{ fontSize: 12, color: 'var(--tx3)', marginTop: 12, marginBottom: 0 }}>
        ブラウザ版もこれまでどおりお使いいただけます。
      </p>
    </Modal>
  );
}
