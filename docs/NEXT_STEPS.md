# 次のステップ / 保留中タスク

最終更新: 2026-06-12。作業再開時はここから読む。

## 環境メモ（再開用）

| 項目 | 値 |
|---|---|
| アプリURL(prod) | https://app.kurofukubo.com |
| LP URL(prod) | https://kurofukubo.com / https://www.kurofukubo.com |
| LPホスティング | スタック `kakeibo-lp-prod`（**us-east-1**）/ Distribution `E2ANL068WDF75Y` / Bucket `kakeibo-lp-117953360790` / IaC `hosting/lp-template.yaml` |
| prod API | https://ecbjdndcbe.execute-api.ap-northeast-1.amazonaws.com/prod |
| dev API | https://9be6dndzzi.execute-api.ap-northeast-1.amazonaws.com/dev |
| アカウント | 管理 885418708508 / dev 296391867332 / prod 117953360790 |
| SSOプロファイル | `kakeibo-dev` / `kakeibo-prod`（PowerShell側の `.aws` を使用。Bashとキャッシュが別なので注意） |
| Cognito(prod) | UserPool `ap-northeast-1_ddBDF3HKK` / Client `lprqfuad5gm32gkb4g2bkvebk` |
| CloudFront(prod) | Distribution `E32HZNCIT2MXUM` / Bucket `kakeibo-web-prod-117953360790` |
| Route53 Zone | `Z0591546DS1L9CEG542K`（kurofukubo.com） |

> SSOトークン切れ時は PowerShell 側で `aws sso login --profile kakeibo-prod`（Bash の `!` ログインは別キャッシュで反映されない）。

> **🚀 デプロイ記録 2026-06-14**：2026-06-12〜14 のフロント改善一式（クレジット画面[サイクル別/期間指定=引落基準/グラフ/1カード1枠]／ポイント利用→雑収入[出金差引・合計据置]／月末締めの利用期間バグ＋期間フィルタのJSTズレ修正／仕訳[借方貸方ソート・一括選択モード・一括編集に日付/摘要/借方/貸方科目]／カレンダー編集削除／CSV取込モーダル拡大・取込中の二重実行防止／クレカ返済の自動起票を `creditCardCycles` に一本化）をまとめて本番反映。`npm run build`→app(`kakeibo-web-prod-117953360790` / Distribution `E32HZNCIT2MXUM`) へ sync＋invalidation（ID `I5VMULRY3HKOQQU0VX4MU7KAOL`, **Completed**）。本番URLで `verify-batch.mjs` スモーク全項目パス。**バックエンド変更なし**。以下の各セクションの「未デプロイ」表記はこの反映で解消済み。

## ✅ 定期取引「次回生成日」を記帳済みから導出（生成→削除/既存削除で生成対象がズ레る不具合）— 実装・検証済み（2026-06-15、フロントのみ・未デプロイ）

生成時に `nextDate` を進める一方、生成仕訳や既存仕訳を削除しても戻らず「次回生成日」がズレたままになる不具合。**「直近に起票された分を基準に生成対象を導出」**する方式へ変更（画面を開けば自己修復）。
- `utils/autoGen.js`：
  - `onSchedule(r,D)`（D が予定日列上か）／`recordedDates`／`recurringAnchor(r,journals)`（記帳済みがあれば最古の記帳済み予定日、無ければ nextDate）。
  - `effectiveNextDate(r,journals)`：起点以降で**最初に未記帳の予定日**（途中削除されたギャップ＝生成対象を含む）を返す。表示・並び替えに使用。
  - `dueRecurring`/`generateRecurring` を `recurringAnchor` 起点＋**記帳済みスキップ**で走査（重複生成しない）。
  - `rollbackNextDate`＋`DataContext.deleteJournal` での巻き戻しも併用（全削除時など記帳済みが残らないケースの保険）。
- `RecurringPage`：次回生成日の表示・ソートを `effectiveNextDate(r, journals)` に変更。generateAll/generateOne は `generateRecurring` に統一。
- 検証：`verify-recur.mjs`（生成→削除→巻き戻り→再生成で重複なし）、`verify-recur2.mjs`（既存の5/10・6/10のうち6/10削除→画面再表示で次回生成日が6/10に導出→一括生成で家賃2件・重複なし）。

## ✅ クレカ返済の引落前記帳＋確認モーダル ／ アプリ内更新情報 — 実装・検証済み（2026-06-14、フロントのみ・未デプロイ）

- **クレカ返済を引落日前にも記帳可能化＋チェックボックス確認**：`utils/autoGen.js` に `pendingCC`（締め済み・未引落を全件、`due`=引落日到来フラグ付き）/`postCCSettlements`/`generateRecurring` を追加（`dueCC`/`generateAllPending` は廃止）。新規 `components/Credit/CCSettleModal.jsx`：対象サイクルを一覧（カード/利用期間/利用額/引落予定日/区分）、行クリック＝チェック、**引落日到来分は初期選択／引落前（予定）も選べば先に記帳**、全選択あり、「選択したN件を記帳」。
  - `AccountsPage`：「クレカ返済を生成」→「**クレカ返済を記帳**」（CCSettleModal起動）に置換。直接生成ロジックは撤去（重複排除）。
  - `Dashboard`：リマインダーの「まとめて記帳」は定期取引を即記帳＋クレカは確認モーダルを開く（`generateRecurring`＋`CCSettleModal`）。`pendingCounts` は `{recurring, ccDue, ccTotal, total}`。
  - 検証 `verify-cc2.mjs`：到来5/27＋引落前6/27の2件表示、到来分初期選択(1件)、全選択で2件記帳（引落前6/27含む）。スクショ `shots/x8-cc-modal.png`。
- **アプリ内 更新情報（What's New）**：`config/updates.js`（`APP_UPDATES`）＋`Common/WhatsNewModal.jsx`。**オンボ済みユーザーに未読の更新を自動表示**（`kk_update_seen` で既読管理）、サイドバー「🆕 更新情報」でいつでも再表示。`App.jsx`/`Sidebar.jsx` 配線。スクショ `shots/x7-whatsnew.png`。

## ✅ 改善バッチ A〜D（UI/UX・整合性・不足機能）— 実装・検証済み（2026-06-14、フロントのみ・未デプロイ）

監査で洗い出した不備を一括対応（`verify-improve.mjs` で全項目パス。スクショ `shots/x5-dashboard-new.png` `x6-journal-tags.png`）。
- **A-1 日付のJSTズレ統一**：`format.today()` を `toISOString`→ローカル整形に修正し `ymd()` を追加。`RecurringPage`（独自 today/advanceDate）・`CalendarPage`（todayStr）の `toISOString` も排除。これで新規仕訳・クイック入力・定期取引の既定日付が深夜〜朝に前日化する不具合を解消。
- **A-2 使用中科目の削除ガード**：`AccountsPage.handleDelete` で 仕訳/口座/プリセット/ルール/予算/タグ配分/CC引落口座 の参照を検査し、使用中は削除拒否（参照孤立＝「(不明)」表示を防止）。`useData` に budgets/allocs 追加。
- **A-3 未記帳の自動取引リマインダー**：`utils/autoGen.js`（`dueRecurring`/`dueCC`/`pendingCounts`/`generateAllPending`、クレカは `creditCardCycles` 準拠）を新設。ダッシュボードに「未記帳の自動取引 n件（定期/クレカ）＋まとめて記帳」カードを追加（期日到来分をワンタップ生成）。
- **B-1 タグの可視化**：仕訳入力・仕訳帳の各行に splits のタグchipを表示＋「🏷 全タグ」絞り込みを追加（タグ機能の死蔵を解消）。
- **B-2 AI仕分けボタンを控えめ化**（btn-s・opacity 0.5・「準備中」明記）。
- **C-1 純資産の推移グラフ**：`bookkeeping.netWorthTrend()`＋`Dashboard/NetWorthChart.jsx`（折れ線）を新設。複式の核＝純資産推移を可視化。
- **C-2 科目フィルタ**：仕訳帳に「📒 全科目」絞り込み（科目ドリルダウン）を追加。
- **C-3 カレンダーから記帳**：`JournalModal` に `defaultDate` prop、カレンダー日別に「＋ この日に記帳」を追加。
- **D-1** クレジット既定期間を「今年」に。**D-2** 新規チャートに `role=img`/aria-label。**D-3** CSV取込ボタンに取込件数表示＋0件で非活性。
- [ ] **未デプロイ**：`npm run build`→app(`E32HZNCIT2MXUM`)へ sync＋invalidation 予定。バックエンド変更なし。

## ✅ クレカ返済の自動起票を利用サイクルに一本化 — 実装・検証済み（2026-06-14、フロントのみ・未デプロイ）

`AccountsPage` の `generateCC` は旧 `genCCSettle` 移植のままで、クレジット画面の `creditCardCycles` と**別の日付ロジック**だった（不整合）。問題: ①`toISOString()` でJST1日ズレ→締め日境界の取引を誤集計、②`ccClose+1`で月末締め非対応、③引落日が月末だと `2026-06-31` 等の**不正な日付文字列**を生成、④当月分のみで遡り取りこぼし。
- 修正：`generateCC` を **`creditCardCycles(c, journals, accounts)` に一本化**。`status==='unsettled'` かつ `settleDate <= 今日` のサイクル（当月＋遡り）について、`cy.usage`/`cy.settleDate`/締め月で `クレカ→引落口座` を起票。クレジット画面の表示と完全一致。
- 検証 `verify-ccgen.mjs`（本日2026-06-14）：締15→5/27¥5,000、締31/引31→**4/30**¥8,000（月末clampで4/31不正回避）、未到来6/27は非生成、再実行で重複なし、全件日付が実在。

## ✅ CSV二重取込防止 ／ 全選択ボタン ／ 一括編集に科目追加 — 実装・検証済み（2026-06-13、フロントのみ・未デプロイ）

- **CSV取込の連打で固まる/二重取込**：`CSVModal` に `importing` フラグを追加。`handleImport` 冒頭でガード＋取込中は `取込実行`/`戻る` を `disabled`（「取込中…」表示）。検証 `verify-csvshot.mjs`：連打しても2件のまま（二重取込なし）。
- **一括選択がチェック操作のみで大変**：`JournalPage` に **「☑ 一括選択」モードのトグル**を追加（`selectMode`）。既定はチェックボックス**非表示**の通常表示。押すと選択モードに入り、チェックボックス表示＋**行のどこをクリックしても選択トグル**（編集/削除ボタンは `stopPropagation`）。再押下で終了＆選択解除。ヘッダの全選択チェックボックスは選択モード時のみ表示。
- **一括編集に借方/貸方科目**：一括編集モーダルに `借方科目`/`貸方科目` の select（「変更しない」既定）を追加。適用時、選択中の各仕訳の dr/cr 行 `accountId` を差し替え（金額・税率・splits は不変）。検証 `verify-batch.mjs`：全件 desc=一括テスト かつ 借方科目=娯楽費(e07) に更新を確認。

## ✅ CSV取込モーダル拡大 ＆ クレジット画面の枠統合 — 実装・検証済み（2026-06-13、フロントのみ・未デプロイ）

- **CSV取込が小さい問題**：`Modal` に `wide` を渡しているのに **`.md-w` が未定義**で660px固定だった（根本原因）。`global.css` に `.md-w { max-width:1040px; width:96% }` を追加。あわせて選択テーブルを拡大（`.csv-pw` 340px→58vh、`.csv-pw td/th` 11→12.5px、`.csv-sel` 10→12px・min-width 100→130px、上部一括selectも120→150px）。検証 `verify-csvshot.mjs`（`.md.md-w` 適用確認）。スクショ `shots/17-csv-select.png`。
- **クレジット画面の枠が多い**：1カードにつき `.card` が3枠（ヘッダ/グラフ/表）→ **1カード=1枠**に統合。`CreditPage` を外側 `.card` 1つにし、グラフ・表セクションは `borderTop` の区切り線で分割。スクショ `shots/13-credit.png`（楽天/月末カードが各1ボックス）。

## ✅ 仕訳/カレンダー/期間表示の改善 4件＋期間ズレ修正 — 実装・検証済み（2026-06-13、フロントのみ・未デプロイ）

ユーザー要望4件をまとめて対応（`verify-batch.mjs` で全件E2E確認。スクショ `shots/15-journal-bulk.png` `shots/16-calendar-edit.png`）。
1. **借方/貸方ソート**（`JournalPage`）：科目名列 `借方`/`貸方` を `SortTh`（`drName`/`crName`）でソート可能に（先頭科目名を `localeCompare('ja')`）。従来は金額列のみで、複式ゆえ借方=貸方金額になり並びが変わらず「ソート不可」に見えていた。
2. **チェックボックス一括操作**（`JournalPage`）：行＋全選択のチェックボックス、選択時バー（N件選択中／一括編集／一括削除／選択解除）。一括削除は確認後ループ `deleteJournal`。**一括編集**は `Common/Modal` で日付・摘要を入力した分だけ全件へ `updateJournal`（科目・金額・lines は不変、空欄は据置）。
3. **期間ラベル表示**（`Dashboard/PeriodBar`）：チップ上に「📅 YYYY年M月 を表示中」を表示。PeriodBar利用の全7画面（ダッシュボード/仕訳入力/仕訳帳/BS/PL/CF/クレジット）に反映。
4. **カレンダーから編集/削除**（`CalendarPage`）：日別仕訳テーブルに編集・削除を追加し `Journal/JournalModal` を接続。
- **既存バグ修正（重要）**：`bookkeeping.js` の `fmt()` が `toISOString()` を使い **JSTで1日前にずれ**ていた（月初1日→前月末日）。期間ラベルが「5月」になる事象で発覚。ローカル日付整形に変更。`getPeriodRange`/`monthlyTrend` 等、**期間フィルタ全体のオフバイワンを是正**（当月ラベル一致をE2Eで確認）。

## ✅ クレジット明細（サイクル別）画面 — 実装・検証済み（2026-06-13、フロントのみ・未デプロイ）

カード利用（発生月）と引落（翌月以降）が月を跨いで1画面で追えない不便を解消。サイドバー「メイン」に**専用画面「クレジット」**を新設（`credit`、非表示可）。
- `utils/creditCard.js`：`isCreditCard()` / `creditCardCycles(card, journals, accounts, count=6)`（純関数）。締め期間ごとに利用額・引落予定日・状態（`open`締め前/`settled`引落済/`unsettled`未引落/`none`利用なし）・利用明細を算出。ローカル日付(`ymd`)でJSTズレ回避。**引落仕訳（カード借方＋資産貸方）は利用額から除外**（翌サイクルへの混入バグを検証時に発見・修正）。
- `components/Credit/CreditPage.jsx`：カードごとにヘッダ（未払残高・次回引落）＋**グラフ2種**＋サイクル表。行タップで利用明細を展開。CC未設定なら空状態から「勘定科目・口座」へ誘導。
- **可視化（ダッシュボードと同様）**：`creditUsageByCategory()` で科目別内訳→`Dashboard/PieChart` 再利用のドーナツ／`Credit/CycleBars.jsx`（新規）で締めサイクル別の利用額を棒グラフ表示（状態で色分け：緑=引落済/赤=未引落/`--ac`=締め前）。`PIE_COLORS` 流用。
- `config/nav.js` に `credit` 追加、`App.jsx` の `PAGES` に登録。
- **期間指定（2026-06-13 追加）**：仕訳入力と同じ `Dashboard/PeriodBar` を設置。**「引落日が期間内」**のサイクルだけ表示（既定=今月）。`creditCardCycles` は引数を `count` から `cap=36` に変更し、利用のあるサイクル＋締め前のみ返す（空サイクルは省略）。絞り込みは呼び出し側で `settleDate` を見て実施。検証 `verify-credit.mjs`：今月=6/27引落分のみ／全期間=3件。
- 検証：`docs/design-gen/verify-credit.mjs`（CC設定カード＋月跨ぎ仕訳をローカルpreviewに注入）。利用中¥15,000/未引落¥13,000(6/27)/引落済¥40,000(5/27)・展開明細・次回引落表示を確認。スクショ `shots/13-credit.png`。
- **月末締めバグ修正（2026-06-13）**：`ccClose=31` 等で `new Date(y,m,31)` が翌月へ繰り上がり利用期間が「4/1〜5/1」になる不具合を、`clampDay()`（当月末日に丸め）＋「前回締めの翌日」起点で修正。検証 `verify-credit.mjs` に締め31日カードを追加し「X/1〜末日」表示・バグ「X/1〜Y/1」非出現を確認。
- 引落仕訳の自動生成は従来どおり「勘定科目・口座」画面。CreditPageは閲覧専用（最小スコープ）。

## ✅ ポイント利用→雑収入の自動計上（仕訳入力）— 実装・検証済み（2026-06-13、フロントのみ・未デプロイ）

旧「ポイント利用」は摘要ラベルのみ（残高に非反映）だったが、**ポイント利用で支払額が減る分を帳簿に反映したい**との要望で、`JournalModal` を改修。
- 摘要下に **「🏷 ポイント利用 [金額] 円」** の数値入力を新設（旧トグルボタンは置換）。摘要に「（ポイント利用）」を付与。
- 計上先科目 `pointAccount`：収益かつ名称『雑収入』を優先、なければ『ポイント』含む収益、なければ先頭の収益科目。
- **挙動（ユーザー指定で合計加算から変更）**：明細は**使用額のまま**入力（借方・貸方とも定価で貸借一致）。保存時に**最大額の貸方（出金）行からポイント分を差し引き**、同額の貸方「雑収入」行を追加（**合計＝使用額のまま不変**、0になった出金行は除去）。編集時は摘要マーク＋雑収入貸方行を検出し、出金行へ戻して使用額表示に復元（往復安定）。
- 使い方：すべて使用額で入力し、ポイント分を欄に入れる。例）食費3,000・カード3,000・ポイント500 → 保存後 `借方 食費3,000 / 貸方 カード2,500・雑収入500`。
- 検証：`docs/design-gen/verify-point.mjs`（lines=`dr:e01=3000 / cr:b03=2500 / cr:d04=500`、desc に（ポイント利用））。スクショ `shots/14-point.png`。バックエンド変更なし（既存の line ホワイトリストで保存可、`points` 等の新フィールドは不使用）。
- [ ] **未デプロイ**：`npm run build`→app(`E32HZNCIT2MXUM`/`kakeibo-web-prod-117953360790`)へ sync＋invalidate で反映予定。バックエンド変更なし。

## ✅ ゲストログイン + ティア別広告 — 実装済み（2026-06-12、フロントのみ）

登録なしで試せる「ゲストとして試す」を追加。ゲストは `localStorage(kk4_guest)` のみ・API不送信。登録時に既存 `/api/import` で本番アカウントへ自動移行。バックエンド/インフラ変更なし。

**ティア概念 `guest|free|pro|family`**（課金未実装 → 実ログインは全員 `free`）。広告配置は `frontend/src/config/tiers.js` の `AD_CONFIG`、ゲスト上限は `GUEST_LIMITS`（タグ/口座/追加科目 各5件）。
- 広告: `Common/AdBanner.jsx`（ブロック/未配信時は枠を畳む）を `Common/Ad.jsx` で `React.lazy`。配置=サイドバー下部 / ナビ遷移ごと(ゲスト3回・Free6回) / ダッシュボードKPI⇄円グラフ間 / 仕訳帳下部。全画面インタースティシャルはAdSenseポリシー回避でインライン差込に変更。
- 誘導: `Common/Guest.jsx`（上部バナー / ダッシュボード登録カード / 仕訳11件超で1回モーダル）。
- 旧 `Common/DailyAd.jsx` は未使用（ファイルは残置）。
- **`VITE_ADSENSE_SLOT` 空の間は広告は一切表示されない** → AdSense審査中でも安全。

- [x] デプロイ済み（2026-06-12）：app(`E32HZNCIT2MXUM`)＋LP(`E2ANL068WDF75Y`)を sync＋invalidate。同時に客側入力上限（摘要100/名称50/コード20/備考200/タグ名50）・journal日付形式ガード・LPヒーローに「登録なしで試せる」訴求も反映。
## ✅ セキュリティ堅牢化 ②③④ — 実装・デプロイ済み（2026-06-12）

- **②③ サーバー側入力検証**（`kakeibo-saas-prod` を changeset確認→execute で更新済み）:
  - `apiHelper.tooLong()` を追加。journals=摘要200字＋`date`は`YYYY-MM-DD`必須、accounts=名称100/コード30/備考300、settings=タグ名100・口座名100・デフォルトタグ名50・備考300。
  - クライアント側 `maxLength`（前述）と二重化。import は件数上限(10000)で防御済みのため長さ検証は対話エンドポイントに限定。
- **④ CloudFrontセキュリティヘッダ**: 両配信に Managed-SecurityHeadersPolicy(`67f7725c-…`)を **in-place** で付与（HSTS/nosniff/X-Frame-Options:SAMEORIGIN/Referrer-Policy）。live応答で確認済み。
  - **CSPは未適用**（AdSense/Cognito/OAuthの許可リスト誤りでアプリが壊れるリスクが高いため、要テストの別タスク）。
  - **ドリフト注意**: app配信 `E32HZNCIT2MXUM` はテンプレート(`hosting/template.yaml`)に無い `app.kurofukubo.com`＋ACM証明書を持っていた。テンプレに alias/cert/RHP を追記して実態へ反映済みだが、**app stack(`kakeibo-web-prod`) の CFN 再デプロイ前に現状一致を要確認**（盲目的 deploy でドメインが外れる恐れ）。LPは `lp-template.yaml` にRHP追記済みで乖離なし。

## ✅ アカウント削除 / パスワード再設定 / 運営ダッシュボード / ads.txt 修正 等（2026-06-12）

- **ads.txt 修正**: `app.kurofukubo.com/ads.txt` が SPA フォールバックで HTML を返していた → `frontend/public/ads.txt` 追加で `text/plain` 配信に修正（広告は app サブドメインで出るためこちらが重要）。AdSense審査前の「ads.txt不明」は正常（未クロール）。
- **アカウント削除**: `DELETE /api/account`（SettingsFunction に追加）。全DynamoDBアイテム削除＋`AdminDeleteUser`（SRP/Google両対応）。SettingsFunction に `USER_POOL_ID` env と `cognito-idp:AdminDeleteUser` 権限を付与。フロントは設定画面の「アカウント削除」（"削除"入力で確定）。`kakeibo-saas-prod` を changeset確認→execute で更新済み。
- **パスワード再設定**: AuthPage に forgot/reset モード＋「パスワードをお忘れですか？」。Cognito `forgotPassword`/`confirmPassword` 利用（プール `AccountRecoverySetting=verified_email` 済み、バックエンド変更不要）。
  - ⚠️ **SESサンドボックス中は検証済み宛先にしかメール（再設定コード/登録確認）が届かない**。一般ユーザー向けにはSES本番アクセス（保留中）の承認が必要。
- **ゲスト導線**: `app.kurofukubo.com/?guest` で即ゲスト開始（AuthContextで`?guest`検知）。LPヒーローに「→ ゲストで試す」リンク追加（AdSense確認・レビュア向けワンクリック）。
- **運営ダッシュボード**: CloudWatch `kakeibo-prod-ops`（定義 `hosting/ops-dashboard.json`）。API流量/エラー/レイテンシ、Lambda呼び出し/エラー、DynamoDB消費、Cognitoサインイン/登録。登録総数はCLI、広告収益はAdSenseコンソール。**アプリ内管理画面は作らない方針**（家計データ横断閲覧を避ける）。
- **CSP**: AdSense承認＆広告描画確認後に Report-Only から導入（延期で合意済み）。

## 計画中（未着手）: AI仕分けモード ※設計確定・実装は保留

明示操作型（常時AIではない）。仕訳入力画面の「AI仕分け」ボタン → モーダルで明細テキストを貼付 → AIが解析 → プレビューで確認/修正 → 一括登録。

**確定した仕様:**
- **起動/対象**: 仕訳入力画面の「🤖 AI仕分け」ボタン。**ログインユーザーのみ**（ゲストは認証なしのため対象外＝ボタン非表示）。
- **フロー**: ボタン→モーダル（決済手段/口座を選択＋明細CSV/テキスト貼付）→「解析」→ `POST /api/ai/categorize`（Lambda+Claude Haiku）→ プレビュー（**全行編集可**・確信度表示）→ 選択行を一括登録。
- **役割分担＝ハイブリッド①（決定）**: AIは「テキスト解析＋汎用カテゴリ推定（food/transport等16種）」まで。**ユーザー固有の実科目への割当・学習はローカル**。AI結果はプレビューで全行修正可。**科目体系は外部に送らない**。
- **相手科目＝両方（決定）**: モーダルで決済手段/口座を選んで片側を固定＋**AI補正後に各行で人が選び直せる**。
- **提供範囲＝ログイン全員・回数上限つき（決定）**: 例 30回/日/ユーザー（DynamoDB `AIQUOTA#<日付>` でカウント）。
- **ローカル学習**: localStorage `kk_ai_learn` = {正規化摘要 → 费目科目id}。登録時に保存し次回自動適用。**端末ローカル完結・サーバー非送信**。
- **プライバシー/方針**: 送信は貼付テキスト（摘要+金額）のみ。残高・全履歴・科目体系は送らない。**明示オプトイン扱い**。プライバシーポリシー追記（現行§4「外部AIへ家計データを送信しません」の改定が必須）＋CLAUDE.md外部連携例外への追記が必要。
- **同意チェックボックス必須（決定・2026-06-13追加）**: AI仕分けモーダル内に「貼り付けた明細テキストが外部AI（Anthropic Claude）に送信されることに同意します」チェックボックスを設置。**チェックなしでは「解析する」ボタンを無効化**し使用不可。同意はlocalStorage `kk_ai_consent` に保存し次回からチェック済みで表示（モーダルからいつでも外せる）。**サーバー側でも** リクエストの `consent: true` フラグを必須とし、無ければ 400 を返す（クライアント改変への防御）。チェックボックス脇にプライバシーポリシー該当項へのリンクを置く。
- **入口UI（実装済み・2026-06-13）**: 仕訳入力画面に「🤖 AI仕分け（準備中）」ボタンを表示中（押すとトースト「準備中」）。LP機能セクションにも「AI仕分け Coming soon」カード掲載済み。実装時はこのボタンをモーダル起動に差し替える。
- **モデル/コスト**: `claude-haiku-4-5`、構造化出力(json_schema)、システムプロンプトを prompt cache。概算 **¥2前後/回**（明細50行）、Batchで半額。**回数上限でコスト青天井を防止**。無料枠は無い（従量課金）。
- **カテゴリ→既定科目マップ**: food→e01 / daily→e02 / utilities→e03 / comm→e04 / transport→e05 / medical→e06 / entertainment→e07 / clothing→e08 / housing→e09 / insurance→e10 / education→e11 / misc→e12 / salary→d01 / side_income→d02 / interest→d03 / other_income→d04（無ければ 雑費/雑収入 にフォールバック）。

**前提（お客様操作・未実施）**: Anthropic APIキーを作成 → SSM SecureString `/kakeibo/anthropic-api-key` に格納（フロント非保持）。キー未設定時はエンドポイントが 503 を返すので、コードを先に入れても安全。

**着手時のファイル（予定）**: backend `src/handlers/aiCategorize.js`(新)・`template.yaml`(関数/ルート/IAM/env・Timeout 30s)・`package.json`(`@anthropic-ai/sdk` 追加・IAMは DynamoDB(quota)+`ssm:GetParameter`)／frontend `api/client.js`・`components/Journal/AICategorizeModal.jsx`(新)・`JournalPage.jsx`(ボタン＋guestゲート)／ポリシー・CLAUDE.md 追記。

## ✅ ブラッシュアップ一斉対応（2026-06-13、全デプロイ済み）

**バグ修正（重大）:**
- `RecurringPage.generateAll` が古いクロージャの `nextDate` を参照し**無限ループ（仕訳が無限生成）**するバグを修正。日付をローカル変数で進める方式＋1件あたり120回の安全上限。

**機能矛盾の解消（LP/ガイドが謳うのに未実装だったもの）:**
- **クイック入力を実装**（`Journal/QuickEntry.jsx`、kakeibo.html の qeParse を移植）。仕訳入力画面上部に常設。「食費 1200 現金 / メモ」形式・ライブプレビュー・Enter記帳・自動分類ルール連動。
- **予算管理をUIに配線**（`Dashboard/BudgetPanel.jsx`）。ダッシュボードに「今月の予算」カード（進捗バー・経過日数・日割り残・超過警告）＋「予算設定」ボタン（既存BudgetModalを起動）。
- 定期取引の文言を実装に合わせ修正（「アプリを開くだけで自動記帳」→「ワンクリックでまとめ記帳」: LP・guide-start・アプリ内ガイド）。

**セキュリティ強化:**
- **OAuth に state（CSRF対策）+ PKCE S256（コード横取り対策）を追加**（`auth/oauth.js`）。authorize が新パラメータ付きで Google へ 302 することを本番確認済み。
- 仕訳 `lines` のフィールドをホワイトリスト化（accountId/side/amount/taxRate/splits{tagId,amount}のみ保存）＋ lines≤100・splits≤50 上限（journals.js）。
- **API Gateway スロットリング**: 25 rps / burst 50（template.yaml MethodSettings、適用済みをコンソールAPIで確認）。

**表示・整合性:**
- Cognitoエラーの日本語化（AuthPage、主要11種を前方一致マッピング）。
- 新規ユーザー PROFILE の theme を 'light' に（postConfirm.js）。
- 旧 `Common/DailyAd.jsx` を削除（AdBanner置換後の残骸）。
- アプリ内ガイドの予算説明を新導線（ダッシュボード）に更新。

**AI仕分け Coming soon:**
- 仕訳入力画面に「🤖 AI仕分け（準備中）」ボタン（押すとトースト）。LP機能セクションに「AI仕分け Coming soon」カード追加。
- AI計画に**同意チェックボックス必須**を追記（チェック無しでは解析不可・localStorage `kk_ai_consent`・サーバー側でも `consent:true` 必須・privacy§4の改定が実装時に必要）。

## ✅ ユーザー定着・シンプル化（2026-06-13、フロントのみ・デプロイ＆本番スクショ検証済み）

機能過多による離脱対策。**バックエンド変更なし**・全UI本番確認済み。

- **初回オンボーディング**（`Onboarding/OnboardingModal.jsx`）: 初回ログイン時に「ようこそ」モーダル自動表示。口座→記帳→全体像の3ステップ＋各「この画面へ」ボタン。`localStorage kk_onboarded` で初回のみ。
- **セットアップ・チェックリスト**（`Onboarding/SetupChecklist.jsx`）: ダッシュボード上部に進捗（口座登録/記帳/レポート閲覧）。全完了 or ×で消える（`kk_setup_dismissed`/`kk_setup_report`）。
- **いつでも再表示**: サイドバー最上部に「🚀 はじめかた」常設（モーダル再表示）。
- **画面の絞り込み**: 設定→「表示する画面」チェックで左メニューから隠せる。コア（ダッシュボード/仕訳入力/設定）は常時表示。`localStorage kk_nav_hidden`。
- **サイドバーのセクション分け**: メイン/レポート/管理（`config/nav.js`）。settingsラベルを「設定」に変更しページも「設定」として再構成。
- **空状態の誘導**（`Common/EmptyState.jsx`）: 仕訳・タグ・定期取引が空のとき次の操作ボタン付き案内。
- **用語ツールチップ**（`Common/InfoTip.jsx`＋global.css）: BS/PL/CFタイトルと仕訳の借方/貸方に「?」ホバー解説。
- 状態管理: `contexts/UIContext.jsx`（currentPage/navigate/hiddenNav/onboarding を集約）。App.jsx を AppShell+UIProvider に再構成。
- 新規: `config/nav.js`, `contexts/UIContext.jsx`, `Onboarding/{OnboardingModal,SetupChecklist}.jsx`, `Common/{InfoTip,EmptyState}.jsx`。

## ✅ レポートエクスポート（CSV / PDF 選択式）— 実装・デプロイ・E2E検証済み（2026-06-13、フロントのみ）

BS / PL / CF / 仕訳帳の見出しに「**エクスポート ▾**」ボタン → メニューで「CSVでダウンロード」「PDFでダウンロード」。出力は PeriodBar の現在期間を反映。**バックエンド変更なし**・ゲスト/ログイン両対応。

- **CSV**: `utils/csv.js` の `downloadCSV()`（Blob・**UTF-8 BOM**でExcel文字化け防止・RFC4180エスケープ・金額は記号/桁区切りなし）。列＝PL/BS/CF=`区分,科目,金額(残高)`＋合計、仕訳帳=`日付,摘要,借方,貸方,金額`。
- **PDF**: `utils/pdf.js` の `downloadElementPDF()`＝**html2canvas→jsPDF**でレポート要素をA4 PNG化し `doc.save()` で**即DL（印刷ダイアログなし）**。日本語はブラウザ描画なのでフォント埋込不要。ダーク時は一時的にライト配色で取得。**jspdf/html2canvas は動的import（遅延チャンク）**で初期バンドル不増（メイン269KB据え置き、PDFチャンク計約0.6MB gz）。
  - 当初の jsPDF+autotable+日本語フォント案は、フォント取得/CFF埋込の不安定さ・ライセンスを避けるため **html2canvas方式に変更**（トレードオフ: PDFは画像ベースで本文テキスト非選択。データ用途はCSVで担保）。グラフは対象外（BS/PL/CF/仕訳帳は表）。
- 共通: `Common/ExportMenu.jsx`＋`Common/ReportPrintHeader.jsx`（ブランド/レポート名/対象期間/出力日）。差し込み先 `Reports/{BSPage,PLPage,CFPage}.jsx`・`Ledger/LedgerPage.jsx`。
- **E2E検証**（Playwright `docs/design-gen/verify-export.mjs`）: PLでCSV→BOM有・`区分,給与収入,320000`等を確認／PDF→`%PDF-`・約2.6MB・ダイアログなしDLを確認。
- 依存追加: `jspdf@4.2`, `html2canvas@1.4`（遅延ロード）。
- 将来: 「月次まとめ」(3表1PDF)、テキスト選択可PDFが要れば日本語フォント埋込版を別途。

## ✅ 不具合修正・UX改善 6件（2026-06-13、フロントのみ・デプロイ＆E2E検証済み）

1. **多重起票バグ修正**: `JournalModal` の「記帳する」に `saving` ガード＋ボタン `disabled`（連打で同一仕訳が複数作成されていた）。
2. **仕訳帳の編集が無反応 → 修正**: `LedgerPage` に `JournalModal` 未配置・編集ボタンに `onClick` 無し → 配線（E2E: 編集→「仕訳編集」モーダル表示を確認）。
3. **クレカ返済の自動記帳を復活**（kakeibo.html `genCCSettle` を移植）: `AccountsPage` に「クレジットカード返済」セクション＋「クレカ返済を生成」ボタン。締め済み利用分を集計し当月引落日に `クレカ→引落口座` 仕訳を生成（生成済みは重複しない）。E2E: `2026-06-27 クレカ返済(5月締め分) dr クレカ/cr 普通預金` 生成・再実行で重複なしを確認。
4. **プリセット作成ボタンを明確化**: 「＋ 入金/出金」→「よく使う仕訳をワンタップ登録:」ラベル＋「＋ 入金プリセット／＋ 出金プリセット」。
5. **自動分類ルールの説明追加＋編集/削除を配線**: 用途説明（例「コンビニ→食費/現金」）＋InfoTip。編集/削除ボタンが無反応だったのを `RuleModal`/`setRules` に配線。
6. **クレカの利用月≠支払月**: BSは「期末時点の累計残高」（当月のみではない）。クレカは利用＝発生月に費用/負債、支払＝引落月に負債/預金で2回記帳されるのが正。#3の返済生成＋未払残高表示でサイクルを可視化。さらなる改善案（未実装）: 次回引落予定額の常時表示、締め期間ごとの「クレカ明細」ビュー。

検証ツール: `docs/design-gen/verify-fixes.mjs`（CC生成・編集モーダル）。#1は実装＋ビルドで担保。

## ✅ CSV取込の修正 2件（2026-06-13、フロントのみ・E2E検証済み）

1. **ヘッダー有無を選択可能に**: `parseCT(t, hasHeader)` に引数追加。CSVModal step1 に「1行目はヘッダー行として読み飛ばす」チェックボックス（既定ON）。OFFで1行目もデータとして取込。E2E: ヘッダー無し/有りとも正しく2行取込を確認。
2. **失敗後に再選択できないバグ修正**: file input の `onChange` で `e.target.value=''` を即時クリア（ブラウザは同一ファイル再選択時に change を発火しない仕様への対処）。E2E: 失敗→value空→再選択で成功を確認。
- 検証ツール: `docs/design-gen/verify-csv.mjs`。

## ✅ 追加修正 2件（2026-06-13、フロントのみ・E2E検証済み）

1. **CSV取込：科目選択のリセット**: step2 に「選択をリセット」ボタン。手動で変えた借方/貸方の上書き・スキップを初期状態（CSV/ルール由来）に戻す。`deriveInitial()` を ingest と共用。E2E: 一括変更→リセットで初期値復帰を確認。
2. **円グラフ tooltip の金額/％混在を改善**: `PieChart` の tooltip を「金額」「構成比」のラベル付き2行に（従来は `chart-tip-val/pct` にCSSが無く連結表示されていた）。E2E: `金額 ¥24,000 / 構成比 65.2%` 表示を確認。
- 検証ツール: `docs/design-gen/verify-misc.mjs`。
- 参考(#3 クレカのポイント割引の仕訳)はチャットで回答（A:実支払のみ簡易記帳／B:本来額を費用計上しポイントを雑収入計上／請求充当は クレカ減・雑収入）。実装要望あれば「ポイント利用」雑収入科目＋プリセット追加で対応予定。

## ✅ クレカ ポイント利用の記帳ラベル（2026-06-13、フロントのみ・E2E検証済み）

要件「厳密不要・記帳で分かる・口座残高は確実」に対し、`JournalModal` の摘要欄に**ワンタップの「🏷 ポイント利用」トグル**を実装（摘要に `（ポイント利用）` を付与/解除）。仕訳帳の摘要にそのまま残り後で識別可、**残高・タグ集計に副作用なし**。運用ルール＝クレカ貸方は実請求額（ポイント値引き後）にすれば未払残高・引落が正確。検証 `docs/design-gen/verify-point.mjs`。

> 当初の推奨（標準タグ＋プリセット）から方針変更した理由: **(1) プリセットは現アプリで「適用＝記帳」導線が未実装の死に機能**、**(2) タグは資産配分用で費用明細に付けると「タグ・配分」集計に紛れる**。そのため目印は摘要ラベルが最軽量で副作用なしと判断。
> フォローアップ候補: ~~①プリセット適用導線~~ → **下記で実装済み**。②仕訳帳でタグをチップ表示（未実装）。

## ✅ プリセット機能の復活（適用して記帳）（2026-06-13、フロントのみ・E2E検証済み）

これまで作成のみで「適用＝記帳」導線が無かったプリセットを実用化（LP/ガイドの「プリセット化できる」が実態に一致）。
- `JournalModal` に `preset` prop を追加し、開く際にプリセットの摘要・行（科目/借貸/金額・amount0=都度入力は空欄・tagId→split）を事前入力。
- `JournalPage` にプリセットチップ（タップで該当モーダルを事前入力表示）。新規/編集とプリセットの状態を分離（`presetData`）。
- 管理（作成/編集）は従来どおり「勘定科目・口座」、適用（記帳）は「仕訳入力」。
- E2E `verify-preset.mjs`: チップ→事前入力（摘要/金額）→記帳で正しい仕訳生成を確認。

## 保留中（外部待ち・要確認クリック）

- [ ] **SES本番アクセス**：申請は **DENIED（却下）**（ケース 178113029200250）。CLI再申請は `ConflictException` で不可 → **コンソールで対応必須**（SES→Account dashboard→Request production access、または Support Center でケースに返信）。承認までサンドボックス（検証済み宛先のみ・200通/日）。
  - 当面の代替: Cognito 既定メール（COGNITO_DEFAULT, 50通/日・任意宛先）に切替可能（要 backend デプロイ）。**採用可否は未決**。
- [ ] **設計書**: `docs/design-gen/`（再生成可能なツール）で `kurofukubo-design.xlsx`（6シート+スクショ13枚）を生成済み。Google Drive にアップ→「Googleスプレッドシートで開く」で利用。スクショ更新は `node shoot.mjs`、xlsx再生成は `node build-xlsx.mjs`。
- [ ] **SNSアラート購読確認**：`kou.t51501023@gmail.com` 宛の確認メールのリンクを未クリックなら要クリック（未確認だと通知が飛ばない）。

## ✅ Googleログイン（自前画面 + Google）— 実装・デプロイ済み（2026-06-11）

メール/パスワード(SRP)を残しつつ「Googleでログイン」を追加。dev/prod両方デプロイ・配信済み。authorizeエンドポイントが正しくGoogleへ302することを確認済み。

**実装内容:**
- backend: Cognitoドメイン `kurofukubo-auth-{dev,prod}`、OAuth(code/email,openid,profile)、Google IdP（secretは各アカウントの **SSM SecureString `/kakeibo/google-client-secret`** に格納）
- backend: **PostAuthentication トリガー追加**（`src/handlers/postAuth.js`）。外部IdP(Google)ユーザーは PostConfirmation が発火しないため、初回ログイン時にPROFILE未作成なら `seedDefaults()` でデフォルト科目を投入（既存ユーザーは重複しない）
- frontend: `src/auth/oauth.js`（authorize/token/refresh/logout）、`AuthContext` を OAuth対応（SRPと併存）、`AuthPage` に「Googleでログイン」ボタン、`.env` に `VITE_COGNITO_DOMAIN` 追加

**secret を渡すデプロイコマンド（samconfigには入れない。CLI overrideは全置換なので全paramを渡す）:**
```
# prod（changeset確認のため --no-execute-changeset → execute-change-set 推奨）
$sec = (aws ssm get-parameter --name "/kakeibo/google-client-secret" --with-decryption --query "Parameter.Value" --output text --profile kakeibo-prod --region ap-northeast-1)
sam deploy --config-env prod --parameter-overrides "Stage=prod AllowedOrigin=https://app.kurofukubo.com AlarmEmail=kou.t51501023@gmail.com SesIdentityArn=arn:aws:ses:ap-northeast-1:117953360790:identity/kurofukubo.com GoogleClientId=523001709993-6cin9bk495b864ta8e7r3s76q12e5qom.apps.googleusercontent.com GoogleClientSecret=$sec"
```
> 注: `client_secret` は `ssm-secure` 動的参照が Cognito IdP では**非対応**なので、デプロイ時にSSMから読んでCLIで渡す方式。

**要確認・残課題:**
- [ ] **実ブラウザでGoogleログインE2E**（私はブラウザ実行不可。`https://app.kurofukubo.com` でGoogleボタン → ログイン → 科目が表示されるか）
- [ ] **OAuth同意画面が「テスト」状態だとテストユーザーのみログイン可**。一般公開するにはGoogle Cloud Consoleで「公開」に変更（email/profile/openidは非機密なので審査不要で公開可の見込み）
- [ ] **アカウント連携なし**：同じメールでも「Google」と「メール/パスワード」は別Cognitoユーザー(sub別→データ別)になる。同一人物で共有したいなら account linking 実装が別途必要

旧メモ（実施順の記録）:

**実施順（依存関係）:**
1. ✅（私）Cognito **User Pool ドメイン** `kurofukubo-auth-${Stage}` を作成・デプロイ済み（dev/prod両方）
2. ✅（私）アプリクライアントの **OAuthフロー（code）/スコープ(email,openid,profile)/コールバックURL（=AllowedOrigin）** を設定・デプロイ済み
3. ✅（私 → あなた）リダイレクトURI 提示済み:
   - prod `https://kurofukubo-auth-prod.auth.ap-northeast-1.amazoncognito.com/oauth2/idpresponse`
   - dev  `https://kurofukubo-auth-dev.auth.ap-northeast-1.amazoncognito.com/oauth2/idpresponse`
4. ⏳（あなた）Google Cloud Console（**prod/dev両方のリダイレクトURIを登録**、ID/シークレットを共有）:
   - プロジェクト作成 → OAuth同意画面（外部・アプリ名・サポートメール）
   - 認証情報 → OAuthクライアントID（ウェブアプリ）→ 承認済みリダイレクトURIに手順3の値を登録
   - **クライアントID / シークレット**を共有
5. （私）Cognito に **Google IdP** を設定（クライアントID/シークレット、スコープ email/profile/openid）
6. （私）フロント `AuthContext` を OAuth フローに移行（自前画面のボタンからCognito OAuthへリダイレクト、コールバック処理、トークン保存）
7. 実ユーザーでログイン〜API疎通のE2E確認（SES承認後ならメール確認も込みで）

**手戻り注意:** コールバックURLは将来ドメイン変更時に Cognito/Google 双方で再登録が必要（今回は `app.kurofukubo.com` 確定済みなので発生しない見込み）。

## 広告（Google AdSense / 1日1回・インラインバナー）

実装済み：`frontend/src/components/Common/DailyAd.jsx`（本文上部に1日1回だけ表示、×で閉じれる。localStorage `kk_ad_shown` で日付判定）。`App.jsx` の `<main>` 直下に配置。**env が空なら何も表示しない**ので現状デプロイ安全。

**publisher ID = `ca-pub-1494837719359912`（取得済み）。審査コード設置・配信済み:**
- [x] LP全ページ（index/terms/privacy）の `<head>` に審査コード設置・配信済み
- [x] `ads.txt`（`google.com, pub-1494837719359912, DIRECT, f08c47fec0942fa0`）を `https://kurofukubo.com/ads.txt` に配置・配信済み
- [x] アプリ `frontend/index.html` の `<head>` にも審査コード設置、`.env.production` に `VITE_ADSENSE_CLIENT` 設定済み・再ビルド配信済み
- [ ] **あなた**: AdSense管理画面で「審査をリクエスト」
- [ ] 審査通過後、広告ユニット作成で **スロットID** を取得 → `.env.production` の `VITE_ADSENSE_SLOT` に設定 → `npm run build` → app バケットへ sync ＋ CloudFront `E32HZNCIT2MXUM` 無効化（SLOT未設定の間は `DailyAd` は非表示）
- 却下リスク対策として **クロール可能なガイド記事を追加・公開済み**（`lp/guides.html` ハブ ＋ `guide-start.html` / `guide-double-entry.html` / `guide-bs-pl.html`、index,follow、sitemap登録、トップnav/footerから内部リンク）
- 広告表示位置：**アプリ内のみ**（`app.kurofukubo.com`、ログイン後にダッシュボード等の本文上部に1日1回）。LPには広告枠なし（headの検証スクリプトのみ）

**未対応（AdSense審査・コンプラ要件、要対応）:**
- [x] プライバシーポリシー（`lp/privacy.html` 第7項）に第三者Cookie/AdSense利用を明記済み。`CLAUDE.md` にも例外追記済み
- [x] LP公開：`https://kurofukubo.com`（+www）をHTTPSで公開（プライバシーポリシーが到達可能に＝AdSense審査の前提クリア）。スタック `kakeibo-lp-prod`(us-east-1)
- [x] OGP画像 `lp/ogp.png`（1200x630、resvg生成）配置・配信済み（`og:image` 参照済み）
- [x] LP「雛形」notice除去・運営者表記＝「個人開発者」に確定（terms/privacy）
- [x] **問い合わせ窓口**：Googleフォーム `https://forms.gle/bWjXVifk6tQbEXpQ7` を privacy 第9条＋全LPページのフッターに設置・配信済み
- [x] **ブランド名を `kurofukubo` に統一**：LP全ページ（title/nav/本文/JSON-LD/copyright）＋アプリ（index title・Sidebar・AuthPageのh1）から "Kakeibo"/"複式家計簿"の併存を解消。OGP画像も `kurofukubo` で再生成
- [x] **確定申告の記載を削除**：LP FAQの確定申告項目を削除、terms第7条からも「確定申告」文言を除去
- ＝ AdSense申請の前提（実体ある連絡先・一貫したブランド・矛盾なし・コンテンツ）はすべて充足。ユーザーが管理画面で「審査をリクエスト」すればOK
- [x] **LP料金を Coming soon 化**：有料プラン（Pro/Family）の価格カードを撤去し「ベータ版・全機能無料／有料は準備中」に。比較表の月額も「無料（ベータ）」に。terms 第3条も整合（更新日 6/11）
- [x] **矛盾修正（AdSense対策）**：JSON-LDの架空レビュー(aggregateRating 4.8/24)削除、FAQ「お使いのAWSアカウント上のDynamoDB」→運営者AWSに訂正、FAQ確定申告/プラン質問をベータ無料に整合（未実装のPWA・確定申告を売り文句から除去）
- [ ] 更新時の配信：`aws s3 sync lp s3://kakeibo-lp-117953360790 --delete --profile kakeibo-prod --region us-east-1` ＋ 必要なら `aws cloudfront create-invalidation --distribution-id E2ANL068WDF75Y --paths "/*"`
- [ ] EU/英国向けに出すなら同意管理（CMP）が必要。日本のみ運用なら当面は告知ベースで可
- [ ] `CLAUDE.md` の「外部APIとの連携は行わない」方針に AdSense は例外として追記が必要（明示判断済み）
- 注: AdSense はポップアップ/モーダル内掲載が**規約違反**のためインラインバナーで実装している（モーダル化しないこと）

## UI改善・セキュリティ（2026-06-11）

実施済み（配信済み）:
- アプリ：既定テーマをライトに（`main.jsx` で `kk_theme` 復元、既定light）／円グラフ凡例CSSを追加し金額と％を明確化／カレンダーに「今日」ボタン／操作ガイドページ追加（`Guide/GuidePage.jsx`、Sidebar/PAGESに登録）／ブランド名 `kurofukubo` 統一（title/Sidebar/AuthPage）
- LP：全ページをライトテーマ化（配色を `variables.css` のlightに合わせた値へ）／ブランドロゴをトップへのリンク化／CTAボタンを白文字で可読性改善／X(Twitter)を「準備中」表記

**セキュリティ所見（コードレビュー）**：堅牢。Cognito JWT認証(全データ経路)、サーバ側でPK=userId強制のテナント分離、入力検証(借貸一致)、import時のクライアントキー破棄＋件数上限(1万)、SSMにsecret、private S3+OAC、CORSはALLOWED_ORIGIN固定。
- 추천(任意・非緊急): ①API Gatewayにスロットリング/WAF ②文字列フィールドの最大長制限 ③journalの`date`形式検証(YYYY-MM-DD) ④CloudFrontにセキュリティヘッダ(CSP等) ⑤Cognito MFA任意化。いずれも現状の致命的脆弱性ではない。

## その後

- [ ] **UI/UX モダン化**：着手時に方向性を決める — (a)見た目リフレッシュのみ / (b)入力導線の簡素化（簿記を裏に隠す）。参考アプリを共有してもらう。
- [ ] ゲート2：Stripe課金（Free枠制限・特商法表記）。継続率が見えてから。

## 補足

- draw.io MCP は未接続。使うなら `claude mcp add drawio -- npx -y @drawio/mcp`（公式・.drawio生成型）等。現状の構成図は `docs/architecture.drawio`。
