// ツアーの定義。Web 版 Onboarding/Tour.jsx の TOURS を、モバイルの画面に合わせて移した。
//
// Web との違い:
//   ・page ではなく expo-router の route を書く
//   ・target は CSS セレクタではなく、useTourTarget に渡した key
//   ・Web のサイドバー誘導（nav ステップ）は無い。モバイルはタブとメニューで辿るため
//   ・forceMode は無い。モバイルの記帳画面は種別を切り替える作りで、
//     借方・貸方を直接編集させないので、対応する概念が存在しない
//
// step:
//   key          識別子
//   title, body  吹き出しの中身
//   route        表示前に移動する画面。省略すると今の画面のまま
//   target       指す要素の key。省略すると画面中央に吹き出しだけ出す
//   awaitJournal 記帳されたら自動で次へ
//   awaitAccount 科目・口座が増えたら自動で次へ
//   actions      完了ステップから別のツアーへ繋ぐボタン
export const TOURS = {
  firstRun: {
    label: 'はじめてのツアー',
    steps: [
      { key: 'welcome',
        title: 'kurofukubo へようこそ',
        body: 'あなたの口座を1つ登録して、純資産まで見える家計簿を体験しましょう。自分の数字なので実感が持てるはずです。' },
      { key: 'account-add', route: '/manage/accounts', target: 'account-add', awaitAccount: true,
        title: '① あなたの口座を1つ登録',
        body: '種別を選んで、名前と残高を入れるだけです。残高は任意です。登録せずに「次へ」で進んでも構いません。' },
      { key: 'networth', route: '/', target: 'networth',
        title: '② これがあなたの純資産',
        body: '資産から負債を引いた正味の金額です。いま登録した残高が反映されています。記帳するほど自動で更新されます。' },
      { key: 'add-button', route: '/', target: 'add-button',
        title: '③ 記帳はここから',
        body: '画面下の中央にある丸いボタンから、いつでも記帳できます。' },
      { key: 'done',
        title: '準備ができました',
        body: '次は記帳の仕方を見るか、クレジットカードの扱いを覚えると実用に近づきます。ツアーは「使い方」からいつでも呼び出せます。',
        actions: [
          { label: '記帳の仕方を見る', tour: 'entry' },
          { label: 'クレジットカードを覚える', tour: 'credit' },
        ] },
    ],
  },

  entry: {
    label: '記帳の仕方',
    steps: [
      { key: 'e-open', route: '/(tabs)/journal', target: 'entry-kind',
        title: '① 種別を選ぶ',
        body: '支出・収入・振替から選びます。借方と貸方は裏側で自動的に決まるので、簿記の知識は要りません。' },
      { key: 'e-preset', route: '/(tabs)/journal',
        title: '② プリセットで一気に埋める',
        body: 'よく使う組み合わせを登録しておくと、ここを押すだけで費目と支払方法が入ります。' },
      { key: 'e-amount', route: '/(tabs)/journal', awaitJournal: true,
        title: '③ 金額を入れて記帳',
        body: '金額を入れて保存すると1件記帳できます。試しに1件入れてみましょう。' },
      { key: 'e-done',
        title: '記帳はこれだけです',
        body: 'どの入れ方でも複式仕訳として正しく記録されます。自分に合う方法を使ってください。' },
    ],
  },

  credit: {
    label: 'クレジットカードの記帳',
    steps: [
      { key: 'c-intro', route: '/credit', target: 'credit-cycle',
        title: 'カードは「払った日」と「引き落とし日」が違う',
        body: 'カードで払った時点では、費用とカード（負債）が増えます。引き落としは後日、カードと預金の振替で消し込みます。' },
      { key: 'c-setup', route: '/manage/accounts',
        title: '締め日と引落日を設定する',
        body: '負債の科目に締め日・引落日・引落口座を設定すると、サイクルごとの利用額と引落予定が自動で出ます。' },
    ],
  },

  accounts: {
    label: '口座と科目を整える',
    steps: [
      { key: 'a-list', route: '/manage/accounts', target: 'account-list',
        title: '科目は自由に足せます',
        body: '最初に一通り入っていますが、使わないものは消して構いません。自分の生活に合う名前にすると記帳が速くなります。' },
      { key: 'a-type',
        title: '種別が計算の土台になる',
        body: '資産・負債・純資産・収益・費用のどれにするかで、貸借対照表と損益計算書の並び方が決まります。' },
    ],
  },

  preset: {
    label: 'プリセットで一発入力',
    steps: [
      { key: 'p-list', route: '/manage/presets', target: 'preset-list',
        title: 'よく使う組み合わせを登録',
        body: '「食費 × 現金」のような組み合わせを作っておくと、記帳画面の上部から1タップで呼び出せます。' },
      { key: 'p-use', route: '/(tabs)/journal',
        title: '記帳画面から呼び出す',
        body: 'ここに並びます。金額と日付だけ入れれば記帳できます。' },
    ],
  },

  recurring: {
    label: '定期取引（家賃・サブスク）',
    steps: [
      { key: 'r-list', route: '/manage/recurring', target: 'recurring-list',
        title: '毎月同じ取引を自動で作る',
        body: '家賃やサブスクを登録しておくと、次回の日付が来たときに記帳の候補として出ます。入れ忘れが減ります。' },
      { key: 'r-note',
        title: '自動で記帳はしません',
        body: '身に覚えのない仕訳が増えないよう、作るのは候補までです。確認して保存すると記帳されます。' },
    ],
  },

  tags: {
    label: 'タグで分類する',
    steps: [
      { key: 't-list', route: '/manage/tags', target: 'tag-list',
        title: '費目をまたいで集計する',
        body: '旅行・帰省・推し活など、複数の費目にまたがる支出をまとめて見たいときに使います。' },
      { key: 't-alloc', route: '/manage/allocations',
        title: '配分で予算を割り当てる',
        body: 'タグごとに使える額を決めておくと、残りがいくらか分かります。' },
    ],
  },

  reports: {
    label: 'レポートの読み方',
    steps: [
      { key: 'rp-bs', route: '/(tabs)/reports', target: 'report-tabs',
        title: '貸借対照表（BS）',
        body: 'ある時点で何を持ち、何を借りているかの一覧です。左右の合計が必ず一致します。' },
      { key: 'rp-pl',
        title: '損益計算書（PL）',
        body: '期間内にいくら入っていくら出たかです。BS が「今の状態」、PL が「期間の動き」を表します。' },
      { key: 'rp-cf',
        title: 'キャッシュフロー計算書（CF）',
        body: '現金と預金が実際にいくら動いたかです。カード払いは使った月ではなく、引き落とされた月に出ます。' },
    ],
  },

  networthTrend: {
    label: '純資産の推移を読む',
    steps: [
      { key: 'n-hero', route: '/', target: 'networth',
        title: '増えているかどうかを見る',
        body: '毎月の収支が黒字でも、借入が増えていれば純資産は減ります。ここが本当の増減です。' },
      { key: 'n-period', route: '/', target: 'period-bar',
        title: '期間を切り替える',
        body: '今月・先月・今年・全期間を切り替えられます。全期間にすると、始めてからの流れが見えます。' },
    ],
  },

  csv: {
    label: '他社データを取り込む',
    steps: [
      { key: 'csv-in', route: '/manage/csv', target: 'csv-panel',
        title: 'CSV で入出力できる',
        body: '他の家計簿から移ってくるときや、表計算で分析したいときに使います。' },
      { key: 'csv-dup',
        title: '重複は自動で弾きます',
        body: '同じ日付・金額・摘要の組み合わせは取り込まれません。二重計上を防ぐためです。' },
    ],
  },

  encryption: {
    label: '暗号化とバックアップ',
    steps: [
      { key: 'e2e-on', route: '/manage/encryption', target: 'encryption-panel',
        title: '預ける前に端末で暗号化する',
        body: 'パスフレーズを決めると、端末内で暗号化してからサーバーへ送ります。鍵は端末から出ないので、運営者も中身を読めません。' },
      { key: 'e2e-warn',
        title: 'パスフレーズは復元できません',
        body: '忘れると誰にも解けません。書き出したバックアップも同じ鍵で守られます。必ず控えを取ってください。' },
    ],
  },

  sync: {
    label: 'アカウントに接続する',
    steps: [
      { key: 'sy-connect', route: '/settings/sync', target: 'sync-connect',
        title: '端末をまたいで同じ帳簿を見る',
        body: 'アカウントを作ると、いま端末にある帳簿をそのまま引き継いで、他の端末からも見られます。' },
      { key: 'sy-offline',
        title: 'オフラインでも記帳できます',
        body: '通信がなくても記帳でき、繋がったときに自動で送られます。「未送信の変更」が0になれば同期済みです。' },
    ],
  },
};

/** 使い方画面に並べる順番。firstRun は初回に自動で出るが、見直せるよう先頭に置く。 */
export const TOUR_MENU = [
  'firstRun', 'entry', 'credit', 'accounts', 'preset', 'recurring',
  'tags', 'reports', 'networthTrend', 'csv', 'encryption', 'sync',
];
