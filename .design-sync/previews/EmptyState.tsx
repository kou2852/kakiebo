import { EmptyState } from 'kakeibo-frontend';

// 仕訳ゼロ件の案内（CTA付き）
export const NoJournals = () => (
  <div data-theme="light" style={{ background: 'var(--bg1)', padding: 8 }}>
    <EmptyState
      icon="📝"
      title="まだ仕訳がありません"
      desc="最初の取引を記帳すると、ここに一覧が表示されます。「記帳する」から始めましょう。"
      action={<button className="btn btn-p">記帳する</button>}
    />
  </div>
);

// 口座ゼロ件の案内
export const NoAccounts = () => (
  <div data-theme="light" style={{ background: 'var(--bg1)', padding: 8 }}>
    <EmptyState
      icon="🏦"
      title="口座がまだありません"
      desc="銀行口座やクレジットカードを登録すると、残高と純資産が見えるようになります。"
      action={<button className="btn btn-g">＋ 口座を追加</button>}
    />
  </div>
);
