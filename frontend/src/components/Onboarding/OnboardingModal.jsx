import Modal from '../Common/Modal';

const STEPS = [
  {
    n: 1, page: 'accounts', cta: '口座を登録する',
    title: '口座を登録する',
    body: '現金・銀行・クレジットカードなど、お金が出入りする場所を登録します。最初は普段使う1〜2個で十分です。',
  },
  {
    n: 2, page: 'journal', cta: '記帳してみる',
    title: '取引を記帳する',
    body: '「仕訳入力」のクイック入力で「食費 1200 現金」のように一行入力するだけ。複式簿記の仕訳が自動で作られます。',
  },
  {
    n: 3, page: 'dashboard', cta: 'ダッシュボードを見る',
    title: '全体像を見る',
    body: '記帳が増えると、資産・負債・収支や貸借対照表・損益計算書が自動で出来上がります。まずは数件入れてみましょう。',
  },
];

export default function OnboardingModal({ open, onClose, onNavigate }) {
  const go = (page) => { onNavigate(page); onClose(); };

  return (
    <Modal open={open} onClose={onClose} title="ようこそ kurofukubo へ"
      footer={<button className="btn btn-g" onClick={onClose}>あとで自分で進める</button>}>
      <p style={{ fontSize: 13, color: 'var(--tx2)', lineHeight: 1.7, marginBottom: 16 }}>
        家計簿は「複式簿記」で、お金の<strong>全体像</strong>まで見えるのが特長です。むずかしい知識は不要。
        次の3ステップではじめましょう（あとでダッシュボードの「はじめかた」からいつでも確認できます）。
      </p>

      <div style={{ display: 'grid', gap: 10 }}>
        {STEPS.map((s) => (
          <div key={s.n} style={{
            display: 'flex', gap: 12, alignItems: 'flex-start',
            border: '1px solid var(--bd)', borderRadius: 8, padding: '12px 14px',
          }}>
            <div style={{
              flexShrink: 0, width: 26, height: 26, borderRadius: '50%',
              background: 'var(--ac)', color: '#fff', fontSize: 13, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{s.n}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>{s.title}</div>
              <p style={{ fontSize: 12, color: 'var(--tx2)', lineHeight: 1.6, margin: '0 0 8px' }}>{s.body}</p>
              <button className="btn btn-p btn-s" onClick={() => go(s.page)}>{s.cta} →</button>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
