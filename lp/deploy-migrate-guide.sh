#!/usr/bin/env bash
# 2026-09-25 移行ガイド記事（他のアプリから移行の説明ページ）の公開
#   新規: guide-migrate.html と画像6枚。既存: 移行の案内を直した2記事、ガイド一覧・サイトマップ・llms.txt。
#   ※ アプリ側の「他のアプリから移行」と同じ作業の中で、この LP を先に出す（アプリのリンク先が 404 にならないように）。
#   ※ 載せるのは下に名前で並べたファイルだけ（lp/ にある別作業の未コミットの変更を本番に混ぜない）。
#
# 実行:  bash deploy-migrate-guide.sh
set -euo pipefail
export PYTHONUTF8=1 AWS_PAGER=""

BUCKET=kakeibo-lp-117953360790
DIST=E2ANL068WDF75Y
PROFILE=kakeibo-prod
REGION=us-east-1
CC="public, max-age=0, must-revalidate"

cd "$(dirname "$0")"

# ファイル名:content-type
FILES="
guide-migrate.html:text/html; charset=utf-8
img/migrate-file.webp:image/webp
img/migrate-columns-auto.webp:image/webp
img/migrate-columns-manual.webp:image/webp
img/migrate-accounts.webp:image/webp
img/migrate-review-add.webp:image/webp
img/migrate-done.webp:image/webp
guide-moneyforward.html:text/html; charset=utf-8
guide-csv.html:text/html; charset=utf-8
guides.html:text/html; charset=utf-8
sitemap.xml:application/xml; charset=utf-8
llms.txt:text/plain; charset=utf-8
"

echo "== 0. 事前確認 =="
IFS=$'\n'
for line in $FILES; do
  f="${line%%:*}"
  [ -f "$f" ] || { echo "  !! 見つかりません: $f"; exit 1; }
done
grep -q 'guide-migrate.html' guides.html || { echo "  !! guides.html に新しい記事がありません"; exit 1; }
grep -q 'guide-migrate.html' sitemap.xml || { echo "  !! sitemap.xml に新しい記事がありません"; exit 1; }
echo "  ok"

echo "== 1. 反映 =="
n=0
PATHS=""
for line in $FILES; do
  f="${line%%:*}"; ct="${line#*:}"
  aws s3 cp "$f" "s3://$BUCKET/$f" \
    --profile "$PROFILE" --region "$REGION" \
    --content-type "$ct" \
    --cache-control "$CC" --only-show-errors
  n=$((n+1)); echo "  uploaded: $f"
  PATHS="$PATHS /$f"
done
unset IFS
echo "  合計 $n 件"

echo "== 2. CloudFront 無効化 =="
MSYS_NO_PATHCONV=1 aws cloudfront create-invalidation \
  --distribution-id "$DIST" --paths $PATHS \
  --profile "$PROFILE" --region "$REGION" \
  --query 'Invalidation.{Id:Id,Status:Status}' --output table

echo
echo "== 完了 =="
echo "  確認: https://kurofukubo.com/guide-migrate.html?noga=1  （?noga=1 で自分の表示を GA4 に数えない）"
