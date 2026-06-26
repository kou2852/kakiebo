# 複式家計簿 SaaS

複式簿記ベースの家計簿ウェブアプリケーション。

## アーキテクチャ

```
┌─────────────────────────────────────────────────┐
│                   CloudFront                     │
│              (CDN + カスタムドメイン)              │
└──────────┬──────────────────┬────────────────────┘
           │                  │
     静的アセット          /api/*
           │                  │
    ┌──────▼──────┐   ┌──────▼──────┐
    │   S3 Bucket  │   │ API Gateway │
    │  (React SPA) │   │  (REST API) │
    └─────────────┘   └──────┬──────┘
                             │
                     ┌───────▼───────┐
                     │  Cognito Auth  │
                     │  (JWT検証)     │
                     └───────┬───────┘
                             │
                     ┌───────▼───────┐
                     │    Lambda      │
                     │  (Node.js 20) │
                     └───────┬───────┘
                             │
                     ┌───────▼───────┐
                     │   DynamoDB     │
                     │  (単一テーブル) │
                     └───────────────┘
```

## ディレクトリ構成

```
kakeibo-saas/
├── frontend/               # React SPA (Vite)
│   ├── src/
│   │   ├── api/            # APIクライアント
│   │   ├── components/     # UIコンポーネント
│   │   ├── contexts/       # React Context (認証・データ)
│   │   ├── hooks/          # カスタムフック
│   │   ├── utils/          # ユーティリティ (簿記計算, フォーマット)
│   │   ├── styles/         # CSS変数・グローバルスタイル
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── backend/                # AWS Lambda (SAM)
│   ├── src/
│   │   ├── handlers/       # Lambda関数
│   │   ├── lib/            # 共通ライブラリ (DynamoDB操作)
│   │   └── middleware/     # 認証ミドルウェア
│   ├── package.json
│   └── template.yaml       # SAM テンプレート
└── README.md
```

## セットアップ

### 前提条件

- Node.js 20+
- AWS CLI v2 (設定済み)
- AWS SAM CLI

### バックエンドのデプロイ

```bash
cd backend
npm install
sam build
sam deploy --guided
# スタック名: kakeibo-saas
# リージョン: ap-northeast-1
```

デプロイ後、出力される `ApiUrl` と `UserPoolClientId` を控える。

### フロントエンドの起動

```bash
cd frontend
npm install

# .env.local を作成
cat > .env.local << EOF
VITE_API_URL=https://xxxxxxxxxx.execute-api.ap-northeast-1.amazonaws.com/prod
VITE_COGNITO_USER_POOL_ID=ap-northeast-1_XXXXXXXXX
VITE_COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
VITE_COGNITO_REGION=ap-northeast-1
EOF

npm run dev
```

### 本番デプロイ

```bash
cd frontend
npm run build
aws s3 sync dist/ s3://your-bucket-name --delete
aws cloudfront create-invalidation --distribution-id XXXXX --paths "/*"
```

## DynamoDB テーブル設計 (Single Table)

| PK              | SK                  | 用途            |
|-----------------|---------------------|-----------------|
| USER#<userId>   | JOURNAL#<id>        | 仕訳データ       |
| USER#<userId>   | ACCOUNT#<id>        | 勘定科目         |
| USER#<userId>   | TAG#<id>            | タグ             |
| USER#<userId>   | WALLET#<id>         | 口座             |
| USER#<userId>   | PRESET#<id>         | プリセット        |
| USER#<userId>   | BUDGET#<id>         | 予算             |
| USER#<userId>   | RECURRING#<id>      | 定期取引         |
| USER#<userId>   | RULE#<id>           | 自動分類ルール    |
| USER#<userId>   | ALLOC#<acctId>#<tagId> | タグ配分       |
| USER#<userId>   | PROFILE              | ユーザー設定     |

GSI1: `GSI1PK = USER#<userId>`, `GSI1SK = date` (仕訳の日付検索用)
