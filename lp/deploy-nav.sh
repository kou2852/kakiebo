#!/usr/bin/env bash
# 2026-09-09 導線の改善
#   guide-networth-average … 本文中に文脈リンク3本を追加（従来は関連記事が最下部のみ）
#   guides.html            … カード19枚を並び替え（start → furusato を先頭、moneyforward を末尾）
#
# 実行:  bash deploy-nav.sh
set -euo pipefail
export PYTHONUTF8=1 AWS_PAGER=""

BUCKET=kakeibo-lp-117953360790
DIST=E2ANL068WDF75Y
PROFILE=kakeibo-prod
REGION=us-east-1
CC="public, max-age=0, must-revalidate"

cd "$(dirname "$0")"

FILES="guide-networth-average.html guides.html"

echo "== 1. 反映 =="
for f in $FILES; do
  [ -f "$f" ] || { echo "  !! 見つかりません: $f"; exit 1; }
  aws s3 cp "$f" "s3://$BUCKET/$f" \
    --profile "$PROFILE" --region "$REGION" \
    --content-type "text/html; charset=utf-8" \
    --cache-control "$CC" --only-show-errors
  echo "  uploaded: $f"
done

echo "== 2. CloudFront 無効化 =="
MSYS_NO_PATHCONV=1 aws cloudfront create-invalidation \
  --distribution-id "$DIST" \
  --paths "/guide-networth-average.html" "/guides.html" \
  --profile "$PROFILE" --region "$REGION" \
  --query 'Invalidation.{Id:Id,Status:Status}' --output table

echo
echo "== 完了 =="
