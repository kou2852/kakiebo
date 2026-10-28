# 管理ダッシュボードのアプリ化 計画（Windows デスクトップ / iOS TestFlight）

作成 2026-10-27。対象は `scripts/admin`（ローカル管理ダッシュボード）。

## 目的と完成の定義

- Windows のデスクトップアプリと iOS アプリ（TestFlight で配り、App Store には出さない）で、今の画面（今日・獲得・継続・声・深掘り）と同じ数字が見られる。
- どちらのアプリも、数字は **Lambda** から取る。アプリは AWS の認証情報を持たない。
- 今のローカル版（`node scripts/admin/server.mjs`）は**そのまま動き続ける**。数字の定義は1か所（`lib/` と `report/src/metrics.mjs`）のまま。
- 守るルール（P0〜P2 と同じ）: 画面は数字だけ／メールは取らず sub の先頭8桁／IP は出さない（自分IP一覧だけ例外）／本番への書き込みは問い合わせ返信だけ／`lp/*`・`frontend/*`・`mobile/*` は触らない／本番への干渉（デプロイ・ユーザー作成・ビルドの提出）は毎回許可を取る。

完成の判定:
1. Lambda をローカルで呼んだ結果（`/api/stats?days=14` など全10本）が、同じ時刻のローカル版の結果と一致する（`generatedAt`・`cached` 以外）。
2. トークン無し・期限切れ・別プールのトークン・改ざんしたトークンは 401。テストで確かめる。
3. Windows: インストーラー（exe）が作れ、起動→ログイン→5タブが表示される。
4. iOS: EAS でビルドが通り、TestFlight に上がる（提出は許可を取ってから）。
5. 既存テスト（20件＋7件）と新規テストがすべて通る。

## 全体の形

```
[Windows アプリ (Electron)]  ┐  同じ画面（scripts/admin/ui）を同梱
[iOS アプリ (Expo + WebView)]┘
        │ ① ログイン: Cognito（管理者専用プール）に メール＋パスワード → ID トークン
        │ ② GET /api/... に Authorization: Bearer <トークン>
        ▼
[Lambda 関数 URL]  kakeibo-admin-api-prod（新しい別スタック。アプリ本体・Discord レポートとは別）
   トークンを JWKS で検証 → server.mjs と同じルート → lib/reads.mjs（今のコードをそのまま使う）
        │ 読むだけ（返信だけ書く）
        ▼
 S3 の CloudFront ログ / CloudWatch Logs Insights / DynamoDB / Cognito（アプリのプール）/ SES / CloudWatch
```

### なぜこの形か（採らなかった案）

| 決めたこと | 採用 | 採らなかった案と理由 |
|---|---|---|
| 入口 | **Lambda 関数 URL**（タイムアウト 120 秒） | API Gateway は 29 秒で切れる。Lambda の初回はログ 5,558 ファイル（18MB）の同期で 30 秒を超えうる |
| 認証 | **管理者専用の Cognito ユーザープール**（同じ新スタックに作る。自己登録なし・1人）。Lambda 内で JWT を検証 | アプリ本体のプールにグループを足す案は、本番のアプリ側の設定を変えることになる。関数 URL の IAM 認証は、アプリ側に AWS の鍵が要る |
| ログインの方法 | 画面から Cognito の `InitiateAuth`（USER_PASSWORD_AUTH）を fetch で呼ぶ。ライブラリ無し | SRP（amazon-cognito-identity-js）はビルド無しの画面に入れにくい。通信は TLS、パスワードは保存しない（保存するのは更新トークンだけ） |
| 画面 | **今の `ui/` を両アプリで共用**（API の宛先とトークンだけ差し替える薄い層を足す） | ネイティブで作り直すと、数字の出し方が2系統になる |
| Windows | **Electron** ＋ electron-builder（NSIS の exe） | Tauri は Rust の環境が要る。Node が既にあるので Electron が最短 |
| iOS | **新しい Expo アプリ**（別の bundle ID）＋ react-native-webview に画面を同梱。EAS Build → TestFlight | `mobile/` に入れると利用者向けアプリに管理画面が混ざる（触らないルールにも反する） |

## 作るもの

### 1. 共有コードを Lambda でも動くようにする（`scripts/admin/lib`）
- `config.mjs`: `CACHE_DIR`・`PF_CACHE_DIR` を環境変数 `ADMIN_CACHE_ROOT` で差し替え可能に（Lambda は `/tmp`）。既定は今と同じ。
- `aws.mjs`: Lambda（`AWS_LAMBDA_FUNCTION_NAME` がある）では `AWS_PROFILE` を設定しない・SDK はランタイム同梱のものを `import` する。手元は今と同じ `report/node_modules`。
- 検証: 既存テスト 27 件が通る／ローカル版の `/api/stats?days=14` が変更前と一致。

### 2. API（`scripts/admin/api/`、新スタック `kakeibo-admin-api-prod`）
- `src/handler.mjs`: 関数 URL のイベントを受け、`server.mjs` と同じ10本の GET と `POST /api/inquiry-reply` に振り分ける。ルートの対応表は `server.mjs` と共有する（`lib/routes.mjs` に出して両方が使う）。
- `src/auth.mjs`: JWT（RS256）を JWKS で検証（`node:crypto` の `createPublicKey({format:'jwk'})`。追加ライブラリ無し）。`iss`・`aud`（client_id）・`token_use=id`・`exp` を確認。JWKS は温かい間とっておく。
- `template.yaml`: 関数（nodejs24.x / arm64 / 1769MB / 120 秒 / 予約同時実行 2）、関数 URL（AuthType NONE＝検証は関数内、CORS は許可した Origin のみ）、管理者プール（自己登録なし・パスワード12文字以上・MFA は質問次第）、アプリクライアント（シークレットなし・USER_PASSWORD_AUTH と REFRESH_TOKEN_AUTH だけ）。IAM は今のローカル版が読むものに限る（S3 の `app/*`、Logs Insights は2つのロググループ、DynamoDB は項目を限定した Scan/Query＋問い合わせテーブルの UpdateItem、Cognito ListUsers、SES GetAccount、CloudWatch GetMetricData）。
- 配布物: `npm run build` で `lib/`・`report/src/`・`api/src/` を `api/dist/` に写す（SDK は含めない）。
- 検証: `node api/test/*.test.mjs`（認証の拒否ケース・ルート振り分け）／`node api/run-local.mjs` で handler を手元の認証情報で呼び、ローカル版と結果一致（読み取りだけ・返信は呼ばない）。

### 3. 画面（`scripts/admin/ui`）
- `transport.js`（新規・小さい）: `window.KK_ADMIN`（アプリが入れる設定: API の宛先・Cognito の client_id・保存の仕組み）があれば、`api()` の宛先を変えて `Authorization` を付ける。無ければ今と同じ相対パス（ローカル版は無変更で動く）。
- ログイン画面（メール・パスワード → トークン、更新トークンで自動更新、401 で再ログイン）。ログアウトボタン。
- `/api/health` は Lambda では「トークンが有効か」を返す。認証切れの帯（`aws sso login` の案内）はローカル版だけで出す。
- 検証: ローカル版で見た目と数字が変わらない（DOM 比較）／リモート版は手元の Lambda 模擬サーバー（handler をそのまま載せた小さな http サーバー、テスト用の鍵で署名したトークン）で 5 タブが表示される。

### 4. Windows アプリ（`scripts/admin/desktop/`）
- Electron。`ui/` をビルド時に同梱。`contextIsolation: true`・`nodeIntegration: false`・preload で「保存（`safeStorage` で暗号化した更新トークン）」と設定だけ渡す。外部リンクは既定のブラウザで開く。CSP の `connect-src` は関数 URL と Cognito だけ。
- `npm run dist` で NSIS インストーラー（署名なし。SmartScreen の警告は出る）。
- 検証: 手元で exe を作り、起動→模擬サーバー相手にログイン→5タブ。

### 5. iOS アプリ（`scripts/admin/ios/`）
- Expo SDK 54（`mobile/` と同じ版。依存は別に入れる）。1画面: WebView に `ui/` を1枚の HTML にまとめたものを載せる（`scripts/bundle-ui.mjs` で生成）。更新トークンは `expo-secure-store`（postMessage で受け渡し）。
- `app.json`: 名前「黒福簿 管理」、bundle ID は質問、`ITSAppUsesNonExemptEncryption: false`。`eas.json`: production プロファイル＋`submit`（TestFlight の内部テストのみ）。
- 検証: `npx expo export --platform ios` が通る／型と lint／Web 版（`expo start --web` ではなく、同じ HTML をブラウザで開く）で表示。実機・TestFlight は許可後。

## 順番と止まる地点

1. 共有コード → テスト・一致確認
2. API（手元で動かして一致確認まで。**`sam deploy` は止まる地点**）
3. 画面の transport・ログイン → 模擬サーバーで確認
4. Windows アプリ → exe を作って確認（ここまで本番に触れずに完成できる）
5. iOS アプリ → export まで。**EAS ビルド・TestFlight 提出は止まる地点**
6. 本番: 許可後に `sam deploy` → 管理者ユーザー作成（`admin-create-user`、一時パスワードは利用者が自分で設定）→ 両アプリの宛先を確定 → 実機確認

## お金とリスク

- 料金: Lambda・関数 URL は使う人が1人なので無料枠内。Cognito は 1 MAU で無料。Logs Insights の走査量は今のローカル版と同じ（呼び出し元が変わるだけ）。CloudWatch Logs への Lambda のログは少量。
- 関数 URL は公開の URL になる。守りは「JWT 検証」「予約同時実行 2」「プールは自己登録なし」。トークン無しの呼び出しは検証で即 401（AWS を読まない）。
- Lambda の初回（冷えた状態）は CloudFront ログ全件の同期で数十秒かかる。温かい間は `/tmp` の写しを使う。遅ければ、ログの日別集計を S3（新スタックのバケット）に置く案を次段で検討。
- 問い合わせ返信が外から打てるようになる。返信は今と同じく「画面のボタンだけ」・JSON・トークン必須。
- TestFlight のビルドは 90 日で期限切れ。続けて使うには 90 日以内に作り直す（EAS で同じコマンド）。

## レビュー1回目（61点）を受けた修正（この節が上の記述より優先）

1. **同時実行と冷えた同期**: 予約同時実行は **10**。画面は1タブで並列に呼ぶので、冷えた実行環境が増えないよう、アプリ版の `transport` は**同時に2本まで**に絞る（待ち行列）。`syncLogs(dayList)` は要求された日の分だけ読む作りなので、今日タブは数日分で済む。冷えた初回の時間は deploy 後に計測し、30 秒を超えるなら「日別のログを1ファイルにまとめて新スタックの S3 に置く」を次段で入れる（計測値で判断）。
2. **Origin**: Electron は `protocol.handle('app', …)` で `app://admin/` から画面を出す（file:// を使わない）。iOS は WebView に `source={{ html, baseUrl: 'https://admin.kurofukubo.invalid/' }}` で Origin を固定し、`originWhitelist` はその Origin と関数 URL だけにする。関数 URL の CORS の AllowOrigins はこの2つ（`app://admin`・`https://admin.kurofukubo.invalid`）だけ。CORS は防御の主役ではなく、主役は JWT 検証（ネイティブアプリには CORS 自体が効かないため）。
3. **XSS と CSP**: `ui/app.js` の `innerHTML` の全箇所を点検し、利用者由来の文字列（問い合わせ・ご意見・退会理由・参照元・UA・UTM）が `esc()` を通ることをテスト（悪意ある文字列を入れた模擬データで描画し、`<script>`・`onerror` が要素にならないこと）で確かめる。アプリ版の CSP は `default-src 'none'; script-src 'self'; style-src 'self'; connect-src <関数URL> https://cognito-idp.ap-northeast-1.amazonaws.com; img-src 'self' data:`。インラインのスクリプト・`on*=` 属性が残っていれば外に出す。iOS は1枚の HTML にまとめるので、`script-src` はまとめた中身のハッシュ（`'sha256-…'`）で許可する。これを完成条件に足す。
4. **認証の強さ**: **TOTP の MFA を必須**にする（`MfaConfiguration: ON`・ソフトウェアトークンのみ）。ログインは `InitiateAuth` → `SOFTWARE_TOKEN_MFA` チャレンジ → `RespondToAuthChallenge`。初回だけ `MFA_SETUP`（`AssociateSoftwareToken` → `VerifySoftwareToken`）を画面で行い、秘密鍵は QR ではなく文字列で出して認証アプリに手入力（外部のQR生成を使わない）。トークンの有効期間は ID・アクセス **15分**、更新 **7日**。プールの高度なセキュリティ（有料）は使わず、Cognito 標準のログイン失敗の制限に頼る。取り消しは `aws cognito-idp admin-user-global-sign-out`（手順を README に書く。実行は許可制）。トークン無しの呼び出しは AWS を一切読まずに 401（費用は Lambda の最短実行分だけ）。
5. **SDK の読み込み**: Lambda では `createRequire` を使わず `import('@aws-sdk/…')` で読む分岐にする。確かめるのは `sam build` 後の `sam local invoke`（Docker があれば。手元の認証情報で読み取りだけ）。無ければデプロイ直後の `/api/health` で確かめる手順を書く。
6. **IP**: Lambda 版は**自分IP一覧（`selfIps`）を返さない**（応答から消す）。画面は「ローカル版でだけ表示」と出す。ローカル版は今と同じ。
7. **fetch の差し替え箇所**: `ui/app.js` の `fetch` は 3 か所（`api()`・返信・`/api/health`）。3つとも `transport.fetch()` に置き換える。
8. **IAM**: 足すもの — `logs:StartQuery`（API のアクセスログと SettingsFunction のロググループの2つに限定）、`logs:GetQueryResults`・`logs:StopQuery`（リソース指定不可なので `*`）、`logs:DescribeLogGroups`（health 用。`/aws/apigateway/` だけ）、`dynamodb:UpdateItem`（問い合わせの2テーブルだけ・属性を `status, messages, updatedAt` に限定）、利用状況の Scan は属性を `PK, SK, updatedAt, lastSeen, createdAt` に限定。最終的な一覧はローカル版のコードの全 `send(new …Command)` を grep して作り、漏れはテンプレートのテスト（コマンド名→アクションの対応表と突き合わせ）で検出する。
9. **一致確認は固定期間**: `from=2026-10-01&to=2026-10-20` のような過去日で比べる。稼働・利用状況・今日のように「いま」で決まるものは、同じ秒に両方を呼ぶのではなく、`now` を引数で固定できる純粋関数（`lib/derive.mjs`）のテストで担保する。
10. **デプロイ後の確認と片付け**: 確認 = ①トークン無し・改ざんトークンで 401、②全ルート 200、③固定期間の stats がローカル版と一致、④冷えた初回の所要時間を記録。片付け = `sam delete --stack-name kakeibo-admin-api-prod`（プールは `DeletionPolicy: Retain` にしないので一緒に消える。実行は許可制）。
11. **更新の方針**: Electron は自動更新なし（新しい exe を作って入れ直す）。iOS は EAS Update を使わず、変えたら TestFlight にビルドを出し直す（90 日の期限ごとにも出し直す）。iOS の通信は HTTPS だけなので ATS の例外は付けない。

12. （2回目 82点の指摘）CSP は両アプリで console の CSP 違反0件を確かめる。同時呼び出しの上限は予約同時実行10が決める（画面の2本はアプリ側の約束）。`sam local invoke` は今のローカル版と同じ読み取りだけなので止まる地点にしない（返信は呼ばない）。

## 確認が必要なこと（後でまとめて聞く）

- 本番への反映（`sam deploy`・管理者ユーザー作成・EAS ビルド・TestFlight 提出）の許可
- iOS の bundle ID とアプリ名、App Store Connect にアプリの枠を作ること（Apple の画面での作業）
- 管理者のメールアドレス（ユーザー作成に使う）
- 問い合わせ返信をアプリからも打てるようにするか（しないなら Lambda は読むだけになる）
