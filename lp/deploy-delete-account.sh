#!/usr/bin/env bash
# アカウント削除の手順ページ（Play Console の「アカウント削除用 URL」）の公開
#   新規: delete-account.html のみ。他のページ・未コミットの変更は載せない。
#
# 実行:  bash deploy-delete-account.sh
set -euo pipefail
export PYTHONUTF8=1 AWS_PAGER=""

BUCKET=kakeibo-lp-117953360790
DIST=E2ANL068WDF75Y
PROFILE=kakeibo-prod
REGION=us-east-1
CC="public, max-age=0, must-revalidate"

cd "$(dirname "$0")"

echo "== 0. 事前確認 =="
[ -f delete-account.html ] || { echo "  !! delete-account.html がありません"; exit 1; }
git diff --quiet -- delete-account.html || { echo "  !! delete-account.html に未コミットの変更があります。先にコミットしてください"; exit 1; }
echo "  ok"

echo "== 1. 反映 =="
aws s3 cp delete-account.html "s3://$BUCKET/delete-account.html" \
  --profile "$PROFILE" --region "$REGION" \
  --content-type "text/html; charset=utf-8" \
  --cache-control "$CC" --only-show-errors
echo "  uploaded: delete-account.html"

echo "== 2. CloudFront 無効化 =="
MSYS_NO_PATHCONV=1 aws cloudfront create-invalidation \
  --distribution-id "$DIST" --paths /delete-account.html \
  --profile "$PROFILE" --region "$REGION" \
  --query 'Invalidation.{Id:Id,Status:Status}' --output table

echo
echo "== 完了 =="
echo "  確認: curl -s -o /dev/null -w '%{http_code}\n' https://kurofukubo.com/delete-account.html   # 200 が正しい"
