#!/usr/bin/env bash
# 2026-09-08 の変更を反映
#   (1) 本文中の callout に「登録なしで試す →」リンクを追加（18ページ / utm_content に -mid）
#   (2) guide-credit-card の title・description を「帳簿」→「家計簿」に戻す（意図ズレの修正）
#   (3) about.html から note 記事への直リンク追加（インデックス誘導）
#
# 実行:  bash deploy-mid-cta.sh
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
about.html
"

echo "== 1. 反映（19ファイル） =="
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

echo "== 2. CloudFront 無効化 =="
PATHS=""
for f in $FILES; do PATHS="$PATHS /$f"; done
MSYS_NO_PATHCONV=1 aws cloudfront create-invalidation \
  --distribution-id "$DIST" --paths $PATHS \
  --profile "$PROFILE" --region "$REGION" \
  --query 'Invalidation.{Id:Id,Status:Status}' --output table

echo
echo "== 完了 =="
