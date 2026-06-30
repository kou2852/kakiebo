import { InfoTip } from 'kakeibo-frontend';

// 見出しの隣に置く用語補足（? にホバー/フォーカスで吹き出し）
export const InLabel = () => (
  <div data-theme="light" style={{ padding: 20, background: 'var(--bg1)' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, fontWeight: 700, color: 'var(--tx)' }}>
      <span>純資産</span>
      <InfoTip text="資産から負債を引いた、家計の正味の価値です。収支よりこの数字が大事。" />
    </div>
  </div>
);

// フォーム項目ラベルでの利用
export const FieldLabel = () => (
  <div data-theme="light" style={{ padding: 20, background: 'var(--bg1)' }}>
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--tx2)' }}>
      締め日（毎月）
      <InfoTip text="クレジットカードの利用が締められる日。翌月の引落日と組み合わせて計算します。" />
    </label>
  </div>
);
