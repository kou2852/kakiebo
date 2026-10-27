#!/usr/bin/env bash
# Android 版の公開（Google Play・2026-10-27）に合わせた LP の更新
#   対象: index.html（Google Play のバッジ・FAQ）/ guide-moneyforward.html（対応環境）/ analytics.js（cta_googleplay の計測）
#   コミット済みの内容（HEAD）をそのまま反映する。作業ツリーの未コミットの変更は載せない。--delete は使わない。
#
# 先に:  aws sso login --profile kakeibo-prod
# 実行:  bash deploy-android-launch.sh
set -euo pipefail
export PYTHONUTF8=1 AWS_PAGER=""

BUCKET=kakeibo-lp-117953360790
DIST=E2ANL068WDF75Y
PROFILE=kakeibo-prod
REGION=us-east-1
CC="public, max-age=0, must-revalidate"
# ファイル名|Content-Type
FILES=("index.html|text/html; charset=utf-8" "guide-moneyforward.html|text/html; charset=utf-8" "analytics.js|text/javascript; charset=utf-8")

cd "$(dirname "$0")"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT

echo "== 0. 事前確認 =="
for e in "${FILES[@]}"; do
  f="${e%%|*}"
  git show "HEAD:lp/$f" > "$TMP/$f" || { echo "  !! HEAD に lp/$f がありません"; exit 1; }
done
grep -q 'play.google.com/store/apps/details?id=com.kurofukubo.app' "$TMP/index.html" || { echo "  !! index.html に Google Play のリンクがありません（コミット前では？）"; exit 1; }
grep -q 'cta_googleplay' "$TMP/analytics.js" || { echo "  !! analytics.js に cta_googleplay がありません（コミット前では？）"; exit 1; }
node --check "$TMP/analytics.js"
aws sts get-caller-identity --profile "$PROFILE" --region "$REGION" --query Arn --output text >/dev/null \
  || { echo "  !! AWS にログインしていません: aws sso login --profile $PROFILE"; exit 1; }
echo "  ok"

echo "== 1. 反映 =="
for e in "${FILES[@]}"; do
  f="${e%%|*}"; ct="${e#*|}"
  aws s3 cp "$TMP/$f" "s3://$BUCKET/$f" \
    --profile "$PROFILE" --region "$REGION" \
    --content-type "$ct" --cache-control "$CC" --only-show-errors
  echo "  uploaded: $f"
done

echo "== 2. CloudFront 無効化 =="
MSYS_NO_PATHCONV=1 aws cloudfront create-invalidation \
  --distribution-id "$DIST" \
  --paths /index.html / /guide-moneyforward.html /analytics.js \
  --profile "$PROFILE" --region "$REGION" \
  --query 'Invalidation.{Id:Id,Status:Status}' --output table

echo
echo "== 完了 =="
echo "  確認: curl -s https://kurofukubo.com/ | grep -c 'hero_googleplay'   # 1 が正しい"
