import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import Modal from './Modal';

const PROMO_KEY = 'kk_guest_promo';

// 上部に常時表示するゲスト誘導バナー
export function GuestBanner() {
  const { exitGuest } = useAuth();
  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 60, marginBottom: 12,
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      background: 'var(--warn)', border: '1px solid var(--ac)', borderRadius: 7,
      padding: '8px 14px', fontSize: 12, color: 'var(--ac)',
    }}>
      <span style={{ flex: 1, minWidth: 200 }}>
        🔒 ゲストモード — データはこの端末にのみ保存されます。
      </span>
      <button className="btn btn-p btn-s" data-tour="register" onClick={exitGuest}>無料で登録 →</button>
    </div>
  );
}

// ダッシュボードのKPI下に出すアカウント登録カード
export function RegisterCard() {
  const { exitGuest } = useAuth();
  return (
    <div className="card mt-10" style={{ borderColor: 'var(--ac)' }}>
      <div className="card-title">アカウント登録でデータを安全に保存</div>
      <p style={{ fontSize: 12, color: 'var(--tx2)', margin: '4px 0 10px' }}>
        ゲストのデータはこの端末のブラウザにのみ保存され、データクリアやシークレットモードで消えます。
        無料登録すると、データをクラウドに安全に保存し、他の端末とも同期できます。
      </p>
      <button className="btn btn-p" onClick={exitGuest}>無料で登録する</button>
    </div>
  );
}

// 仕訳が一定数を超えたら1回だけ登録を促すモーダル
export function GuestPromoModal() {
  const { exitGuest } = useAuth();
  const { journals } = useData();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (journals.length <= 10) return;
    if (localStorage.getItem(PROMO_KEY)) return;
    localStorage.setItem(PROMO_KEY, '1');
    setOpen(true);
  }, [journals.length]);

  return (
    <Modal open={open} onClose={() => setOpen(false)} title="データを守りませんか？"
      footer={<>
        <button className="btn btn-g" onClick={() => setOpen(false)}>あとで</button>
        <button className="btn btn-p" onClick={exitGuest}>無料で登録</button>
      </>}>
      <p style={{ fontSize: 13, color: 'var(--tx2)', lineHeight: 1.7 }}>
        記録が増えてきました。現在のデータはこの端末にのみ保存されているため、
        ブラウザのデータを消すと失われます。<br />
        無料アカウントに登録すると、これまでの入力をそのまま引き継いでクラウドに安全に保存できます。
      </p>
    </Modal>
  );
}
