#!/bin/bash
# ============================================
# kakeibo-saas デプロイスクリプト
# 使い方: cd backend && bash deploy.sh
# ============================================
set -e

echo "=========================================="
echo "  複式家計簿 SaaS — バックエンドデプロイ"
echo "=========================================="
echo ""

# 1. 前提チェック
echo "[1/5] 前提条件チェック..."
command -v aws >/dev/null 2>&1 || { echo "❌ AWS CLI が見つかりません。https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html からインストールしてください。"; exit 1; }
command -v sam >/dev/null 2>&1 || { echo "❌ SAM CLI が見つかりません。pip install aws-sam-cli でインストールしてください。"; exit 1; }
command -v node >/dev/null 2>&1 || { echo "❌ Node.js が見つかりません。"; exit 1; }

AWS_ACCOUNT=$(aws sts get-caller-identity --query Account --output text 2>/dev/null) || { echo "❌ AWS CLI が未設定です。aws configure を実行してください。"; exit 1; }
echo "  ✅ AWS CLI: アカウント $AWS_ACCOUNT"
echo "  ✅ SAM CLI: $(sam --version)"
echo "  ✅ Node.js: $(node --version)"
echo ""

# 2. npm install
echo "[2/5] 依存パッケージをインストール..."
npm install --omit=dev
echo "  ✅ npm install 完了"
echo ""

# 3. sam build
echo "[3/5] SAM ビルド..."
sam build
echo "  ✅ ビルド完了"
echo ""

# 4. sam deploy
echo "[4/5] SAM デプロイ..."
echo "  ※ 初回は対話形式で設定します"
echo "  推奨設定:"
echo "    Stack Name:       kakeibo-saas"
echo "    Region:           ap-northeast-1"
echo "    Confirm changes:  Y"
echo "    Allow IAM:        Y"
echo "    Save to config:   Y"
echo ""

sam deploy --guided

echo ""
echo "[5/5] デプロイ完了！"
echo ""
echo "=========================================="
echo "  次のステップ"
echo "=========================================="
echo ""
echo "上に表示された Outputs の3つの値をコピーして、"
echo "frontend/.env.local に以下の形式で保存してください："
echo ""
echo "  VITE_API_URL=https://xxxxx.execute-api.ap-northeast-1.amazonaws.com/prod"
echo "  VITE_COGNITO_USER_POOL_ID=ap-northeast-1_XXXXXXXXX"
echo "  VITE_COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx"
echo "  VITE_COGNITO_REGION=ap-northeast-1"
echo ""
echo "その後："
echo "  cd ../frontend"
echo "  npm install"
echo "  npm run dev"
echo ""
echo "=========================================="
