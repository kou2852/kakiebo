#!/usr/bin/env bash
# CTA位置の修正を反映（2026-09-06）
#   記事内CTA(cta-box)を <h2>出典</h2> の直前へ移動した15ページ。
#   Cache-Control は前回設定した方針を維持して付け直す（cp は既存メタデータを引き継がないため）。
#
# 実行:  bash deploy-cta.sh
set -euo pipefail
export PYTHONUTF8=1 AWS_PAGER=""

BUCKET=kakeibo-lp-117953360790
DIST=E2ANL068WDF75Y
PROFILE=kakeibo-prod
REGION=us-east-1
CC="public, max-age=0, must-revalidate"

cd "$(dirname "$0")"

FILES="
guide-bs-pl.html
guide-budget.html
guide-credit-card.html
guide-double-entry.html
guide-dual-income.html
guide-emergency-fund.html
guide-family-bs.html
guide-furusato.html
guide-medical-expense.html
guide-net-worth.html
guide-networth-average.html
guide-networth-howmuch.html
guide-networth-investments.html
guide-networth-trend.html
guide-savings-rate.html
"

echo "== 1. 反映（15ファイル） =="
n=0
for f in $FILES; do
  [ -f "$f" ] || { echo "  !! 見つかりません: $f"; exit 1; }
  aws s3 cp "$f" "s3://$BUCKET/$f" \
    --profile "$PROFILE" --region "$REGION" \
    --content-type "text/html; charset=utf-8" \
    --cache-control "$CC" --only-show-errors
  n=$((n+1))
  echo "  uploaded: $f"
done
echo "  合計 $n 件"

echo "== 2. CloudFront 無効化 =="
PATHS=""
for f in $FILES; do PATHS="$PATHS /$f"; done
MSYS_NO_PATHCONV=1 aws cloudfront create-invalidation \
  --distribution-id "$DIST" --paths $PATHS \
  --profile "$PROFILE" --region "$REGION" \
  --query 'Invalidation.{Id:Id,Status:Status}' --output table

echo
echo "== 完了。数分後に下で確認 =="
echo "  curl -s https://kurofukubo.com/guide-net-worth.html | grep -n 'cta-box\\|<h2>出典'"
