import { useEffect, useRef, useState, useCallback } from 'react';
import { useUI } from '../../contexts/UIContext';
import { useData } from '../../contexts/DataContext';
import { track } from '../../utils/track';

// 実画面をスポットライトで指して操作を誘導するツアー（依存ゼロ）。複数ツアーをIDで切替。
// ハイブリッド進行：ナビ/記帳ステップは「実際に操作したら自動で次へ」、他は「次へ」。
export const TOURS = {
  firstRun: {
    label: 'はじめてのツアー',
    steps: [
      { key: 'welcome', center: true, title: 'kurofukubo へようこそ 👋',
        body: 'あなたの口座を1つ登録して、“純資産まで見える家計簿”を30秒で体験しましょう。数字は自分のものなので、実感が持てるはずです。' },
      // 記帳ゲート：かんたん登録から口座を1つ実際に追加してもらう（残高込みなら即・純資産に反映）
      { key: 'account-add', target: '[data-tour="quick-account"]', page: 'accounts', awaitAccount: true, softGate: true,
        title: '① あなたの口座を1つ登録', body: '種別を選んで、名前と残高を入れるだけで登録できます。残高は任意です。登録せずに「次へ」から進んでも問題ありません。' },
      { key: 'networth', target: '[data-tour="networth"]', page: 'dashboard',
        title: '② これがあなたの純資産', body: '資産−負債の“正味”。いま登録した口座の残高がここに反映されています。記帳するほど自動で更新されます 📈' },
      { key: 'done', center: true, title: '準備OK！🎉',
        body: '次は仕訳入力の使い方を一通り見るか、クレカ払いの記帳を体験してみましょう。詳しい使い方は左の「はじめかた」からいつでも見られます。',
        actions: [
          { label: '📖 仕訳入力を詳しく見る', tour: 'journalDetail' },
          { label: '💳 クレカ記帳を体験', tour: 'credit' },
        ] },
    ],
  },
  // 仕訳入力ページの入力方法（一行入力・かんたん/詳細・プリセット・タグ）を順番に見て回る詳細ツアー。
  // 最後は実際に1件記帳するまでをゲート（借方・貸方は初期値が入っているので金額を入れるだけでよい）。
  journalDetail: {
    label: '仕訳入力を詳しく見る',
    steps: [
      { key: 'jd-intro', center: true, page: 'journal', title: '仕訳入力には4つの方法があります',
        body: '一行入力・かんたんモード・詳細（借方/貸方）・プリセット。状況に応じて使い分けられます。順番に見ていきましょう。' },
      { key: 'jd-quick', target: '[data-tour="quick-input"]', page: 'journal', title: '① 一行で入力（最速）',
        body: '「食費 1200 現金」のように「科目 金額 支払元」の順で書くと、複式仕訳に自動変換されます。慣れると一番速い方法です。' },
      { key: 'jd-mode', target: '[data-tour="entry-mode"]', page: 'journal', title: '② かんたん / 詳細を選べる',
        body: '「かんたん」は支出/収入/振替から選ぶだけ。「詳細」は借方・貸方を自分で指定します。簿記に慣れていなければ、かんたんで十分です。' },
      { key: 'jd-presets', target: '[data-tour="presets"]', page: 'journal', title: '③ プリセットでワンタップ',
        body: 'よく使う取引はチップをタップするだけで入力欄に反映されます。毎日の記帳がぐっと速くなります。' },
      { key: 'jd-tags', target: '[data-tour="entry-tags"]', page: 'journal', forceMode: 'detail', title: '④ タグで分類できる',
        body: '「詳細」モードでは記帳のたびにタグを付けられます。旅行・推し活など、費目をまたいだ集計に便利です。' },
      { key: 'jd-accounts', target: '[data-tour="detail-entry"]', page: 'journal', forceMode: 'detail',
        title: '⑤ 借方・貸方の科目を選ぶ', body: '借方・貸方の科目は初期値のままでOK。変更する場合はドロップダウンから選べます。この説明のため詳細（借方・貸方）モードに切り替えましたが、同じ記帳はかんたんモードでもできます。' },
      // 行動ゲート：借方・貸方には初期値が入っているので、金額を入れて押すだけで済む
      { key: 'jd-submit', target: '[data-tour="detail-amount"]', page: 'journal', awaitJournal: true, forceMode: 'detail',
        title: '⑥ 金額を入れて記帳する', body: 'ハイライトされた金額欄に入力して「記帳する」を押してみましょう。' },
      { key: 'jd-done', center: true, title: '仕訳入力はこれで一通りです 🎉',
        body: 'どの方法で記帳しても、複式仕訳として正しく記録されます。自分に合う方法を使ってください。' },
    ],
  },
  simple: {
    label: 'かんたんモードで記録',
    steps: [
      // 行動ゲート：かんたんモードに自動切替し、実際に支出を1件記帳してもらう
      { key: 's-entry', target: '[data-tour="simple-amount"]', page: 'journal', awaitJournal: true, forceMode: 'simple',
        title: '① 今日の支出を1件記録', body: '支出/収入/振替を選んで、費目・金額・支払い方法を選ぶだけ。借方・貸方は裏側で自動変換されます。ハイライトされた金額欄に入力して「記帳する」を押してみましょう。' },
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
      // 行動ゲート：プリセットからカード払いを実際に1件記帳してもらう
      { key: 'cr-preset', target: '[data-tour="presets"]', page: 'journal', awaitJournal: true,
        title: '① カード払いを1件記帳', body: '「食費（カード払い）」チップを押すと入力欄に反映されます。金額を入れて「記帳」を押してみましょう（例の金額のままでもOK）。' },
      { key: 'cr-view', center: true, page: 'credit', title: '② 利用→引落の2段階で記帳',
        body: 'いまの記帳は「買ったとき（費目／カード）」。引き落とし日には「カード／預金」の記帳で精算します。この画面で利用状況・引落予定が見え、二重計上を防げます 🎉' },
    ],
  },
  accounts: {
    label: '口座（科目）を整える',
    steps: [
      // 行動ゲート：テンプレから実際に口座を1つ追加してもらう
      { key: 'ac-tpl', target: '[data-tour="acct-templates"]', page: 'accounts', awaitAccount: true,
        title: '① テンプレから口座を追加', body: '銀行口座・カード・NISA・ローンなどをワンタップで追加できます。使っているものを1つ選んで保存してみましょう。' },
      { key: 'ac-done', center: true, page: 'accounts', title: '登録できました 🎉',
        body: '口座が増えるほど純資産が正確になります。次はカード払いの記帳も体験してみましょう。',
        actions: [{ label: '💳 クレカ記帳を体験', tour: 'credit' }] },
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

export default function Tour({ tourId, onClose, onNavigate, onOpenSidebar, onStartTour }) {
  const { currentPage } = useUI();
  const { journals, accounts, loadSampleData, sampleAvailable } = useData();
  const steps = (TOURS[tourId] || TOURS.firstRun).steps;
  const [i, setI] = useState(0);
  const [rect, setRect] = useState(null);
  const [docked, setDocked] = useState(false); // アプリ側のモーダルが開いている間は吹き出しを上部へ退避
  const journalsAtStep = useRef(0);
  const accountsAtStep = useRef(0);
  const journalsAtTourStart = useRef(0);
  const open = !!tourId;
  const step = steps[i] || steps[0];
  const last = i >= steps.length - 1;
  // 記帳/追加を行うと自動で進むステップ
  const gated = !!(step.awaitJournal || step.awaitAccount);

  const next = useCallback(() => setI((v) => Math.min(steps.length - 1, v + 1)), [steps.length]);
  const prev = useCallback(() => setI((v) => Math.max(0, v - 1)), []);
  // 計測はイベント名のみ（完走 tour_done(_acted) / 離脱 tour_skip_<step> / 進行 tour_step_<step>）。家計データは送らない。firstRunのみ。
  const finish = () => {
    if (tourId === 'firstRun') {
      // ツアー中に実際に記帳したかで完走イベントを分ける（偽の完走を区別）
      track(journals.length > journalsAtTourStart.current ? 'tour_done_acted' : 'tour_done');
    }
    onClose();
  };
  const nextOrFinish = () => { if (last) finish(); else next(); };
  const handleClose = () => {
    if (tourId === 'firstRun') {
      if (last) { finish(); return; }
      track('tour_skip_' + step.key);
    }
    onClose();
  };
  // 完了ステップの連鎖ボタン：firstRunの完走を記録してから次のツアーへ
  const chainTo = (t) => {
    if (tourId === 'firstRun') track(journals.length > journalsAtTourStart.current ? 'tour_done_acted' : 'tour_done');
    if (onStartTour) onStartTour(t); else onClose();
  };
  // 「サンプルで見る」：数か月分のサンプル仕訳を投入し、純資産ステップへジャンプ
  const trySample = () => {
    loadSampleData();
    onNavigate('dashboard');
    track('tour_sample');
    const idx = steps.findIndex((s) => s.key === 'networth');
    if (idx >= 0) setI(idx);
  };
  const showSample = step.key === 'welcome' && sampleAvailable && journals.length === 0;

  // ツアー切替時は先頭から。開始時点の記帳数を控える（完走イベントの区別用）
  useEffect(() => { setI(0); journalsAtTourStart.current = journals.length; /* eslint-disable-line react-hooks/exhaustive-deps */ }, [tourId]);

  // ステップ開始：コンテンツ系は対象ページへ移動／ナビ系はサイドバーを開く。記帳数・科目数を記録＋進行計測。
  useEffect(() => {
    if (!open) return;
    const s = steps[i];
    if (!s) return; // ツアー連鎖直後は i がリセット前に旧値のまま来ることがある
    if (!s.nav && s.page && s.page !== currentPage) onNavigate(s.page);
    if (s.nav && onOpenSidebar) onOpenSidebar();
    journalsAtStep.current = journals.length;
    accountsAtStep.current = accounts.length;
    if (tourId === 'firstRun') track('tour_step_' + s.key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, i, tourId]);

  // ナビ系：対象ページに変わったら自動で次へ（ユーザーがクリック）
  useEffect(() => {
    if (!open) return;
    const s = steps[i];
    if (!s) return;
    if (s.nav && currentPage === s.page) {
      const t = setTimeout(() => setI((v) => (v === i ? v + 1 : v)), 300);
      return () => clearTimeout(t);
    }
  }, [open, i, currentPage, steps]);

  // 記帳系：journals が増えたら自動で次へ
  useEffect(() => {
    if (!open) return;
    if (steps[i]?.awaitJournal && journals.length > journalsAtStep.current) next();
  }, [open, i, journals, next, steps]);

  // 口座系：accounts が増えたら自動で次へ
  useEffect(() => {
    if (!open) return;
    if (steps[i]?.awaitAccount && accounts.length > accountsAtStep.current) next();
  }, [open, i, accounts, next, steps]);

  // forceMode：対象ページへの遷移確定後、対象コンポーネントが遅れてマウントしても受け取れるよう、
  // 対象が表示されるまでモード切替イベントを再送する
  useEffect(() => {
    if (!open) return;
    const s = steps[i];
    if (!(s?.forceMode && currentPage === s.page)) return;
    let timer, tries = 0;
    const applyMode = () => {
      window.dispatchEvent(new CustomEvent('kk:tour-mode', { detail: s.forceMode }));
      const target = document.querySelector(s.target);
      if (!(target && target.getBoundingClientRect().width > 0) && tries++ < 36) timer = setTimeout(applyMode, 80);
    };
    const raf = requestAnimationFrame(applyMode);
    return () => { cancelAnimationFrame(raf); clearTimeout(timer); };
  }, [open, i, currentPage, steps]);

  // ゲートステップ中にアプリのモーダル（仕訳入力・科目追加など）が開いたか監視
  useEffect(() => {
    if (!open || !gated) { setDocked(false); return; }
    const t = setInterval(() => setDocked(!!document.querySelector('.mo.open')), 300);
    return () => { clearInterval(t); setDocked(false); };
  }, [open, gated, i]);

  // 対象要素を探してスポットライト位置を決定（遷移後のマウントを待つ）。
  // モーダルが開いていて targetInModal があれば、そちらへ焦点を切り替える（例: 口座追加モーダルの残高欄）。
  useEffect(() => {
    if (!open) return;
    const s = steps[i];
    if (!s || s.center) { setRect(null); return; }
    // モーダルが開いていて、そこに焦点先が無ければ元のページ上のターゲット（隠れて位置がずれている）は探さない
    if (docked && !s.targetInModal) { setRect(null); return; }
    const selector = docked ? s.targetInModal : s.target;
    let timer, tries = 0, detach = () => {};
    const find = () => {
      const el = document.querySelector(selector);
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
  }, [open, i, currentPage, steps, docked]);

  if (!open) return null;

  const W = 330;
  let pop;
  if (rect) {
    const left = Math.min(Math.max(12, rect.left + rect.width / 2 - W / 2), window.innerWidth - W - 12);
    pop = (window.innerHeight - rect.bottom > 210)
      ? { top: rect.bottom + 12, left, width: W }
      : { bottom: window.innerHeight - rect.top + 12, left, width: W };
  } else if (docked) {
    pop = { top: 12, left: '50%', transform: 'translateX(-50%)', width: W };
  } else {
    pop = { top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: W };
  }

  return (
    <>
      {rect ? (
        docked ? (
          // モーダル内の焦点：モーダル自体の可読性を保つため、周囲を暗くせず縁取りだけで示す
          <div style={{
            position: 'fixed', top: rect.top - 4, left: rect.left - 4,
            width: rect.width + 8, height: rect.height + 8, borderRadius: 8,
            border: '2px solid var(--ac)', boxShadow: '0 0 0 3px rgba(13,148,136,.25)',
            pointerEvents: 'none', zIndex: 9998, transition: 'all .2s ease',
          }} />
        ) : (
          <div style={{
            position: 'fixed', top: rect.top - 6, left: rect.left - 6,
            width: rect.width + 12, height: rect.height + 12, borderRadius: 12,
            boxShadow: '0 0 0 9999px rgba(15,23,30,.55)', border: '2px solid var(--ac)',
            pointerEvents: 'none', zIndex: 9998, transition: 'all .2s ease',
          }} />
        )
      ) : docked ? null : (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,30,.55)', pointerEvents: 'none', zIndex: 9998 }} />
      )}

      <div style={{
        position: 'fixed', ...pop, zIndex: 9999,
        background: 'var(--bg2)', color: 'var(--tx)', border: '1px solid var(--bd)',
        borderRadius: 12, boxShadow: '0 18px 50px -12px rgba(13,30,40,.45)', padding: '16px 18px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 11, color: 'var(--tx3)', fontWeight: 700 }}>ガイドツアー {i + 1}/{steps.length}</span>
          <button onClick={handleClose} aria-label="閉じる" style={{ background: 'none', border: 'none', color: 'var(--tx3)', fontSize: 16, lineHeight: 1, cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 6 }}>{step.title}</div>
        <p style={{ fontSize: 13, color: 'var(--tx2)', lineHeight: 1.7, margin: '0 0 14px' }}>{step.body}</p>
        {step.actions && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            {step.actions.map((a) => (
              <button key={a.tour} className="btn btn-g btn-s" onClick={() => chainTo(a.tour)}>{a.label}</button>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="btn btn-g btn-s" onClick={handleClose} style={gated ? { border: 'none', background: 'none', color: 'var(--tx3)', textDecoration: 'underline' } : undefined}>
            {gated ? 'あとで' : 'スキップ'}
          </button>
          <div style={{ flex: 1 }} />
          {i > 0 && <button className="btn btn-g btn-s" onClick={prev}>← 戻る</button>}
          {showSample && <button className="btn btn-g btn-s" onClick={trySample}>📊 サンプルで見る</button>}
          <button className="btn btn-p btn-s" onClick={nextOrFinish}>{last ? '完了' : '次へ →'}</button>
        </div>
        {gated && (
          <p style={{ fontSize: 11.5, color: 'var(--tx3)', margin: '10px 0 0' }}>
            {step.awaitJournal ? '記帳すると自動で次に進みます' : '追加すると自動で次に進みます'}
          </p>
        )}
      </div>
    </>
  );
}
