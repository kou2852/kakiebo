import { useEffect, useRef, useState, useCallback } from 'react';
import { useUI } from '../../contexts/UIContext';
import { useData } from '../../contexts/DataContext';

// 実画面をスポットライトで指して操作を誘導するツアー（依存ゼロ）。複数ツアーをIDで切替。
// ハイブリッド進行：ナビ/記帳ステップは「実際に操作したら自動で次へ」、他は「次へ」。
export const TOURS = {
  firstRun: {
    label: 'はじめてのツアー',
    steps: [
      { key: 'welcome', center: true, title: 'kurofukubo へようこそ 👋',
        body: '“純資産まで見える家計簿”を、実際に画面を触りながら30秒で体験しましょう。' },
      { key: 'nav-journal', target: '[data-tour="nav-journal"]', page: 'journal', nav: true,
        title: '① まずは「仕訳入力」へ', body: 'ここから記帳します。左の「仕訳入力」をクリックして開いてみましょう。' },
      { key: 'quick-input', target: '[data-tour="quick-input"]', page: 'journal',
        title: '② 残高を一行で入力', body: '「普通預金 1800000 元入金」のように、いまある残高を一行打つだけ。' },
      { key: 'quick-submit', target: '[data-tour="quick-submit"]', page: 'journal', awaitJournal: true,
        title: '③ 記帳してみる', body: '「記帳」を押すと複式仕訳が自動で作られます。実際に押してみましょう！' },
      { key: 'nav-dashboard', target: '[data-tour="nav-dashboard"]', page: 'dashboard', nav: true,
        title: '④ ダッシュボードへ', body: '記録したお金が全体像になって表示されます。「ダッシュボード」をクリック。' },
      { key: 'networth', target: '[data-tour="networth"]', page: 'dashboard',
        title: '⑤ これがあなたの純資産', body: '資産−負債の“正味”。記帳するほど自動で更新されます 📈' },
      { key: 'done', center: true, title: '準備OK！🎉',
        body: 'あとは自由に記帳するだけ。詳しい使い方は左の「はじめかた」からいつでも見られます。' },
    ],
  },
  simple: {
    label: 'かんたんモードで記録',
    steps: [
      { key: 's-nav', target: '[data-tour="nav-journal"]', page: 'journal', nav: true,
        title: '「仕訳入力」を開く', body: '記帳はここから。クリックして開きましょう。' },
      { key: 's-mode', target: '[data-tour="entry-mode"]', page: 'journal',
        title: '「かんたん」を選ぶ', body: '支出/収入/振替を選んで、費目・金額・支払い方法を選ぶだけ。借方・貸方は裏側で自動変換されます。' },
      { key: 's-done', center: true, title: 'これでOK 🎉',
        body: '簿記の知識がなくても記録できます。慣れたら「詳細（借方・貸方）」も使えます。' },
    ],
  },
  preset: {
    label: 'プリセットでワンタップ記帳',
    steps: [
      { key: 'p-nav', target: '[data-tour="nav-journal"]', page: 'journal', nav: true,
        title: '「仕訳入力」を開く', body: 'クリックして開きましょう。' },
      { key: 'p-chips', target: '[data-tour="presets"]', page: 'journal',
        title: 'プリセットから記帳', body: 'よく使う取引はワンタップで入力欄に反映されます。チップを押すだけ。' },
      { key: 'p-done', center: true, title: '便利です 🎉',
        body: 'よく使うパターンをプリセット化すると、毎回の入力が一瞬になります。' },
    ],
  },
  guestReg: {
    label: 'ゲストから登録（データ引き継ぎ）',
    steps: [
      { key: 'g-reg', target: '[data-tour="register"]', title: 'ゲストのデータを守る',
        body: 'ゲストのデータはこの端末だけ。「無料で登録」するとクラウド保存＋別端末でも使え、いまのデータもそのまま引き継がれます。' },
      { key: 'g-done', center: true, title: 'いつでもどうぞ 🎉', body: '気に入ったら「無料で登録」へ。ゲストのまま使い続けることもできます。' },
    ],
  },
  credit: {
    label: 'クレジットカードの記帳',
    steps: [
      { key: 'cr-nav', target: '[data-tour="nav-credit"]', page: 'credit', nav: true, title: '「クレジット」を開く', body: 'クリックして開きましょう。' },
      { key: 'cr-explain', center: true, page: 'credit', title: '利用→引落の2段階で記帳',
        body: 'クレカは「買ったとき（費目／カード）」と「引き落とされたとき（カード／預金）」を分けて記帳します。この画面で利用状況・引落予定が見え、二重計上を防げます。' },
    ],
  },
  accounts: {
    label: '口座（科目）を整える',
    steps: [
      { key: 'ac-nav', target: '[data-tour="nav-accounts"]', page: 'accounts', nav: true, title: '「勘定科目・口座」を開く', body: 'クリックして開きましょう。' },
      { key: 'ac-explain', center: true, page: 'accounts', title: '使う口座を登録',
        body: '現金・銀行・カードなど、お金が出入りする場所を登録します。「テンプレから追加」でNISA口座・ローン等も簡単に。最初は1〜2個でOK。' },
    ],
  },
  recurring: {
    label: '定期取引（家賃・サブスク）',
    steps: [
      { key: 'rc-nav', target: '[data-tour="nav-recurring"]', page: 'recurring', nav: true, title: '「定期取引」を開く', body: 'クリックして開きましょう。' },
      { key: 'rc-explain', center: true, page: 'recurring', title: '固定費をまとめて記帳',
        body: '家賃やサブスクなど毎月の固定費を登録。「未生成分を一括生成」で、期日が来た分をまとめて記帳できます。' },
    ],
  },
  tags: {
    label: 'タグで分類・集計',
    steps: [
      { key: 'tg-nav', target: '[data-tour="nav-tags"]', page: 'tags', nav: true, title: '「タグ・配分」を開く', body: 'クリックして開きましょう。' },
      { key: 'tg-explain', center: true, page: 'tags', title: '費目をまたいで集計',
        body: 'タグを付けると「旅行」「推し活」など費目をまたいだ集計ができます。仕訳入力でタグを選ぶだけ。' },
    ],
  },
  networthTrend: {
    label: '純資産の推移を読む',
    steps: [
      { key: 'nt-nav', target: '[data-tour="nav-dashboard"]', page: 'dashboard', nav: true, title: '「ダッシュボード」へ', body: 'クリックして開きましょう。' },
      { key: 'nt-chart', target: '[data-tour="nw-trend"]', page: 'dashboard', title: '純資産の推移グラフ',
        body: '「今いくら」より「増えているか」。直近6ヶ月末の純資産が一目です。右肩上がりを目指しましょう 📈' },
    ],
  },
  bs: {
    label: '貸借対照表(BS)の読み方',
    steps: [
      { key: 'bs-nav', target: '[data-tour="nav-bs"]', page: 'bs', nav: true, title: '「貸借対照表(BS)」を開く', body: 'クリックして開きましょう。' },
      { key: 'bs-explain', center: true, page: 'bs', title: '資産・負債・純資産のバランス',
        body: '左に資産、右に負債と純資産。純資産＝資産−負債。家計の「いま持っている正味」がひと目で分かります。' },
    ],
  },
  pl: {
    label: '損益計算書(PL)の読み方',
    steps: [
      { key: 'pl-nav', target: '[data-tour="nav-pl"]', page: 'pl', nav: true, title: '「損益計算書(PL)」を開く', body: 'クリックして開きましょう。' },
      { key: 'pl-explain', center: true, page: 'pl', title: '期間の収入・支出・収支',
        body: '一定期間の収入・支出とその差（収支）がまとまります。上の期間バーで集計範囲を切り替えられます。' },
    ],
  },
  dashboard: {
    label: 'ダッシュボードの使い方',
    steps: [
      { key: 'db-nav', target: '[data-tour="nav-dashboard"]', page: 'dashboard', nav: true, title: '「ダッシュボード」へ', body: 'クリックして開きましょう。' },
      { key: 'db-kpi', target: '[data-tour="networth"]', page: 'dashboard', title: '全体のKPI',
        body: '純資産・総資産・負債・収支がひと目で。各「非表示」で金額を隠せます（人前で安心）。' },
      { key: 'db-done', center: true, page: 'dashboard', title: 'もっと見る',
        body: '下の円グラフで資産構成・収支内訳、上の期間バーで集計範囲を切り替えできます。' },
    ],
  },
  csv: {
    label: 'CSVで他社から取り込み',
    steps: [
      { key: 'cs-nav', target: '[data-tour="nav-journal"]', page: 'journal', nav: true, title: '「仕訳入力」へ', body: 'クリックして開きましょう。' },
      { key: 'cs-btn', target: '[data-tour="csv-btn"]', page: 'journal', title: 'CSVで取り込み',
        body: '銀行・カードの明細、マネーフォワード/ZaimのCSVも自動判定して取り込めます。費目・口座を科目に割り当てるだけ。' },
    ],
  },
  backup: {
    label: 'バックアップ（書き出し/取り込み）',
    steps: [
      { key: 'bk-nav', target: '[data-tour="nav-settings"]', page: 'settings', nav: true, title: '「設定」を開く', body: 'クリックして開きましょう。' },
      { key: 'bk-exp', target: '[data-tour="backup"]', page: 'settings', title: 'データは自分で持つ',
        body: '全データをJSONで書き出し/取り込みできます。データの所有権はあなたに。定期的な保存が安心です。' },
    ],
  },
  e2e: {
    label: 'E2E暗号化を有効化',
    steps: [
      { key: 'e-nav', target: '[data-tour="nav-settings"]', page: 'settings', nav: true, title: '「設定」を開く', body: 'クリックして開きましょう。' },
      { key: 'e-panel', target: '[data-tour="e2e"]', page: 'settings', title: '運営者にも見えない暗号化',
        body: '有効にすると、運営者にも中身が見えないE2E暗号化に。⚠️有効化後は「リカバリキー」を必ず保存してください（パスを忘れると復元できません）。' },
    ],
  },
  invest: {
    label: 'NISA・iDeCo・証券を含める',
    steps: [
      { key: 'iv-nav', target: '[data-tour="nav-accounts"]', page: 'accounts', nav: true, title: '「勘定科目・口座」へ', body: 'クリックして開きましょう。' },
      { key: 'iv-explain', center: true, page: 'accounts', title: '投資も純資産に',
        body: 'NISA・iDeCo・証券は資産科目として登録（テンプレあり）。評価額を月1回ほど更新すれば、含み益も込みで純資産に反映されます。' },
    ],
  },
  sidejob: {
    label: '副業の事業とプライベートを分ける',
    steps: [
      { key: 'sj-nav', target: '[data-tour="nav-tags"]', page: 'tags', nav: true, title: '「タグ・配分」へ', body: 'クリックして開きましょう。' },
      { key: 'sj-explain', center: true, page: 'tags', title: '事業とプライベートを分離',
        body: '「事業用」タグや専用科目で分けると、プライベートと混ざらず集計できます（確定申告の集計に便利）。' },
    ],
  },
};

export default function Tour({ tourId, onClose, onNavigate, onOpenSidebar }) {
  const { currentPage } = useUI();
  const { journals } = useData();
  const steps = (TOURS[tourId] || TOURS.firstRun).steps;
  const [i, setI] = useState(0);
  const [rect, setRect] = useState(null);
  const journalsAtStep = useRef(0);
  const open = !!tourId;
  const step = steps[i] || steps[0];
  const last = i >= steps.length - 1;

  const next = useCallback(() => setI((v) => Math.min(steps.length - 1, v + 1)), [steps.length]);
  const prev = useCallback(() => setI((v) => Math.max(0, v - 1)), []);
  const nextOrFinish = () => { if (last) onClose(); else next(); };

  // ツアー切替時は先頭から
  useEffect(() => { setI(0); }, [tourId]);

  // ステップ開始：コンテンツ系は対象ページへ移動／ナビ系はサイドバーを開く。記帳数を記録。
  useEffect(() => {
    if (!open) return;
    const s = steps[i];
    if (!s.nav && s.page && s.page !== currentPage) onNavigate(s.page);
    if (s.nav && onOpenSidebar) onOpenSidebar();
    journalsAtStep.current = journals.length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, i, tourId]);

  // ナビ系：対象ページに変わったら自動で次へ（ユーザーがクリック）
  useEffect(() => {
    if (!open) return;
    const s = steps[i];
    if (s.nav && currentPage === s.page) {
      const t = setTimeout(() => setI((v) => (v === i ? v + 1 : v)), 300);
      return () => clearTimeout(t);
    }
  }, [open, i, currentPage, steps]);

  // 記帳系：journals が増えたら自動で次へ
  useEffect(() => {
    if (!open) return;
    if (steps[i].awaitJournal && journals.length > journalsAtStep.current) next();
  }, [open, i, journals, next, steps]);

  // 対象要素を探してスポットライト位置を決定（遷移後のマウントを待つ）
  useEffect(() => {
    if (!open) return;
    const s = steps[i];
    if (s.center) { setRect(null); return; }
    let timer, tries = 0, detach = () => {};
    const find = () => {
      const el = document.querySelector(s.target);
      if (el && el.getBoundingClientRect().width > 0) {
        el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
        const update = () => setRect(el.getBoundingClientRect());
        update();
        timer = setTimeout(update, 260);
        window.addEventListener('scroll', update, true);
        window.addEventListener('resize', update);
        detach = () => { window.removeEventListener('scroll', update, true); window.removeEventListener('resize', update); };
      } else if (tries++ < 36) {
        timer = setTimeout(find, 80);
      } else { setRect(null); }
    };
    find();
    return () => { clearTimeout(timer); detach(); };
  }, [open, i, currentPage, steps]);

  if (!open) return null;

  const W = 330;
  let pop;
  if (!rect) {
    pop = { top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: W };
  } else {
    const left = Math.min(Math.max(12, rect.left + rect.width / 2 - W / 2), window.innerWidth - W - 12);
    pop = (window.innerHeight - rect.bottom > 210)
      ? { top: rect.bottom + 12, left, width: W }
      : { bottom: window.innerHeight - rect.top + 12, left, width: W };
  }

  return (
    <>
      {rect ? (
        <div style={{
          position: 'fixed', top: rect.top - 6, left: rect.left - 6,
          width: rect.width + 12, height: rect.height + 12, borderRadius: 12,
          boxShadow: '0 0 0 9999px rgba(15,23,30,.55)', border: '2px solid var(--ac)',
          pointerEvents: 'none', zIndex: 9998, transition: 'all .2s ease',
        }} />
      ) : (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,30,.55)', pointerEvents: 'none', zIndex: 9998 }} />
      )}

      <div style={{
        position: 'fixed', ...pop, zIndex: 9999,
        background: 'var(--bg2)', color: 'var(--tx)', border: '1px solid var(--bd)',
        borderRadius: 12, boxShadow: '0 18px 50px -12px rgba(13,30,40,.45)', padding: '16px 18px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 11, color: 'var(--tx3)', fontWeight: 700 }}>ガイドツアー {i + 1}/{steps.length}</span>
          <button onClick={onClose} aria-label="閉じる" style={{ background: 'none', border: 'none', color: 'var(--tx3)', fontSize: 16, lineHeight: 1, cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 6 }}>{step.title}</div>
        <p style={{ fontSize: 13, color: 'var(--tx2)', lineHeight: 1.7, margin: '0 0 14px' }}>{step.body}</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="btn btn-g btn-s" onClick={onClose}>スキップ</button>
          <div style={{ flex: 1 }} />
          {i > 0 && <button className="btn btn-g btn-s" onClick={prev}>← 戻る</button>}
          <button className="btn btn-p btn-s" onClick={nextOrFinish}>{last ? '完了' : '次へ →'}</button>
        </div>
      </div>
    </>
  );
}
