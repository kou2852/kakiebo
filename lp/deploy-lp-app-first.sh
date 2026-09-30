#!/usr/bin/env bash
# 2026-10-01 LP の修正を本番へ
#   - ファーストビュー: App Store のバッジと「ブラウザで無料で始める」、端末の画像を iPhone アプリに
#   - iPhoneアプリの節を削除（App Store への導線はファーストビューのバッジに一本化）
#   - 一行入力の例を主役から外す
#   - FAQ に「iPhoneアプリとブラウザ版は何が違いますか？」を追加
#   - analytics.js: data-cta があれば cta_location にその名前を使う
#
# ⚠ 作業フォルダのファイルではなく、コミット済み（HEAD）の中身を上げる。
#   lp/index.html には別作業の未コミットの変更（題名・説明文。古い「9月25日公開」を含む）が残っており、
#   作業フォルダから上げるとそれが本番に混ざるため。
# ⚠ s3 sync は使わない。名前で並べた2ファイルだけを差し替える。
#
# 実行:  bash deploy-lp-app-first.sh
set -euo pipefail
export PYTHONUTF8=1 AWS_PAGER=""

BUCKET=kakeibo-lp-117953360790
DIST=E2ANL068WDF75Y
PROFILE=kakeibo-prod
REGION=us-east-1
CC="public, max-age=0, must-revalidate"

cd "$(dirname "$0")"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
git show HEAD:lp/index.html > "$TMP/index.html"
git show HEAD:lp/analytics.js > "$TMP/analytics.js"

echo "== 0. 事前確認（上げる中身 = HEAD） =="
for want in 'data-cta="hero_appstore"' 'ブラウザで無料で始める' 'iPhoneアプリとブラウザ版は何が違いますか' 'apple-itunes-app'; do
  grep -q "$want" "$TMP/index.html" || { echo "  !! index.html に「$want」がありません"; exit 1; }
done
for bad in '9月25日公開' '食費 1200 現金' 'ポケットに' 'id="ios"' 'href="#ios"'; do
  if grep -q "$bad" "$TMP/index.html"; then echo "  !! index.html に残っていてはいけないものがあります: $bad"; exit 1; fi
done
grep -q 'a.dataset.cta' "$TMP/analytics.js" || { echo "  !! analytics.js が新しくありません"; exit 1; }
node -e "
const s=require('fs').readFileSync(process.argv[1],'utf8');
for (const m of s.matchAll(/<script type=\"application\/ld\+json\">([\s\S]*?)<\/script>/g)) JSON.parse(m[1]);
" "$TMP/index.html" || { echo "  !! JSON-LD が壊れています"; exit 1; }
for f in img/ios-dashboard.webp img/appstore-badge-ja.svg; do
  CODE=$(curl -s -o /dev/null -w '%{http_code}' "https://kurofukubo.com/$f")
  [ "$CODE" = "200" ] || { echo "  !! 本番に画像がありません（$CODE）: $f"; exit 1; }
done
aws s3api head-bucket --bucket "$BUCKET" --profile "$PROFILE" --region "$REGION" 2>/dev/null \
  || { echo "  !! バケットに到達できません: $BUCKET"; exit 1; }
echo "  ok"

echo "== 1. 反映 =="
aws s3 cp "$TMP/index.html" "s3://$BUCKET/index.html" --profile "$PROFILE" --region "$REGION" \
  --content-type "text/html; charset=utf-8" --cache-control "$CC" --only-show-errors
echo "  uploaded: index.html"
aws s3 cp "$TMP/analytics.js" "s3://$BUCKET/analytics.js" --profile "$PROFILE" --region "$REGION" \
  --content-type "text/javascript; charset=utf-8" --cache-control "$CC" --only-show-errors
echo "  uploaded: analytics.js"

echo "== 2. CloudFront 無効化 =="
MSYS_NO_PATHCONV=1 aws cloudfront create-invalidation \
  --distribution-id "$DIST" --paths / /index.html /analytics.js \
  --profile "$PROFILE" --region "$REGION" \
  --query 'Invalidation.{Id:Id,Status:Status}' --output table

echo
echo "== 完了。数分後に下で確認 =="
echo "  curl -s https://kurofukubo.com/ | grep -c 'hero_appstore'   # 1 が正しい"
echo "  curl -s https://kurofukubo.com/ | grep -c 'ポケットに'       # 0 が正しい"
echo "  ブラウザ: https://kurofukubo.com/?noga=1"
