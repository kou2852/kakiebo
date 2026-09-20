#!/usr/bin/env bash
# 2026-09-10
#   analytics.js … cta_location の番号がiOSセクション追加でずれた件をコメントに明記
#                   （動作は変更していない。コメントのみ）
#   sitemap.xml  … "/" の lastmod を 2026-08-20 → 2026-09-09（iOS告知でトップが更新されたため）
#
#   index.html 自体には触れない。
#
# 実行:  bash deploy-analytics-sitemap.sh
set -euo pipefail
export PYTHONUTF8=1 AWS_PAGER=""

BUCKET=kakeibo-lp-117953360790
DIST=E2ANL068WDF75Y
PROFILE=kakeibo-prod
REGION=us-east-1
CC="public, max-age=0, must-revalidate"

cd "$(dirname "$0")"

echo "== 1. analytics.js =="
node --check analytics.js
aws s3 cp analytics.js "s3://$BUCKET/analytics.js" \
  --profile "$PROFILE" --region "$REGION" \
  --content-type "text/javascript; charset=utf-8" \
  --cache-control "$CC" --only-show-errors
echo "  uploaded: analytics.js"

echo "== 2. sitemap.xml =="
aws s3 cp sitemap.xml "s3://$BUCKET/sitemap.xml" \
  --profile "$PROFILE" --region "$REGION" \
  --content-type "application/xml; charset=utf-8" \
  --cache-control "$CC" --only-show-errors
echo "  uploaded: sitemap.xml"

echo "== 3. CloudFront 無効化 =="
MSYS_NO_PATHCONV=1 aws cloudfront create-invalidation \
  --distribution-id "$DIST" --paths "/analytics.js" "/sitemap.xml" \
  --profile "$PROFILE" --region "$REGION" \
  --query 'Invalidation.{Id:Id,Status:Status}' --output table

echo
echo "== 完了 =="
