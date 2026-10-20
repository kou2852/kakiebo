// ツアーの定義。Web 版 Onboarding/Tour.jsx の TOURS を、モバイルの画面に合わせて移した。
//
// Web との違い:
//   ・page ではなく expo-router の route を書く
//   ・target は CSS セレクタではなく、useTourTarget に渡した key
//   ・Web のサイドバー誘導（nav ステップ）は無い。モバイルはタブとメニューを本人に押させて辿る
//   ・forceMode は無い。モバイルの記帳画面は種別を切り替える作りで、
//     借方・貸方を直接編集させないので、対応する概念が存在しない
//
// step:
//   key          識別子
//   title, body  吹き出しの中身
//   route        表示前に移動する画面。省略すると今の画面のまま（本人に押させる段では書かない）
//   target       指す要素の key。省略すると画面中央に吹き出しだけ出す
//   awaitPath    その画面へ本人が移ったら次へ（タブ・メニューを押させる）
//   awaitShown   その要素が画面に出たら次へ（一覧の行や「追加」を押させる。開いた先の要素を書く）
//   awaitSave    その画面の「保存」が押されたら次へ（画面が tour.saved('wallet') などで知らせる。キャンセルでは進まない）
//   awaitJournal 記帳されたら自動で次へ
//   awaitAccount 科目・口座が増えたら自動で次へ
//   interactive  自動では進まないが、画面を塞がずに操作させる（入れてから「次へ」を押す段）
//   afterSave    保存したあとにだけ聞く段（「ほかの口座も入れますか」）。保存をとばしたときは出さない
//   when         'due' ＝ 予定日が来た定期取引があるときだけ出す／'notdue' ＝ 無いときだけ出す。出さない段は飛ばし、「n / 全体」にも数えない
//   frame        true なら、保存・記帳を待つ段でも枠を出す（保存ボタンでなく、押す先が1つのボタンのとき）
//   reveal       true なら、保存・記帳を待つ段でも、指す先を見える所まで画面を送る（入れる欄が吹き出しの裏に隠れるとき）。操作を待たない段でも、指す先が画面の下の方なら見える所まで送る
//   bubble       'above' なら吹き出しを枠の直上に置く（ふだんは直下。枠の下に押してほしいものがあるとき）
//   target・awaitShown・awaitSave は配列でも書ける（どれか1つで足りる）
//   actions      完了ステップから別のツアーへ繋ぐボタン
//
// 設定のツアー（SETUP）はホームのモーダル（HomeIntro）の①〜⑤と同じ並び・同じ名前にする（2026-10-17）。
// 画面を見せるだけでは覚えないので、ホームから「設定」→ メニュー → 追加か既存 → 保存 まで本人に押させる（2026-10-17 指示）。
// 最後の段から次の設定のツアーへ進める（Tour.jsx）。番号はカードの口座の有無で詰めるので、題には書かない。

import { dueRecurring } from './utils/autoGen.js';

/** when のある段を、今の帳簿で出すか。 */
export function stepShown(step, data) {
  if (!step?.when) return true;
  const due = dueRecurring(data?.recurring, data?.journals).length > 0;
  return step.when === 'due' ? due : !due;
}

// 本人に押させる段の共通部品
const toSettings = (key) => ({
  key, route: '/', target: 'tab-settings', awaitPath: '/settings',
  title: '下の「設定」を押す',
  body: 'ここから先は、指したところを押して進みます。',
});
const menu = (key, target, path, label, body) => ({
  key, target, awaitPath: path,
  title: `「${label}」を押す`,
  body,
});

export const TOURS = {
  // ① 口座と現金の設定（2026-10-18 のストーリー）。ホームの純資産を、財布と銀行の実際の額に合わせる。
  // 口座を1つ選ぶか足して、残高を入れて保存 → 「ほかの口座も入れますか」で続けるか聞く → ホームで純資産と口座の残高を見る
  opening: {
    label: '口座と現金の設定',
    steps: [
      { key: 'o-intro', route: '/',
        title: '口座と現金を入れる',
        body: '「口座」はお金の置き場所です。銀行・財布の現金・電子マネー（交通系・コード決済）を入れます。ここに入れた額の合計から、カードの未払いを引いたものが純資産になります。' },
      toSettings('o-tab'),
      menu('o-menu', 'menu-wallets', '/manage/wallets', '口座・カード', '口座とカードの一覧が開きます。'),
      { key: 'o-pick', target: 'wallet-list', awaitShown: ['wallet-save', 'card-save'],
        title: '口座を押すか、「口座を追加」を押す',
        body: '上が口座（銀行・現金・電子マネー）で、残高を入れたい口座を押します。一覧に無い銀行や電子マネーは「口座を追加」から足します。下のカードは②で設定します。' },
      { key: 'o-save', target: ['wallet-save', 'card-save'], awaitSave: ['wallet', 'card'],
        title: '残高を入れて「保存」を押す',
        body: '現金は財布の中の額、銀行は通帳か銀行アプリの残高を入れます。新しく足す口座は名前も入れます。残高を入れ済みの口座は「いまの残高（直すときだけ）」に入れると、差額を記帳して合わせます。※仕訳帳の「開始残高（口座の名前）」を開いて金額を直しても変えられます。' },
      { key: 'o-more', route: '/manage/wallets', afterSave: true,
        title: 'ほかの口座も入れますか？',
        body: '現金と銀行、2つ目の銀行や電子マネーなど、続けて入れられます。',
        choices: [{ label: 'ほかの口座も入れる', goto: 'o-pick' }, { label: '次へ進む' }] },
      { key: 'o-home', route: '/', target: 'networth',
        title: '純資産が変わった',
        body: 'いま入れた残高の合計から、カードの未払いを引いた額です。' },
      { key: 'o-accounts', route: '/', target: 'home-accounts',
        title: '口座ごとの残高も出る',
        body: '入れた口座が、ここに残高つきで並びます。記帳すると、払った口座の残高が減ります。' },
    ],
  },

  // ② カードの設定（2026-10-18 のストーリー）。カードごとに、次に「いつ・どの口座から・いくら」引き落とされるかを出す。
  // カードを1枚選ぶか足して、締め日などを入れて保存 → 「ほかのカードも入れますか」で続けるか聞く → レポートの「カード」で次回の引き落としを見る
  card: {
    label: 'カードの設定',
    steps: [
      { key: 'cs-intro', route: '/',
        title: 'カードを入れる',
        body: 'カードは、払った日と引き落とされる日がずれます。締め日・引落日・引落口座を入れると、次にいつ・どの口座から・いくら引き落とされるかが出ます。' },
      toSettings('cs-tab'),
      menu('cs-menu', 'menu-wallets', '/manage/wallets', '口座・カード', '口座とカードの一覧が開きます。'),
      { key: 'cs-pick', target: 'card-list', awaitShown: 'card-save', bubble: 'above',
        title: 'カードを押すか、「カードを追加」を押す',
        body: '「カードを追加」の下にあるカードの一覧から、入れたいカードを押します。一覧に無いカードは「カードを追加」から足します。' },
      { key: 'cs-save', target: 'card-save', awaitSave: 'card',
        title: '締め日・引落日・引落口座を入れて「保存」を押す',
        body: '日はカードの明細に書いてあります。新しいカードは名前と次回の引落額も入れます。※引落口座に銀行が無ければ、先に①で入れます。次回の引落額は、仕訳帳の「開始残高（カードの名前）」で直せます。' },
      { key: 'cs-more', route: '/manage/wallets', afterSave: true,
        title: 'ほかのカードも入れますか？',
        body: 'カードが2枚以上あれば、続けて入れられます。',
        choices: [{ label: 'ほかのカードも入れる', goto: 'cs-pick' }, { label: '次へ進む' }] },
      { key: 'cs-reports', route: '/', target: 'tab-reports', awaitPath: '/reports',
        title: '下の「レポート」を押す',
        body: '入れた締め日で、引き落としの予定を見てみます。' },
      { key: 'cs-cc', target: 'report-tabs', awaitShown: 'credit-card',
        title: '上の「カード」を押す',
        body: '' },
      { key: 'cs-credit', target: 'credit-card',
        title: '次の引き落としは、ここに出る',
        body: 'カードごとに、締め・引落の条件、未払残高、次の引落日と額が出ます。2枚以上なら横にスライドして見ます。まだ出ないときは、締め日などが未入力です。②の保存まで進めてください。' },
      { key: 'cs-notice',
        title: '引落日の前に知らせる',
        body: '通知を許可していれば、引落日の3日前にお知らせします（設定の「通知」で変えられます）。引落日になると、ホームの「未記帳の自動取引」に出て、そこから引き落としを記帳できます。' },
    ],
  },

  // ③ 記帳する（2026-10-19 のストーリー）。1件記帳すると、純資産・支出内訳・口座の残高が動くのを、本人の操作で見る。
  // 入力の段（金額・費目・支払方法）は、入れたのを見て自動で進む。本物の帳簿に1件記帳される（消さずに残す）
  journal: {
    label: '記帳する',
    steps: [
      { key: 'j-intro', route: '/',
        title: '記帳してみる',
        body: '1件記帳すると、純資産・支出内訳・口座の残高が動きます。実際に使った1件を入れて、動くところまで見てみましょう。' },
      { key: 'j-add', target: 'add-button', awaitPath: '/journal',
        title: '下の ＋ を押す',
        body: 'どの画面からでも、ここを押すと記帳できます。' },
      { key: 'j-kind', target: 'entry-head',
        title: '支出・収入・振替を選べる',
        body: '借方と貸方は自動で決まるので、簿記の知識は要りません。ここでは「支出」のまま進めます。' },
      { key: 'j-amount', target: 'entry-head', awaitSave: 'amount',
        title: '金額を入れる',
        body: '使った額を入れます。入れると次へ進みます。' },
      { key: 'j-expense', target: 'entry-accounts', awaitSave: 'expense', reveal: true,
        title: '費目を選ぶ',
        body: '何に使ったかを選びます。支出内訳に出ます。' },
      { key: 'j-payment', target: 'entry-accounts', awaitSave: 'payment', reveal: true,
        title: '支払方法を選ぶ',
        body: 'どの口座・カードで払ったかを選びます。その口座の残高が減ります。①で入れた口座が先に並びます。' },
      { key: 'j-save', target: 'entry-accounts', awaitJournal: true, reveal: true,
        title: '「保存」を押す',
        body: '下の「保存」を押すと記帳されます。確認が出たら「OK」を押します。' },
      { key: 'j-home', route: '/', target: 'home-breakdown',
        title: '支出内訳と口座の残高が変わった',
        body: 'いま記帳した分が、費目ごとの支出と、その下の「口座の残高」の払った口座に出ます。純資産も動きます。' },
      { key: 'j-more',
        title: 'ほかの入れ方',
        body: '決まった記帳は「プリセット」で1タップに、日付や摘要も入れられ、タグで目的も分けられます。複数の費目に分けるときは「複合仕訳」を使います。プリセットは使い方の一覧にあるツアーで、タグは次の④で見ます。' },
    ],
  },

  // ④ タグで目的を分ける（2026-10-19 のストーリー）。口座のお金を「生活費・旅行・貯金」などの目的に分けて、目的ごとの残りを見る。
  // タグを作る（続けて作るか聞く）→ タグ配分で額を入れる → 記帳でタグを選ぶことを知る → ホームの「資産の使いみち」を見る
  tag: {
    label: 'タグで目的を分ける',
    steps: [
      { key: 't-intro', route: '/',
        title: 'お金を目的で分ける',
        body: '口座のお金を「生活費」「旅行」「貯金」のような目的に分けておくと、ホームで目的ごとの残りが見えます。口座は1つのまま、中身だけを分けます。' },
      toSettings('t-tab'),
      menu('t-menu', 'menu-tags', '/manage/tags', 'タグ', 'タグは、お金の目的につける名前です。'),
      { key: 't-add', target: 'tag-list', awaitShown: 'tag-save',
        title: '「タグを追加」を押す',
        body: '' },
      { key: 't-save', target: 'tag-save', awaitSave: 'tag',
        title: '目的の名前を入れて「保存」を押す',
        body: '生活費・旅行・貯金のように、お金の目的を名前にします。色も選べます。' },
      { key: 't-more', route: '/manage/tags', afterSave: true,
        title: 'ほかのタグも作りますか？',
        body: '目的は2つ以上あると分けやすくなります。続けて作れます。',
        choices: [{ label: 'ほかのタグも作る', goto: 't-add' }, { label: '次へ進む' }] },
      { key: 't-menu2', route: '/settings', target: 'menu-allocs', awaitPath: '/manage/allocations',
        title: '「タグ配分」を押す',
        body: '作ったタグに、口座のお金を割り当てます。' },
      { key: 't-alloc', target: 'alloc-save', awaitSave: 'alloc',
        title: '目的ごとの額を入れて「保存」を押す',
        body: '口座ごとに、どの目的にいくら充てるかを入れます。残高は動きません。割り当てなかった分は「未配分」になります。' },
      { key: 't-entry', route: '/journal', target: 'entry-tags', reveal: true,
        title: '記帳でタグを選ぶ',
        body: '記帳の「タグ」で目的を選ぶと、その目的の残りが減ります。金額を入れると、記帳の一部だけをその目的に充てられます。' },
      { key: 't-home', route: '/', target: 'tag-usage',
        title: 'ホームに「資産の使いみち」が出る',
        body: '口座のお金が、目的ごとに分かれて出ます。口座を開くと、タグごとの額が見えます。' },
    ],
  },

  // ⑤ 毎月のお金を入れる（2026-10-20 のストーリー）。定期取引を登録 →（ほかも作るか）→ 予定日が来るとホームに出る →
  // 開いて「N件を記帳する」まで本人に押させる。予定日が先なら、ホームに出ていないので説明だけにする（when）
  monthly: {
    label: '毎月のお金を入れる',
    steps: [
      { key: 'm-intro', route: '/',
        title: '決まったお金を登録する',
        body: '家賃・給料・サブスクのように、決まった日に入る・出ていくお金を登録しておきます。予定日が来るとホームでお知らせします。勝手には記帳しません。' },
      toSettings('m-tab'),
      menu('m-menu', 'menu-recurring', '/manage/recurring', '定期取引', '家賃・サブスク・給料のような、決まったお金を入れます。'),
      { key: 'm-add', target: 'recurring-list', awaitShown: 'recurring-save',
        title: '「定期取引を追加」を押す',
        body: '' },
      { key: 'm-save', target: 'recurring-save', awaitSave: 'recurring',
        title: '家賃などを入れて「保存」を押す',
        body: '名称・金額・頻度・次回の予定日・費目・支払方法を入れます。予定日が今日のままなら、このあとすぐ試せます。' },
      { key: 'm-more', route: '/manage/recurring', afterSave: true,
        title: 'ほかの定期取引も入れますか？',
        body: '給料・サブスクなど、決まったお金は続けて入れられます。',
        choices: [{ label: 'ほかも入れる', goto: 'm-add' }, { label: '次へ進む' }] },
      { key: 'm-home', route: '/', target: 'home-pending', when: 'due',
        title: '予定日が来ると、ホームに出る',
        body: '「未記帳の自動取引」に出ています。勝手には記帳しないので、記帳するのは本人です。' },
      { key: 'm-wait', route: '/', when: 'notdue',
        title: '予定日が来ると、ホームに出る',
        body: 'いまは予定日が先なので出ていません。予定日が来ると「未記帳の自動取引」に出ます。勝手には記帳しません。' },
      { key: 'm-open', target: 'home-recurring-open', awaitPath: '/manage/recurring', when: 'due',
        title: '「定期取引を開く」を押す',
        body: '' },
      { key: 'm-gen', target: 'recurring-gen', awaitSave: 'recurring-gen', frame: true, when: 'due',
        title: '「〇件を記帳する」を押す',
        body: '予定日が来た分が、まとめて記帳されます。次回の予定日は自動で次の回へ進みます。' },
      { key: 'm-done',
        title: '予定日が来たら、こう記帳する',
        body: '記帳した分は仕訳帳に入ります。間違えたときは、仕訳を削除すれば元に戻せます（予定日も戻ります）。' },
    ],
  },

  credit: {
    label: 'カードの引き落としを記帳する',
    steps: [
      { key: 'c-reports', route: '/', target: 'tab-reports', awaitPath: '/reports',
        title: '下の「レポート」を押す',
        body: 'カードの利用と引き落としは、レポートの「カード」にまとまっています。' },
      { key: 'c-cc', target: 'report-tabs', awaitShown: 'credit-card',
        title: '上の「カード」を押す',
        body: '' },
      { key: 'c-intro', target: 'credit-card',
        title: 'カードは「払った日」と「引き落とし日」が違う',
        body: 'カードで払った時点では、費用とカード（負債）が増えます。引き落としは後日、カードと預金の振替で消し込みます。' },
      { key: 'c-settle', target: 'credit-settle', interactive: true,
        title: '引落日が来たら、ここで記帳する',
        body: '「引落日が来た 〇件を記帳」を押すと、引落口座の残高とカードの未払いが、その回の分だけ減ります。ボタンが無いときは、記帳する引き落としはまだありません。' },
    ],
  },

  preset: {
    label: 'プリセットで一発入力',
    steps: [
      toSettings('p-tab'),
      menu('p-menu', 'menu-presets', '/manage/presets', 'プリセット', 'よく使う組み合わせを登録しておく所です。'),
      { key: 'p-add', target: 'preset-list', awaitShown: 'preset-save',
        title: '「プリセットを追加」を押す',
        body: '' },
      { key: 'p-save', target: 'preset-save', awaitSave: 'preset',
        title: '名前と費目・支払方法を入れて「保存」を押す',
        body: '「食費 × 現金」のような、よく使う組み合わせを作ります。' },
      { key: 'p-entry', route: '/', target: 'add-button', awaitPath: '/journal',
        title: '下の ＋ を押す',
        body: '作ったプリセットを使ってみます。' },
      { key: 'p-use', target: 'entry-presets', awaitJournal: true,
        title: 'プリセットを押し、金額を入れて「保存」を押す',
        body: '費目と支払方法が一度に入ります。' },
      { key: 'p-done', route: '/', target: 'home-breakdown',
        title: '1タップで記帳できた',
        body: '次からは、プリセットを押して金額を入れるだけです。' },
    ],
  },

  reports: {
    label: 'レポートの読み方',
    steps: [
      { key: 'rp-tab', route: '/', target: 'tab-reports', awaitPath: '/reports',
        title: '下の「レポート」を押す',
        body: '' },
      { key: 'rp-bs', target: 'report-bs',
        title: '貸借対照表（BS）',
        body: 'ある時点で何を持ち、何を借りているかの一覧です。資産から負債を引いた「差引純資産」が、ホームの純資産です。' },
      { key: 'rp-pl-go', target: 'report-pages', awaitShown: 'report-pl',
        title: '「損益計算書」を押す',
        body: '' },
      { key: 'rp-pl', target: 'report-pl',
        title: '損益計算書（PL）',
        body: '期間内にいくら入っていくら出たかです。BS が「今の状態」、PL が「期間の動き」を表します。' },
      { key: 'rp-cf-go', target: 'report-pages', awaitShown: 'report-cf',
        title: '「CF計算書」を押す',
        body: '' },
      { key: 'rp-cf', target: 'report-cf',
        title: 'キャッシュフロー計算書（CF）',
        body: '現金と預金が実際にいくら動いたかです。カード払いは使った月ではなく、引き落とされた月に出ます。' },
    ],
  },

  csv: {
    label: '他社データを取り込む',
    steps: [
      toSettings('csv-tab'),
      menu('csv-menu', 'menu-csv', '/manage/csv', 'CSV 入出力', ''),
      { key: 'csv-in', target: 'csv-panel', interactive: true,
        title: '他の家計簿や銀行の明細を読む',
        body: '「CSV ファイルを選ぶ」か、中身を貼り付けます。読み込んだら、列ごとに何の項目かを選びます。' },
      { key: 'csv-dup',
        title: '重複は自動で弾きます',
        body: '同じ日付・金額・摘要の組み合わせは取り込まれません。二重計上を防ぐためです。' },
    ],
  },

  encryption: {
    label: '暗号化',
    steps: [
      toSettings('e2e-tab'),
      menu('e2e-menu', 'menu-encryption', '/manage/encryption', '暗号化・バックアップ', ''),
      { key: 'e2e-on', target: 'encryption-panel',
        title: '預ける前に端末で暗号化する',
        body: 'パスフレーズを決めると、端末内で暗号化してからサーバーへ送ります。鍵は端末から出ないので、運営者も中身を読めません。' },
      { key: 'e2e-warn',
        title: 'パスフレーズは復元できません',
        body: '忘れると運営でも復旧できません。有効にしたときに出るリカバリーキーを、必ず控えてください。' },
    ],
  },

  // バックアップは暗号化とは別の章（2026-10-18 指示）。アプリでの控えは CSV の書き出しと、アカウントにつないだときのサーバーの帳簿
  backup: {
    label: 'バックアップ',
    steps: [
      toSettings('bk-tab'),
      menu('bk-menu', 'menu-csv', '/manage/csv', 'CSV 入出力', ''),
      { key: 'bk-export', target: 'csv-export', interactive: true,
        title: '「CSV を書き出す」で控えを取る',
        body: '仕訳をすべてファイルに書き出し、保存先を選べます。端末を替えるときや、念のための控えに使います。書き出したファイルは暗号化されないので、置き場所に気をつけてください。' },
      { key: 'bk-cloud',
        title: 'アカウントにつなぐと、サーバーにも残る',
        body: 'アカウントに接続すると、帳簿はサーバーにも保存され、端末をなくしても別の端末で開けます。暗号化を有効にすると、サーバーの帳簿は運営者にも読めません。' },
    ],
  },

  sync: {
    label: 'アカウントに接続する',
    steps: [
      toSettings('sy-tab'),
      menu('sy-menu', 'menu-sync', '/settings/sync', 'アカウントと同期', ''),
      { key: 'sy-connect', target: 'sync-connect',
        title: '端末をまたいで同じ帳簿を見る',
        body: 'アカウントを作ると、いま端末にある帳簿をそのまま引き継いで、他の端末からも見られます。' },
      { key: 'sy-offline',
        title: 'オフラインでも記帳できます',
        body: '通信がなくても記帳でき、つながったときに自動で送られます。接続したあとは「未送信の変更」が0なら同期済みです。' },
    ],
  },
};

/** 下のタブ（帯）にある部品。画面の切り替えで動かないので、測ったらすぐ指せる。周りを暗くするときは帯ごと明るく残す */
export const TAB_TARGETS = ['tab-settings', 'tab-reports', 'add-button'];

/** 画面を塞がずに操作させる段か（暗幕を出さない。吹き出しは端に寄せる） */
export const isInteractive = (step) => !!(step && (step.awaitJournal || step.awaitAccount || step.awaitPath
  || step.awaitShown || step.awaitSave || step.interactive));

/** 設定のツアー。ホームのモーダルの①〜⑤と同じ並び。カードは記帳の前（2026-10-15 決定） */
export const SETUP = ['opening', 'card', 'journal', 'tag', 'monthly'];


/**
 * 使い方の画面に並べるツアーの順（番号はこの並びで振る。2026-10-18 指示）。入れ子にしない。
 *   ①〜⑤ ホームの紹介カードと同じ設定
 *   ⑥〜⑨ バックアップ・カードの引き落とし・プリセット・レポート
 *   ⑩〜⑫ 他の家計簿からの取り込み・アカウントの接続・暗号化（使う人だけが使うので最後）
 * カードの有無・ログインの有無で出し分けない。誰にも全部を同じ番号で並べる（暗号化はゲストには押せない形で出す。app/guide.jsx）
 */
export const TOUR_MENU = [...SETUP, 'backup', 'credit', 'preset', 'reports', 'csv', 'sync', 'encryption'];

/** 丸数字（使い方の画面とツアーの吹き出しの番号） */
export const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩', '⑪', '⑫'];
