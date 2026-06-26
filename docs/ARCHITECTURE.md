# アーキテクチャ設計書

## 全体構成

```
ユーザー
  │
  ├─ kakeibo.html（現行版）
  │    └─ localStorage で完結。サーバー不要
  │
  └─ SaaS版（移行先）
       │
       ├─ CloudFront + S3
       │    └─ React SPA (Vite)
       │
       └─ API Gateway + Cognito
            └─ Lambda (Node.js 20 ESM)
                 └─ DynamoDB (シングルテーブル)
```

## フロントエンド設計

### 状態管理
- `AuthContext`: 認証状態。Cognito未設定時はdevMode=trueで認証スキップ
- `DataContext`: 全データ。APIモード（DynamoDB）とローカルモード（localStorage）を`useLocal`フラグで切替
- 各ページコンポーネントは`useData()`で取得し、`useMemo`で計算結果をキャッシュ

### ルーティング
- SPAの単一ページ内でstate(`currentPage`)による切替
- react-router-domは依存に含まれているが未使用。将来URL対応時に使用予定

### テーマ
- CSS変数で実装。`body[data-theme="dark"]` / `body[data-theme="light"]`
- localStorage `kk_theme` に保存

### モバイル対応
- 768px以下でハンバーガーメニュー表示、サイドバーをオーバーレイ化
- グリッドレイアウトをシングルカラムにフォールバック

## バックエンド設計

### 認証フロー
```
サインアップ → Cognito確認コード → PostConfirmation Lambda
                                       └─ デフォルト26科目をDynamoDBに投入
ログイン → IDトークン取得 → Authorization ヘッダーに付与
         → API Gateway Cognito Authorizer が検証
         → Lambda が requestContext.authorizer.claims.sub からuserIdを取得
```

### API設計
| メソッド | パス | 説明 |
|---|---|---|
| GET | /api/journals | 仕訳一覧（?start=&end= で期間指定可） |
| POST | /api/journals | 仕訳作成（借貸一致検証あり） |
| PUT | /api/journals/{id} | 仕訳更新 |
| DELETE | /api/journals/{id} | 仕訳削除 |
| GET | /api/accounts | 勘定科目一覧 |
| POST | /api/accounts | 科目作成 |
| PUT | /api/accounts/{id} | 科目更新 |
| DELETE | /api/accounts/{id} | 科目削除（sys=1は不可） |
| GET/POST | /api/tags | タグ取得/一括保存 |
| GET/POST | /api/wallets | 口座取得/一括保存 |
| GET/POST | /api/budgets | 予算取得/一括保存 |
| GET | /api/export | 全データエクスポート |
| POST | /api/import | 全データインポート |

### CORS
- `AddDefaultAuthorizerToCorsPreflight: false` でOPTIONSをCognito認証から除外
- Lambda側でもCORSヘッダーを返す（二重だが安全側に倒す）

### DynamoDBシングルテーブル
- 全エンティティを1テーブルに格納
- PK=`USER#<userId>` で自動的にユーザー間分離
- SK前方一致クエリで種別ごとに取得（`begins_with(SK, 'JOURNAL#')`）
- GSI1で仕訳の日付範囲検索

## セキュリティ
- 認証: Cognito + JWT
- 認可: API Gateway Authorizer + Lambda内でuserId抽出
- データ分離: DynamoDB PKにuserIdを含む設計で物理的に分離
- HTTPS: API Gateway + CloudFront で強制

## デプロイ
- IaC: AWS SAM (template.yaml)
- フロントエンド: `npm run build` → S3 sync → CloudFront invalidation
- バックエンド: `sam build && sam deploy`
- 環境変数: `frontend/.env.local` にAPIエンドポイントとCognito設定
