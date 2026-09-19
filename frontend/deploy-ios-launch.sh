#!/usr/bin/env bash
# iPhoneアプリの公開後の告知をWebアプリへ反映（公開日 2026-09-25 に実行）
#   - config/release.js を live:true / date:'2026-09-25' にした状態でビルドする
#     （更新情報が「公開しました」になり、1回だけの案内も公開後の文面に切り替わる）
#   - index.html に Smart App Banner（iPhone の Safari で上部に出る App Store の案内）
#
# ⚠ 公開を機械で確かめるまで実行しない。check-ios-live.mjs が通らなければ何もせず止まる。
#    公開前に配ると、全員に「公開しました」と嘘の告知を出すことになる。
#
# 実行:  bash deploy-ios-launch.sh
set -euo pipefail
export PYTHONUTF8=1 AWS_PAGER=""

BUCKET=kakeibo-web-prod-117953360790
DIST=E32HZNCIT2MXUM
PROFILE=kakeibo-prod
REGION=us-east-1

cd "$(dirname "$0")"

echo "== 0. 事前チェック =="
node ../scripts/check-ios-live.mjs || { echo "  !! App Store でまだ公開されていません。止めます。"; exit 1; }
grep -q 'live: true' src/config/release.js \
  || { echo "  !! release.js が live:true ではありません（公開日の変更が入っていない）"; exit 1; }
grep -q 'apple-itunes-app' index.html \
  || { echo "  !! index.html に Smart App Banner がありません（公開日の変更が入っていない）"; exit 1; }
aws s3api head-bucket --bucket "$BUCKET" --profile "$PROFILE" --region "$REGION" 2>/dev/null \
  || { echo "  !! バケットに到達できません: $BUCKET"; exit 1; }
echo "  公開を確認・release.js live:true・Smart App Banner あり・バケット到達"

echo "== 1. ビルド =="
npm run build
grep -rq 'apple-itunes-app' dist/index.html || { echo "  !! dist に Smart App Banner がありません"; exit 1; }
for U in $(grep -o "https://apps\.apple\.com[^']*" src/config/release.js | sort -u); do
  CODE=$(curl -sL -o /dev/null -w '%{http_code}' "$U")
  [ "$CODE" = "200" ] || { echo "  !! App Store のページが開けません（$CODE）: $U"; exit 1; }
done
echo "  App Store のページ: 200"

echo "== 2. 反映 =="
# ハッシュ付きの資産が積み上がるだけなので --delete は付けない
aws s3 sync dist/ "s3://$BUCKET/" --profile "$PROFILE" --region "$REGION" --only-show-errors
echo "  sync 完了"

echo "== 3. CloudFront 無効化 =="
MSYS_NO_PATHCONV=1 aws cloudfront create-invalidation \
  --distribution-id "$DIST" --paths '/*' \
  --profile "$PROFILE" --region "$REGION" \
  --query 'Invalidation.{Id:Id,Status:Status}' --output table

echo
echo "== 完了。数分後に下で確認 =="
echo "  curl -s https://app.kurofukubo.com/ | grep -c 'apple-itunes-app'   # 1 が正しい"
echo "  ブラウザで app.kurofukubo.com を開き、更新情報の先頭が「iPhoneアプリを公開しました」であること"
