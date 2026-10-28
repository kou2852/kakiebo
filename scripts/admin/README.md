# ローカル管理者ダッシュボード

kurofukubo の運営者が毎日見る数字を、1人用のローカル画面に出すツール。
**127.0.0.1 限定**で待ち受ける。数字だけを出し、解釈・アドバイスは画面に載せない（解釈は Claude 側で行う）。

## 使い方

```bash
aws sso login --profile kakeibo-prod     # 未認証のとき
node scripts/admin/server.mjs            # ブラウザが開く（開かないとき: --no-open / ポート変更: PORT=8788）
```

- すでに起動していれば「すでに起動しています」と出て、同じ画面をブラウザで開くだけ。
- AWS の認証が切れていると、画面の上に `aws sso login` の案内が出る。
- AWS SDK は `scripts/admin/report/node_modules` のものを使う。無いときは `cd scripts/admin/report && npm install`。
- 「更新」は、サーバーがとっておいた結果を使わずに取り直す。

## 画面（タブは見る頻度の順）

| タブ | 頻度 | 中身 |
|---|---|---|
| 今日 | 毎日 | 状態の判定（赤・黄を上に、正常は畳む） / 対応すること（返信待ちの問い合わせ・前回見た後のご意見と退会） / 昨日（確定）・今日（途中）・昨日までの7日平均・今日と同じ時刻までの7日平均 |
| 獲得 | 週1回 | 新規登録・登録ユーザー・実人数・オープン（前の同じ長さの期間との差つき） / ウェブの獲得ファネル / アプリの獲得の流れ（iPhone・Android 別の段ごとの人数） / アクティベーション / 日別の推移 / 媒体・記事別の流入 |
| 継続 | 週1回 | 稼働（ログインして使っている人の日・週・月 = DAU・WAU・MAU。端末別・記帳した人・粘着度・日別） / 登録ユーザーの利用状況（7日・30日以内に開いた人・書いた人、記帳の続き方） / ゲストの継続（ウェブ `retain_*`・アプリ `m_retain_*`） |
| 声 | 毎日 | 問い合わせ（返信待ちが上、返信済み・終了は畳む。返信はここから） / ご意見 / 退会。前回見た後の分に「新着」の印 |
| 深掘り | 必要時 | どこで消えたか・行動列 / 端末別の利用 / 自前イベントの全件 / 時間帯別（日本時間）/ デバイス・OS・参照元 / ボット UA・自分IP / 登録ユーザーの人ごとの表 |

- 期間（直近 7・14・30・90日、または開始日〜終了日。日本時間の暦日）が効くのは獲得・継続・深掘り。獲得だけ「前の期間と比べる」（直前の同じ長さの期間）がある。稼働と利用状況は期間に関係なく「いま」の値。
- 声のタブ名の赤い数字 = 返信待ち + 新着のご意見 + 新着の退会。「前回見た」時刻はブラウザの localStorage に持つ（声を最後まで開いた時刻）。
- 各ブロックに取得時刻が出る。「保持」は、サーバーがとっておいた結果を使ったという意味。

### 判定のルール（Discord 定時レポートと共有）

`report/src/metrics.mjs` に一本化している。画面と Discord で数字が食い違わないよう、ここだけを直す。

- ボット・自分IP・ファネル・状態の基準
- **オープンは GET だけを人間に数える**。HEAD（Discord 監視）・OPTIONS・ルートへの POST は「GET以外」として除外
- 記帳の判定（`isWriteReq`）: `/api/journals`・`/api/encdata`・`/api/import` への POST / PUT（API Gateway のステージ名 `/prod` 付きの path）
- CSP の違反報告（`/_e/csp-report`）は利用者のイベントに入れず、件数だけ別に数える
- 期間・日付は日本時間の暦日

## 構成

```
server.mjs        ルーティング・Host/Origin の検査・起動時の認証確認
lib/aws.mjs       SDK クライアント・認証エラーの案内・Logs Insights
lib/reads.mjs     画面用の読み取り（ログの同期・状態・問い合わせ・ご意見・退会・端末別・今日）
lib/analyze.mjs   CloudFront ログからアクセスとイベントを集計（AWS には触れない）
lib/derive.mjs    稼働・利用状況・期間・新規登録の計算（純粋な関数。test/derive.test.mjs）
lib/cache.mjs     取得結果を一定時間とっておく（状態5分・ログの集計5分・問い合わせ2分・退会10分・利用状況30分）
ui/               画面（index.html / app.css / app.js）。ビルドなし
report/           Discord 定時レポート（別スタック）。collect.mjs の読み取りは画面も使う
```

## 安全

- `Host` が `localhost:<ポート>` か `127.0.0.1:<ポート>` でない要求は断る。
- 本番への書き込みは「問い合わせへの返信」だけ（`POST /api/inquiry-reply`）。同じ Origin から `Content-Type: application/json` で来たものだけ受ける。
- メールアドレスは取得しない（Cognito は `sub` だけを読む）。利用者は sub の先頭8桁で表す。IP は画面に出さない（自分のIPの一覧だけは例外）。

## 読むデータ

| 何を | どこから | 保持 |
|---|---|---|
| アクセス・自前イベント | S3 `kakeibo-cf-logs-117953360790/app/` → `.cache-cflogs/` に増分で写す | 集計5分 |
| 端末別の利用 | API Gateway のアクセスログ（Logs Insights）。過ぎた日は `.cache-platforms/` に日別で保存（判定を変えたら `PF_CACHE_VERSION` を上げる） | 5分 |
| 登録ユーザー・メール送信の設定・SES | Cognito・SES | 5分 |
| 稼働（DAU・WAU・MAU） | 端末別と同じ API のアクセスログ（日別・sub 別・端末別のキャッシュ）。自分のアカウントは `lib/config.mjs` の `SELF_SUBS` で除く | 5分 |
| 登録ユーザーの利用状況 | DynamoDB（`kakeibo-prod` の全件を scan。読む項目は PK・SK・日時だけ）と Cognito。**全件を読むので長めにとっておき、「更新」で取り直す** | 30分 |
| 監視の4指標・掃除ジョブ | CloudWatch | 5分 |
| 問い合わせ・ご意見 | DynamoDB（元の `kakeibo-prod` と専用テーブルの両方。専用テーブルが無ければ元だけ） | 2〜5分 |
| 退会 | API Gateway と SettingsFunction のログ（Logs Insights） | 10分 |

## 計測イベント

アプリ・ウェブが `/_e/<イベント名>` に送るもの。日本語名と分類は `ui/app.js` の `EV_MAP`（一覧にないものは「その他」に出て、今日タブに「一覧にないイベント」の行が出る）。

- **人** = ブラウザ（端末）ごとに1回だけ送る / **回** = 毎回送る
- ウェブ: `app_open` `app_first` `auth_view` `guest_start` `guest_first` `guest_return` `journal_added` `first_journal` `registered` `retain_d1/d7/d30` `tour_*` ほか
- モバイルアプリ（新しく入れた端末だけ。`mobile/src/store/TrackSync.jsx`）: `m_onboard_done` `m_opening` `m_card_set` `m_first_journal` `m_tag_alloc` `m_intro_tour` `m_retain_d7` `m_retain_d30`
- 継続は端末の localStorage に初回利用日だけを持ち、「N日以上たって戻った」という事実だけを送る。個人を追跡できる識別子は送らない。`kk_noanalytics=1` のブラウザは何も送らない。
- 計測導入の直後（ウェブ 2026-08-02、アプリ 2026-10-16）は、既存の利用者の分が新規として上乗せされる。

## テスト

```bash
cd scripts/admin/report && npm test          # 判定ルール・Discord の文面
node --test scripts/admin/test/derive.test.mjs  # 稼働・利用状況・期間の計算
```

## 手元のスクリプトとの関係

登録ユーザーの利用状況の定義（最終利用日・最終書込日・記帳日数・「N日以内」）は
`docs/design-gen/report-users.mjs`・`report-journal-days.mjs`（手元だけの道具。`.gitignore` 対象）と同じ。
同じ時刻に両方を実行して、集計値が一致することを確かめている。スクリプトは消さない。

## 管理アプリ（Windows・iOS）

同じ画面を、Windows のデスクトップアプリと iOS アプリ（TestFlight で配る。App Store には出さない）でも見られる。
数字は Lambda（`api/`、別スタック `kakeibo-admin-api-prod`）から取り、ログインは管理者専用の Cognito プール（TOTP 必須）。
計画とレビューの記録は `docs/admin-apps-plan.md`。

```
api/        Lambda（関数 URL）。lib/routes.mjs を共有し、トークン検証と IP を返さないことだけが違う
  template.yaml   デプロイ・片付け・トークン取り消しのコマンドは冒頭に（どれも本番への干渉＝許可制）
  dev-server.mjs  本番の Cognito と Lambda を使わずに試すサーバー（偽の Cognito。コードは 123456）
desktop/    Electron。npm run dist → release/ にインストーラー（署名なし）
ios/        Expo（SDK 54）＋ WebView。npm run bundle-ui で画面を1枚の HTML にまとめる。EAS で TestFlight へ
ui/transport.js  手元の版では何もしない。アプリでは宛先とトークンを差し替え、同時に2本までに絞る
```

- 宛先の設定: `desktop/config.json`・`ios/config.json`（`apiBase`・`clientId`・`region`。デプロイの出力 `ApiUrl`・`AdminClientId`）。今は試験用サーバー向け。
- アプリ版は自分IPの一覧を出さない（「ローカル版でだけ表示」）。
- 更新トークンの保存先: Windows は `safeStorage`（Windows の資格情報で暗号化）、iOS はキーチェーン（この端末だけ）。
- 自動更新はしない。Windows は exe を作り直して入れ直す。iOS は TestFlight のビルドが 90 日で切れるので、その前に出し直す。

```bash
node --test scripts/admin/api/test/api.test.mjs scripts/admin/api/test/iam.test.mjs   # 認証・振り分け・IAM の漏れ
UI_FIXTURES=<手元の応答を置いたフォルダ> node --test scripts/admin/test/ui-escape.test.mjs  # 描画のエスケープ（手順はファイル冒頭）
```
