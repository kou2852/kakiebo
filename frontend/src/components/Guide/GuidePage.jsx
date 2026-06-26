import { useState } from 'react';
import { useData } from '../../contexts/DataContext';
import JournalModal from '../Journal/JournalModal';

// アプリ内の操作ガイド。既存のカード/タイポグラフィのクラスを利用。
const SECTIONS = [
  {
    h: '1. 口座を登録する',
    body: '「勘定科目・口座」から、現金・普通預金・クレジットカードなど、普段お金が出入りする場所を登録します。残高は記帳に応じて自動計算されます。最初は1〜2個で十分です。',
  },
  {
    h: '2. 取引を記帳する',
    body: '「仕訳入力」から支出・収入・振替を記録します。複式簿記なので借方・貸方が自動で一致チェックされます。簿記に不慣れでも、クイック入力（例:「コンビニ 580」）で一行入力すれば仕訳候補が自動生成されます。よく使うパターンはプリセット化できます。',
  },
  {
    h: '3. ダッシュボードで全体像を見る',
    body: '総資産・負債・純資産・収支のKPIと、資産構成/収入内訳/支出内訳の円グラフ、直近6ヶ月の推移を確認できます。期間バーで集計範囲を切り替えられます。',
  },
  {
    h: '4. 財務諸表を見る',
    body: '「貸借対照表(BS)」で資産・負債・純資産のバランス、「損益計算書(PL)」で期間の収支、「キャッシュフロー」で現金の動きを自動で確認できます。',
  },
  {
    h: '5. 予算を設定する',
    body: 'ダッシュボードの「今月の予算」カードにある「予算設定」から費目ごとの月間予算を設定すると、進捗バー・残り日数・1日あたりに使える金額・超過警告が表示され、使いすぎを防げます。',
  },
  {
    h: '6. 定期取引を登録する',
    body: '家賃やサブスクなど毎月発生する取引は「定期取引」に登録できます。「未生成分を一括生成」を押すと、期日が来た分の仕訳がまとめて記帳されます。',
  },
  {
    h: '7. 明細をCSVで取り込む',
    body: '銀行・カードの明細CSVを「CSV取込」から読み込めます。重複は自動検知され、自動分類ルールを設定すれば取込時に科目が自動で振り分けられます。',
  },
  {
    h: '8. バックアップ・移行',
    body: '「バックアップ/移行」から全データをJSON形式でエクスポート/インポートできます。データの所有権はあなたにあります。',
  },
  {
    h: 'テーマの切り替え',
    body: '左下の「テーマ切替」でライト/ダークを切り替えられます。設定はこの端末に保存されます。',
  },
];

// 仕訳チートシート（よくある取引）。dr/cr は「記帳」ボタンで初期表示する代表科目名。
const CHEATS = [
  { when: '食料品・外食を現金で', drText: '食費', crText: '現金', dr: '食費', cr: '現金' },
  { when: '買い物をカードで', drText: '食費／日用品費 など', crText: 'クレジットカード', dr: '食費', cr: 'クレジットカード' },
  { when: '給料が口座に入った', drText: '普通預金', crText: '給与収入', dr: '普通預金', cr: '給与収入' },
  { when: 'カードの引き落とし', drText: 'クレジットカード', crText: '普通預金', dr: 'クレジットカード', cr: '普通預金' },
  { when: 'ATMで現金を下ろした', drText: '現金', crText: '普通預金', dr: '現金', cr: '普通預金' },
  { when: '家賃・光熱費を口座から', drText: '住居費／光熱費', crText: '普通預金', dr: '住居費', cr: '普通預金' },
  { when: '電車・バス（現金/IC）', drText: '交通費', crText: '現金', dr: '交通費', cr: '現金' },
  { when: '医療費を払った', drText: '医療費', crText: '現金／普通預金', dr: '医療費', cr: '現金' },
  { when: 'NISA・証券を買った', drText: '有価証券', crText: '普通預金', dr: '有価証券', cr: '普通預金' },
  { when: 'ローンを返済した', drText: '借入金', crText: '普通預金', dr: '借入金', cr: '普通預金' },
  { when: '利息・配当が入った', drText: '普通預金', crText: '利子収入／雑収入', dr: '普通預金', cr: '利子収入' },
  { when: 'ポイント・キャッシュバック', drText: '現金／普通預金', crText: '雑収入', dr: '現金', cr: '雑収入' },
];

export default function GuidePage() {
  const { accounts } = useData();
  const [entry, setEntry] = useState(null);

  // チートシート行 → 該当科目を入れた仕訳入力画面（金額0=都度入力）を開く
  const openEntry = (row) => {
    const drA = accounts.find((a) => a.name === row.dr);
    const crA = accounts.find((a) => a.name === row.cr);
    setEntry({
      desc: '',
      lines: [
        { accountId: drA?.id || '', side: 'dr', amount: 0, tagId: '' },
        { accountId: crA?.id || '', side: 'cr', amount: 0, tagId: '' },
      ],
    });
  };

  return (
    <div>
      <div className="pg-header"><div className="pg-title">操作ガイド</div><div className="pg-sub">基本的な使い方を確認します</div></div>
      <p className="nd" style={{ marginBottom: 16 }}>
        kurofukubo の基本的な使い方です。はじめての方は上から順に進めるのがおすすめです。
      </p>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">まずはこの2ステップ（動画）</div>
        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', marginTop: 6 }}>
          <figure style={{ margin: 0 }}>
            <img src="/howto-1-balance.gif" alt="残高を入れる操作" loading="lazy" style={{ width: '100%', borderRadius: 8, border: '1px solid var(--bd)' }} />
            <figcaption style={{ fontSize: 12.5, color: 'var(--tx2)', marginTop: 6, lineHeight: 1.7 }}>
              <strong>① 残高を入れる</strong>：「<code>普通預金 1800000 元入金</code>」のように一行入力すると、純資産が出ます。
            </figcaption>
          </figure>
          <figure style={{ margin: 0 }}>
            <img src="/howto-2-entry.gif" alt="一行で記帳する操作" loading="lazy" style={{ width: '100%', borderRadius: 8, border: '1px solid var(--bd)' }} />
            <figcaption style={{ fontSize: 12.5, color: 'var(--tx2)', marginTop: 6, lineHeight: 1.7 }}>
              <strong>② 一行で記帳</strong>：「<code>食費 1200 現金</code>」と打つだけで、裏で複式仕訳に変換されます。
            </figcaption>
          </figure>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">仕訳チートシート（よくある取引）</div>
        <p style={{ fontSize: 12, color: 'var(--tx3)', margin: '0 0 10px', lineHeight: 1.7 }}>
          「こんなとき、借方（左）／貸方（右）に何を置くか」の早見表。クイック入力なら「<code>費目 金額 相手</code>」と一行打つだけでもOKです（例:「食費 1200 現金」）。
        </p>
        <div className="tw">
          <table>
            <thead><tr><th>こんなとき</th><th>借方（左）</th><th>貸方（右）</th><th></th></tr></thead>
            <tbody>
              {CHEATS.map((r) => (
                <tr key={r.when}>
                  <td>{r.when}</td>
                  <td>{r.drText}</td>
                  <td>{r.crText}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="btn btn-g btn-s" onClick={() => openEntry(r)}>記帳</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 8 }}>
          コツ：<strong>増えた財産・使ったお金＝借方（左）</strong>、<strong>お金の出どころ＝貸方（右）</strong>。迷ったらこの表か、仕訳入力の「プリセット」を使ってください。
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {SECTIONS.map((s) => (
          <div className="card" key={s.h}>
            <div className="card-title">{s.h}</div>
            <p style={{ color: 'var(--tx2)', fontSize: 13.5, lineHeight: 1.8 }}>{s.body}</p>
          </div>
        ))}
      </div>

      <JournalModal open={!!entry} onClose={() => setEntry(null)} preset={entry} />
    </div>
  );
}
