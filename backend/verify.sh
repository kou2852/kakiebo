#!/bin/bash
# ============================================
# デプロイ後の接続確認スクリプト
# 使い方: bash verify.sh <API_URL>
# 例:     bash verify.sh https://xxxxx.execute-api.ap-northeast-1.amazonaws.com/prod
# ============================================

API_URL="${1:-}"
if [ -z "$API_URL" ]; then
  echo "使い方: bash verify.sh <API_URL>"
  echo "例: bash verify.sh https://xxxxx.execute-api.ap-northeast-1.amazonaws.com/prod"
  exit 1
fi

echo "API接続確認: $API_URL"
echo ""

# 1. OPTIONS（CORS プリフライト）
echo "[1] CORS プリフライト確認..."
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X OPTIONS \
  -H "Origin: http://localhost:3000" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: Content-Type,Authorization" \
  "$API_URL/api/journals")

if [ "$STATUS" = "200" ] || [ "$STATUS" = "204" ]; then
  echo "  ✅ CORS OK (HTTP $STATUS)"
else
  echo "  ❌ CORS NG (HTTP $STATUS)"
  echo "     → template.yaml の AddDefaultAuthorizerToCorsPreflight を確認"
fi

# 2. 認証なしアクセス（401が正常）
echo "[2] 認証チェック（401が正常）..."
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/api/journals")
if [ "$STATUS" = "401" ]; then
  echo "  ✅ 認証ガード有効 (HTTP 401)"
else
  echo "  ⚠️  予期しないレスポンス (HTTP $STATUS)"
fi

# 3. DynamoDB テーブル確認
echo "[3] DynamoDB テーブル確認..."
TABLE=$(aws dynamodb describe-table --table-name kakeibo-prod --query 'Table.TableStatus' --output text 2>/dev/null)
if [ "$TABLE" = "ACTIVE" ]; then
  echo "  ✅ テーブル kakeibo-prod: ACTIVE"
else
  echo "  ❌ テーブルが見つかりません (--table-name kakeibo-prod)"
fi

# 4. Cognito ユーザープール確認
echo "[4] Cognito 確認..."
POOLS=$(aws cognito-idp list-user-pools --max-results 10 --query 'UserPools[?contains(Name,`kakeibo`)].{Name:Name,Id:Id}' --output table 2>/dev/null)
if [ -n "$POOLS" ]; then
  echo "  ✅ Cognito User Pool:"
  echo "$POOLS"
else
  echo "  ❌ kakeibo を含むユーザープールが見つかりません"
fi

echo ""
echo "すべて ✅ なら frontend/.env.local を設定して npm run dev を実行してください。"
