import Modal from '../Common/Modal';

// 「はじめかた」のチュートリアル選択メニュー（A〜F）。
const CATALOG = [
  { cat: 'はじめる', items: [
    { id: 'firstRun', name: 'はじめてのツアー', desc: '口座登録→記帳→純資産まで30秒で体験' },
    { id: 'guestReg', name: 'ゲストから登録（データ引き継ぎ）', desc: '体験データを失わず登録する' },
  ] },
  { cat: '記帳を覚える', items: [
    { id: 'journalDetail', name: '仕訳入力を詳しく見る', desc: '一行入力・かんたん/詳細・プリセット・タグまで一通り' },
    { id: 'simple', name: 'かんたんモードで記録', desc: '支出/収入/振替を選ぶだけ' },
    { id: 'preset', name: 'プリセットでワンタップ記帳', desc: 'よく使う取引を一発入力' },
    { id: 'credit', name: 'クレジットカードの記帳', desc: '利用→引落、二重計上を防ぐ' },
    { id: 'accounts', name: '口座（科目）を整える', desc: '自分の口座・カードを登録' },
    { id: 'recurring', name: '定期取引（家賃・サブスク）', desc: '固定費をまとめて記帳' },
    { id: 'tags', name: 'タグで分類・集計', desc: 'タグ付けして集計' },
  ] },
  { cat: '「見る」を学ぶ', items: [
    { id: 'networthTrend', name: '純資産の推移を読む', desc: '増えているかを1本の線で' },
    { id: 'dashboard', name: 'ダッシュボードの使い方', desc: 'KPI・円グラフ・期間・マスク' },
    { id: 'bs', name: '貸借対照表(BS)の読み方', desc: '資産・負債・純資産のバランス' },
    { id: 'pl', name: '損益計算書(PL)の読み方', desc: '期間の収支' },
  ] },
  { cat: '乗り換え・取り込み', items: [
    { id: 'csv', name: 'CSVで他社から取り込み', desc: 'MF/Zaimも自動判定' },
    { id: 'backup', name: 'バックアップ（書き出し/取り込み）', desc: 'データを自分で持つ' },
  ] },
  { cat: '安心・プライバシー', items: [
    { id: 'e2e', name: 'E2E暗号化を有効化', desc: 'リカバリキー保存まで誘導' },
  ] },
  { cat: '投資・副業向け', items: [
    { id: 'invest', name: 'NISA・iDeCo・証券を含める', desc: '評価額の入れ方・更新ペース' },
    { id: 'sidejob', name: '副業の事業とプライベートを分ける', desc: '記帳の分け方' },
  ] },
];

export default function TutorialMenu({ open, onClose, onStart }) {
  return (
    <Modal open={open} onClose={onClose} title="はじめかた — チュートリアル"
      footer={<button className="btn btn-g" onClick={onClose}>閉じる</button>}>
      <p style={{ fontSize: 12.5, color: 'var(--tx2)', lineHeight: 1.7, margin: '0 0 14px' }}>
        やりたいことから選んで、実画面を触りながら覚えられます。
      </p>
      <div style={{ display: 'grid', gap: 16 }}>
        {CATALOG.map((g) => (
          <div key={g.cat}>
            <div style={{ fontSize: 11, letterSpacing: '.08em', color: 'var(--tx3)', fontWeight: 800, marginBottom: 8 }}>{g.cat}</div>
            <div style={{ display: 'grid', gap: 8 }}>
              {g.items.map((it) => (
                <div key={it.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  border: '1px solid var(--bd)', borderRadius: 8, padding: '10px 12px',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700 }}>{it.name}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--tx3)' }}>{it.desc}</div>
                  </div>
                  <button className="btn btn-p btn-s" onClick={() => onStart(it.id)}>始める →</button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
