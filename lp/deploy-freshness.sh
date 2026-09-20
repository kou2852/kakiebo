#!/usr/bin/env bash
# 2026-09-09 更新日の実態反映 + 本文中リンク
#   (1) 本文中の文脈リンク追加（guide-furusato / double-entry / dual-income /
#       emergency-fund / family-bs / medical-expense / privacy）
#   (2) JSON-LD dateModified を実際の変更日へ（18ガイド。guide-start は据え置き）
#   (3) sitemap.xml の lastmod を実態へ（21件）
#
#   index.html は iOS アプリ告知が未公開のため対象外。sitemap の "/" も据え置き。
#
# 実行:  bash deploy-freshness.sh
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
guide-csv.html
guide-double-entry.html
guide-dual-income.html
guide-emergency-fund.html
guide-family-bs.html
guide-furusato.html
guide-medical-expense.html
guide-moneyforward.html
guide-net-worth.html
guide-networth-average.html
guide-networth-howmuch.html
guide-networth-investments.html
guide-networth-trend.html
guide-privacy.html
guide-savings-rate.html
"

# 保険：index.html を絶対に含めない
case " $FILES " in *" index.html "*) echo "!! index.html が含まれています。中止"; exit 1;; esac

echo "== 1. HTML 反映（18ファイル） =="
n=0
for f in $FILES; do
  [ -f "$f" ] || { echo "  !! 見つかりません: $f"; exit 1; }
  aws s3 cp "$f" "s3://$BUCKET/$f" \
    --profile "$PROFILE" --region "$REGION" \
    --content-type "text/html; charset=utf-8" \
    --cache-control "$CC" --only-show-errors
  n=$((n+1)); echo "  uploaded: $f"
done
echo "  合計 $n 件"

echo "== 2. sitemap.xml 反映 =="
aws s3 cp sitemap.xml "s3://$BUCKET/sitemap.xml" \
  --profile "$PROFILE" --region "$REGION" \
  --content-type "application/xml; charset=utf-8" \
  --cache-control "public, max-age=0, must-revalidate" --only-show-errors
echo "  uploaded: sitemap.xml"

echo "== 3. CloudFront 無効化 =="
PATHS="/sitemap.xml"
for f in $FILES; do PATHS="$PATHS /$f"; done
MSYS_NO_PATHCONV=1 aws cloudfront create-invalidation \
  --distribution-id "$DIST" --paths $PATHS \
  --profile "$PROFILE" --region "$REGION" \
  --query 'Invalidation.{Id:Id,Status:Status}' --output table

echo
echo "== 完了 =="
