# 問い合わせ発の改善計画（2026-09-21）

2026-09-21 に届いた問い合わせ（仮口座の作り方／デフォルト科目の非表示）への回答は返信済み。そのとき「非表示機能の追加を検討する」と答えている。本書はその実装指示。

実装は別セッションで行う。着手順は Phase 1 → Phase 2。Phase 1 と Phase 2 は独立しているので、Phase 1 のデプロイを待たずに Phase 2 の実装を進めてよいが、**リリースは Phase 1 を先に出す**（ユーザーに約束したのはこちら）。

## 共通のルール

- 本番への干渉（S3 sync / invalidation / sam deploy / change-set execute）は**毎回ユーザーの明示許可を取る**。コマンドを組み立てた時点で止まって提示する。
- Phase 1 はデータモデルを触るため、**backend → frontend の順でデプロイする**。逆順にすると、フロントが送る新フィールドを API が落とすため、保存が静かに失われる。
- 余分な diff を出さない。既存の書式・命名に合わせる。
- テストフレームワークは無い。検証は `cd frontend && npm run dev` の手動確認。ローカル preview は CORS で API が全滅するので、**ゲストモード（localStorage）で動作を確認**し、API 経路は本番デプロイ後にスモークする。

---

## Phase 1: 勘定科目の非表示

### 背景

既定の29科目は `sys: 1` が付いており削除できない（`backend/src/handlers/accounts.js` の DELETE、`frontend/src/components/Accounts/AccountsPage.jsx:179`）。使わない科目が入力時のプルダウンに並び続けるため、問い合わせの方は「コードを大きい数字に変えて下へ送る」回避策を取っている。

**削除を許す方向では直さない。** 既定科目の ID はコードから直接参照されている（`utils/guestMigration.js` の `DEFAULT_PRESETS` が `e01`・`b03`、`AccountModal.jsx` の開始残高が `EQUITY_ID`＝`c01`）。消せるようにすると、これらが壊れる。隠すだけにする。

### データモデル

科目に `hidden` を足す。`0`（既定）/ `1`。既存データにフィールドは無いので、`!!a.hidden` で判定すること。

### backend

`backend/src/handlers/accounts.js`

- `EDITABLE_FIELDS` に `'hidden'` を追加（8行目）。これが無いと PUT で落ちる。
- POST の `putItem` に `hidden: body.hidden ? 1 : 0` を追加。
- `strip()` は素通しなので変更不要。DELETE の挙動も変えない（`sys` は引き続き削除不可）。
- 型は数値 0/1 に正規化する。フロントから true/false が来ても保存が揺れないようにする。

### frontend: 除外する場所（＝これから入力する科目を選ぶ場所）

| ファイル | 対象 |
|---|---|
| `components/Journal/QuickEntry.jsx:138-141,195` | かんたん入力・詳細入力の科目候補 |
| `components/Journal/JournalModal.jsx:27` | 仕訳の編集 |
| `components/Journal/JournalPage.jsx:38` | 一括変更の借方／貸方（346・353行で使用） |
| `components/Journal/CSVModal.jsx:36` | 取込時の科目上書き・ラベル対応のプルダウン |
| `components/Accounts/PresetModal.jsx:24` | プリセットの行 |
| `components/Accounts/RuleModal.jsx:17` | 自動分類ルールの割当先 |
| `components/Recurring/RecurringModal.jsx:20` | 定期取引の行 |
| `components/Settings/BudgetModal.jsx:11` | 予算を設定する費目 |
| `components/Settings/ReconcileModal.jsx:31` | 残高合わせの対象 |
| `components/Accounts/WalletModal.jsx:26` | 口座に紐づける科目 |
| `components/Accounts/AccountModal.jsx:41,53` | カードの引落口座・開始残高の相手科目 |

### frontend: 除外してはいけない場所

- **BS / PL / ダッシュボードの集計**（`components/Reports/*`、`components/Dashboard/*`）。残高が残ったまま隠れると貸借が合わなくなる。非表示でも残高があれば必ず出す。
- **総勘定元帳の科目選択**（`components/Ledger/LedgerPage.jsx:25`、148行で使用）。過去の記録を見る画面なので、非表示科目も選べること。
- **CSV取込の自動一致**（`utils/csv.js` の `resolveAccount`）。名前・コードでの突き合わせは非表示科目も対象のままにする。ユーザーが選ぶのではなくデータを解決する処理なので、ここを絞ると取込が壊れる。
- 仕訳・元帳の表示で科目名を引く処理（`accounts.find(...)` 系）は全て現状維持。

### 落とし穴（必ず入れる）

**編集中の仕訳が使っている科目は、非表示でも候補に残す。** 残さないと、非表示科目を含む仕訳を開いて保存した瞬間に、その行の科目が空になって飛ぶ。`JournalModal` / `RecurringModal` / `PresetModal` / `RuleModal` のように既存値を読み込む画面では、「非表示を除いた一覧 ＋ いま選ばれている科目」で候補を作ること。

### UI

`components/Accounts/AccountsPage.jsx` の科目一覧（157行の `ac`、331行からのテーブル）。

- 各行に非表示の切替を置く。既存の「編集」「削除」と並べる。`sys` の科目でも切り替えられること（今回の要望はまさに既定科目を隠すこと）。
- 非表示の科目はテーブル下部に畳む。件数を出し、開くと一覧できる形にする。並びは既存どおりコード昇順を維持する。
- 残高のある科目を非表示にしようとしたら、「残高が残っているため、BS には引き続き表示されます」と伝える。止めはしない。

### 受け入れ条件

1. 既定科目（例：売掛金）を非表示にすると、かんたん入力・詳細入力・予算設定・プリセットの候補から消える。
2. 非表示にした科目を使った過去の仕訳を開いて保存しても、科目が消えない。
3. 残高のある科目を非表示にしても、BS の金額と貸借一致が変わらない。
4. 総勘定元帳では非表示科目を選べる。
5. リロード後も非表示が保たれる（ゲストモード＝localStorage、ログイン＝API の両方）。
6. `npm run build` が通る。

---

## Phase 2: 小さい2件（フロントのみ・バックエンド変更なし）

### 2a. 科目追加テンプレートに「仮口座」を足す

`components/Accounts/AccountsPage.jsx:33` 付近のテンプレート配列に、資産区分の「仮口座（プール）」を追加する。他アプリから移ってきた人は「仮口座」という語で探すため、ここにあるだけで見つかる。

**注意書きを添えること。** 開始残高欄に金額を入れると、元入金を相手にした開始残高の仕訳が立ち、実際には増えていないお金が資産に計上される（`AccountModal.jsx:233`）。テンプレから作る人ほどここに入れてしまうので、残高欄は空のままにして実口座から振替で移す、と画面に書く。

### 2b. かんたん入力の「振替」を負債にも送れるようにする

`components/Journal/QuickEntry.jsx:156,262` — 振替の「どこへ」が `assetAccts`（資産のみ）に限定されているため、仮口座（負債）→ クレジットカードのような負債どうしの振替が、詳細モードでしか作れない。「どこへ」を `payAccts`（資産＋負債）に広げる。

154-156行の初期選択も合わせて直すこと。移動元と同じ科目が初期選択されないよう、いまの `assetAccts.find((a) => a.id !== from)` と同じ配慮を残す。

「振替」という語のまま負債が並ぶと分かりにくい可能性があるので、ラベルの文言は実装時に一度ユーザーへ確認する。

---

## 今回はやらないもの

- **タグ配分（allocs）の入力UI** — API もインポートも揃っているのに作る画面が無く、`DataContext` に `saveAllocs` が無い。既存残高に「これは特別費」と後から印を付けられない。乗り換え組が詰まる場所だが、要望としてはまだ出ていないので仕様から起こす必要がある。
- **他社アプリからの移行ツール** — 複式家計簿アプリ（com.gomao.kakeibo）の CSV 形式サンプルを問い合わせ主に依頼したまま返信待ち。着手するなら、形式ごとの実装を増やすより「列の対応を自分で選ぶ」モードを取込画面に足す案から。
