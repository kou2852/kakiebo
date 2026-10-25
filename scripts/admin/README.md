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
| 今日 | 毎日 | 状態の判定（赤・黄を上に、正常は畳む） / 対応すること（返信待ちの問い合わせ・前回見た後のご意見と退会） / 昨日（確定）・今日（途中）・昨日までの7日平均 |
| 成長 | 週1回 | 新規登録・登録ユーザー・実人数・オープン / 獲得ファネルと継続 / アクティベーション / 日別の推移 / 媒体・記事別の流入 |
| 声 | 毎日 | 問い合わせ（返信待ちが上、返信済み・終了は畳む。返信はここから） / ご意見 / 退会。前回見た後の分に「新着」の印 |
| 深掘り | 必要時 | どこで消えたか・行動列 / 端末別の利用 / 自前イベントの全件 / デバイス・OS・参照元 / ボット UA・自分IP |

- 期間（7・14・30・90日）が効くのは成長と深掘りだけ。
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
lib/cache.mjs     取得結果を一定時間とっておく（状態5分・ログの集計5分・問い合わせ2分・退会10分）
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
