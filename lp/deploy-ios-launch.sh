#!/usr/bin/env bash
# iPhoneアプリの公開後の告知をLPへ反映（公開日 2026-09-25 に実行）
#   - #ios の節: 「9月25日 App Store で公開」→「App Store で配信中」、予約注文のボタン → 公式のダウンロードバッジ
#   - FAQ（表示と JSON-LD の両方）: 「9月25日に公開します」→「App Store で配信しています」
#   - Smart App Banner（iPhone の Safari で上部に出る App Store の案内）
#
# ⚠ 公開を機械で確かめるまで実行しない。check-ios-live.mjs が通らなければ何もせず止まる。
#    Apple のガイドラインで、ダウンロードのバッジは公開後にしか使えない。
#
# ⚠ s3 sync は使わない（消し込みで意図しないファイルが消える）。必要なファイルだけ cp で差し替える。
#    作業フォルダにある他の未コミットの変更（guide-*.html 等）は配らない。
#
# 実行:  bash deploy-ios-launch.sh
set -euo pipefail
export PYTHONUTF8=1 AWS_PAGER=""

BUCKET=kakeibo-lp-117953360790
DIST=E2ANL068WDF75Y
PROFILE=kakeibo-prod
REGION=us-east-1
CC="public, max-age=0, must-revalidate"

cd "$(dirname "$0")"

echo "== 0. 事前チェック =="
node ../scripts/check-ios-live.mjs || { echo "  !! App Store でまだ公開されていません。止めます。"; exit 1; }
for want in 'apple-itunes-app' 'appstore-badge-ja.svg' 'App Store で配信中'; do
  grep -q "$want" index.html || { echo "  !! index.html に「$want」がありません（公開日の変更が入っていない）"; exit 1; }
done
for bad in 'App Storeで予約注文する' '9月25日 App Store で公開' '9月25日にApp Storeで公開します'; do
  if grep -q "$bad" index.html; then echo "  !! index.html に公開前の文言が残っています: $bad"; exit 1; fi
done
[ -f img/appstore-badge-ja.svg ] || { echo "  !! バッジ画像が見つかりません: img/appstore-badge-ja.svg"; exit 1; }
for U in $(grep -o 'https://apps\.apple\.com[^"]*' index.html | sort -u); do
  CODE=$(curl -sL -o /dev/null -w '%{http_code}' "$U")
  [ "$CODE" = "200" ] || { echo "  !! App Store のページが開けません（$CODE）: $U"; exit 1; }
done
echo "  公開を確認・公開後の要素あり・公開前の文言なし・App Store のページ 200"

echo "== 1. 反映 =="
aws s3 cp index.html "s3://$BUCKET/index.html" --profile "$PROFILE" --region "$REGION" \
  --content-type "text/html; charset=utf-8" --cache-control "$CC" --only-show-errors
echo "  uploaded: index.html"
aws s3 cp img/appstore-badge-ja.svg "s3://$BUCKET/img/appstore-badge-ja.svg" --profile "$PROFILE" --region "$REGION" \
  --content-type "image/svg+xml" --cache-control "$CC" --only-show-errors
echo "  uploaded: img/appstore-badge-ja.svg"

echo "== 2. CloudFront 無効化 =="
MSYS_NO_PATHCONV=1 aws cloudfront create-invalidation \
  --distribution-id "$DIST" --paths /index.html / /img/appstore-badge-ja.svg \
  --profile "$PROFILE" --region "$REGION" \
  --query 'Invalidation.{Id:Id,Status:Status}' --output table

echo
echo "== 完了。数分後に下で確認 =="
echo "  curl -s https://kurofukubo.com/ | grep -c 'App Store で配信中'        # 1 が正しい"
echo "  curl -s https://kurofukubo.com/ | grep -c 'App Storeで予約注文する'  # 0 が正しい"
echo "  curl -s https://kurofukubo.com/ | grep -c 'apple-itunes-app'          # 1 が正しい"
echo "  curl -sI https://kurofukubo.com/img/appstore-badge-ja.svg | head -1   # 200"
