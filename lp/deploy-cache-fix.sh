#!/usr/bin/env bash
# LP デプロイ + Cache-Control 付与（2026-09-05 作成）
#
#   1) 今回変更した5ファイルを反映
#   2) 全HTML + analytics.js に Cache-Control を付与（現状は未設定）
#   3) CloudFront を無効化
#
# 実行:  bash lp/deploy-cache-fix.sh
set -euo pipefail
export PYTHONUTF8=1 AWS_PAGER=""

BUCKET=kakeibo-lp-117953360790
DIST=E2ANL068WDF75Y
PROFILE=kakeibo-prod
REGION=us-east-1
CC="public, max-age=0, must-revalidate"
S3="aws s3 --profile $PROFILE --region $REGION"

cd "$(dirname "$0")"

CHANGED="guide-csv.html guide-family-bs.html guide-furusato.html guide-networth-average.html guide-privacy.html"

echo "== 1. 変更した5ファイルを反映 =="
for f in $CHANGED; do
  $S3 cp "$f" "s3://$BUCKET/$f" \
    --content-type "text/html; charset=utf-8" \
    --cache-control "$CC" --only-show-errors
  echo "  uploaded: $f"
done

echo "== 2. 残りのHTMLはヘッダのみ付与（中身は変えずメタデータだけ置換） =="
for f in *.html; do
  skip=0
  for c in $CHANGED; do [ "$f" = "$c" ] && skip=1; done
  [ $skip -eq 1 ] && continue
  $S3 cp "s3://$BUCKET/$f" "s3://$BUCKET/$f" \
    --metadata-directive REPLACE \
    --content-type "text/html; charset=utf-8" \
    --cache-control "$CC" --only-show-errors
  echo "  headers: $f"
done

echo "== 3. analytics.js にも付与 =="
$S3 cp "s3://$BUCKET/analytics.js" "s3://$BUCKET/analytics.js" \
  --metadata-directive REPLACE \
  --content-type "text/javascript; charset=utf-8" \
  --cache-control "$CC" --only-show-errors

echo "== 4. CloudFront 無効化 =="
MSYS_NO_PATHCONV=1 aws cloudfront create-invalidation \
  --distribution-id "$DIST" --paths "/*" \
  --profile "$PROFILE" --region "$REGION" \
  --query 'Invalidation.{Id:Id,Status:Status}' --output table

echo
echo "== 完了。数分後に下で確認 =="
echo "  curl -sI https://kurofukubo.com/guide-furusato.html | grep -i cache-control"
