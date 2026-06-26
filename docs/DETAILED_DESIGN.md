# 詳細設計書 — 複式家計簿 SaaS（kurofukubo）

最終更新: 2026-06-11 / 対象: `frontend/`, `backend/`, `hosting/`

## 1. リクエストフロー

### 静的配信
```
ブラウザ → app.kurofukubo.com (Route53 Alias)
        → CloudFront（OAC, DefaultRootObject=index.html, 403/404→/index.html）
        → S3（非公開バケット kakeibo-web-prod-117953360790）
```
SPA はクライアントサイドでページ切替（`currentPage` state）。未知パスは index.html にフォールバック。

### API呼び出し
```
SPA → fetch(VITE_API_URL + /api/...) with Authorization: Bearer <idToken>
    → API Gateway(REST, stage=prod)
        → Cognito Authorizer が JWT 検証（OPTIONS は Authorizer: NONE で除外）
        → Lambda（requestContext.authorizer.claims.sub から userId 取得）
        → DynamoDB（PK=USER#<userId> でテナント分離アクセス）
```

## 2. フロントエンド設計（`frontend/src`）

### 2.1 状態管理
| Context | 役割 |
|---|---|
| `AuthContext` | Cognito認証。`VITE_COGNITO_*` 未設定時は `devMode=true` で認証スキップ。`getIdToken()` を `api/client` に注入 |
| `DataContext` | 全エンティティの保持とCRUD。`useLocal` フラグで **APIモード**（DynamoDB）/ **ローカルモード**（localStorage `kk4`）を自動切替。API失敗時は localStorage にフォールバック |

### 2.2 コンポーネント構成
| ディレクトリ | 主なコンポーネント |
|---|---|
| `Layout/` | `Sidebar`（ナビ）, `AuthPage`（ログイン/登録） |
| `Dashboard/` | `Dashboard`, `PieChart`, `TrendChart`, `PeriodBar` |
| `Journal/` | `JournalPage`, `JournalModal`, `SplitModal`, `CSVModal` |
| `Ledger/` | `LedgerPage` |
| `Reports/` | `BSPage`, `PLPage`, `CFPage` |
| `Accounts/` | `AccountsPage`, `AccountModal`, `WalletModal`, `PresetModal`, `RuleModal` |
| `Tags/` | `TagsPage`, `TagModal` |
| `Calendar/` | `CalendarPage` |
| `Recurring/` | `RecurringPage`, `RecurringModal` |
| `Settings/` | `SettingsPage`（バックアップ/移行）, `BudgetModal` |
| `Common/` | `Modal`, `Toast`(`useToast`), `ErrorBoundary` |

### 2.3 ルーティング/テーマ
- ルーティング: SPA 内 `currentPage` state（react-router-dom は依存にあるが未使用）。
- テーマ: `body[data-theme]` + CSS変数（`--bg0` 等）。`localStorage.kk_theme` に保存。
- モバイル: 768px以下でサイドバーをオーバーレイ化、ハンバーガー表示。

### 2.4 APIクライアント（`api/client.js`）
- `request()` が `Authorization: Bearer <token>` を自動付与、204はnull、非200は `{error}` を解析して throw。
- 名前空間: `journals`, `accounts`, `tags`, `wallets`, `budgets`, `data(export/import)`。

## 3. バックエンド設計（`backend/src`）

### 3.1 ハンドラ
| ハンドラ | 担当 |
|---|---|
| `handlers/journals.js` | 仕訳CRUD。貸借一致検証 `validateLines()` |
| `handlers/accounts.js` | 科目CRUD。`sys=1` は削除不可、更新は `EDITABLE_FIELDS` ホワイトリスト |
| `handlers/settings.js` | タグ/口座/予算（一括保存）+ エクスポート/インポート |
| `handlers/postConfirm.js` | Cognito PostConfirmation トリガ。新規ユーザーにデフォルト26科目を投入 |

### 3.2 共通ミドルウェア（`middleware/apiHelper.js`）
- レスポンスヘルパー: `ok/created/noContent/badRequest/unauthorized/notFound/serverError`。
- 全レスポンスに CORS ヘッダーを付与。`Access-Control-Allow-Origin` は **環境変数 `ALLOWED_ORIGIN`**（未設定時のみ `*`）。
- `getUserId(event)`: `requestContext.authorizer.claims.sub` を取得。
- `parseBody` / `pathParam`。

### 3.3 CORS設計（恒久対策済み）
- ゲートウェイの MOCK CORS は**廃止**。各 Lambda が `if (event.httpMethod === 'OPTIONS') return noContent();` でプリフライトに 204+CORS を返す。
- SAM テンプレートで各パスに `Method: OPTIONS` / `Auth: { Authorizer: NONE }` のイベントを定義（認証不要でプリフライト通過）。
- 効果: `AllowedOrigin` 変更が Lambda 環境変数経由で `sam deploy` だけで反映される（旧方式の手動パッチ不要）。

### 3.4 DynamoDBアクセス（`lib/db.js`）
- シングルテーブルヘルパー: `putItem`, `getItem`, `deleteItem`, `queryByPrefix(userId, 'PREFIX#')`, `queryByDateRange`, `batchPut`, `batchDelete`。
- 全アクセスは `PK=USER#<userId>` を強制し、ユーザー間アクセスを構造的に遮断。

## 4. データモデル（DynamoDB シングルテーブル）

| PK | SK | エンティティ |
|---|---|---|
| `USER#<userId>` | `JOURNAL#<id>` | 仕訳（GSI1SK=date） |
| `USER#<userId>` | `ACCOUNT#<id>` | 勘定科目 |
| `USER#<userId>` | `TAG#<id>` | タグ |
| `USER#<userId>` | `WALLET#<id>` | 口座 |
| `USER#<userId>` | `PRESET#<id>` | プリセット |
| `USER#<userId>` | `BUDGET#<accountId>` | 予算 |
| `USER#<userId>` | `RECURRING#<id>` | 定期取引 |
| `USER#<userId>` | `RULE#<id>` | 自動分類ルール |
| `USER#<userId>` | `ALLOC#<acctId>#<tagId>` | タグ配分 |
| `USER#<userId>` | `PROFILE` | ユーザー設定 |

- **GSI1**: PK=`USER#<userId>`, GSI1SK=`date`。仕訳の期間検索（`?start=&end=`）に使用。
- 課金方式: PAY_PER_REQUEST。PITR 有効。各エンティティのフィールド定義は `DATA_MODEL.md`。

## 5. 主要ロジック

### 5.1 複式簿記
- 残高計算（`utils/bookkeeping.js`）: 資産/費用=借方-貸方、負債/純資産/収益=貸方-借方。
- 貸借一致検証（`journals.js`）: 2行以上、各行 `side∈{dr,cr}`・`amount>0`、借方合計=貸方合計（誤差0.01まで）。
- BS=累計残高、PL=期間内残高、CF=営業/投資/財務の簡易直接法（`Reports/CFPage.jsx`）。

### 5.2 入力支援
- クイック入力: ワンライン文字列を解析して仕訳生成。
- プリセット: 口座ごとの仕訳テンプレートをワンタップ適用。
- CSV取込（`utils/csv.js` + `CSVModal`）: 重複検知、自動分類ルール適用。
- 自動分類ルール: 摘要キーワード一致で借方/貸方科目（+タグ）を提案。

### 5.3 定期取引
- frequency（monthly/weekly/yearly）と day から `nextDate` を計算し、起動時に到来分を自動生成（取消可能）。

### 5.4 データ移行/バックアップ（`Settings/SettingsPage.jsx`）
- エクスポート: `exportAll()` → JSON ダウンロード（`kakeibo_YYYY-MM-DD.json`）。
- インポート: `.json` を読み込み `importAll(payload)` → `/api/import`。同一IDは上書き、新規は追加。
- 旧 `kakeibo.html` の `exportData()` 出力（localStorage `kk4` 全体）と互換。

## 6. セキュリティ設計

| 項目 | 実装 |
|---|---|
| 認証 | Cognito User Pool（email + パスワード, 最小8文字）。IDトークン1h、リフレッシュ30日 |
| 認可 | API Gateway Cognito Authorizer + Lambda 内 userId 抽出 |
| テナント分離 | DynamoDB PK に userId を含め物理分離。クロスアクセス不可 |
| 入力検証 | 仕訳の貸借一致、科目 `sys`/編集フィールドのホワイトリスト、import 上限 10,000 件 |
| CORS | `ALLOWED_ORIGIN` で単一オリジン許可（本番=独自ドメイン） |
| IAM | Lambda は `DynamoDBCrudPolicy`（テーブル単位）に限定。人間/デプロイは SSO一時クレデンシャル（root常用廃止） |
| 暗号化 | DynamoDB 保存時暗号化、S3 SSE-S3、全通信 HTTPS |

## 7. インフラ / IaC

### 7.1 構成
- backend: AWS SAM（`backend/template.yaml`）= Cognito / API GW / Lambda×4 / DynamoDB / CloudWatch Alarms / SNS。
- hosting: CloudFormation（`hosting/template.yaml`）= S3 + CloudFront(OAC) + BucketPolicy。
- 環境切替: `backend/samconfig.toml` の `--config-env dev|prod`（プロファイル・スタック名・パラメータを分離）。

### 7.2 デプロイ手順
```
# backend
cd backend
sam build
sam deploy --config-env dev     # 開発
sam deploy --config-env prod    # 本番

# frontend（prod）
cd frontend
npm run build                                   # .env.production を使用
aws s3 sync dist s3://kakeibo-web-prod-117953360790 --delete --profile kakeibo-prod
aws cloudfront create-invalidation --distribution-id E32HZNCIT2MXUM --paths "/*" --profile kakeibo-prod
```

### 7.3 ドメイン/証明書
- `app.kurofukubo.com` → CloudFront（Alias）。ACM(us-east-1)でDNS検証発行。手順は `DOMAIN_SETUP.md`。

## 8. 監視・アラート

| アラーム | メトリクス | 閾値 |
|---|---|---|
| `kakeibo-prod-lambda-errors` | AWS/Lambda Errors (Sum) | ≥1 / 5分 |
| `kakeibo-prod-api-5xx` | AWS/ApiGateway 5XXError | ≥1 / 5分 |
| `kakeibo-prod-ddb-read-throttle` | ReadThrottleEvents | ≥1 / 5分 |
| `kakeibo-prod-ddb-write-throttle` | WriteThrottleEvents | ≥1 / 5分 |

通知: SNS `kakeibo-alarms-prod` → メール（要サブスクリプション確認）。

## 9. エラーハンドリング

- フロント: `ErrorBoundary` で描画例外を捕捉。API失敗は `Toast` 表示、データ取得失敗時は localStorage フォールバック。
- バック: バリデーション失敗=400、未認証=401、未存在=404、想定外=500。全エラーJSONは `{ "error": "..." }`。

## 10. 既知の制約 / 今後

- 管理画面は未提供（AWSコンソールで代替）。
- ログインはメール方式のみ（Googleログインは OAuth 移行で対応予定）。
- SES 未設定（確認メールは Cognito 既定送信者。本番品質には SES 連携が必要）。
- バックログ詳細は `BACKLOG.md`。
