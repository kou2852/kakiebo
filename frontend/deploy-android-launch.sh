#!/usr/bin/env bash
# Androidアプリの公開（Google Play・2026-10-27）の告知をWebアプリへ反映
#   - config/release.js の ANDROID_APP（live:true / date:'2026-10-27'）と AndroidPromoModal を含めてビルドする
#     （更新情報の先頭が「Androidアプリを公開しました」になり、1回だけの案内が出る。iPhone・iPad には出ない）
#   - release.js の APP_LATEST.android = 1.0.4（アプリ内の「新しいバージョンがあります」の基準）
#
# ⚠ Google Play のページが開けないうちは実行しない。公開前に配ると、全員に「公開しました」と嘘の告知を出す。
# ⚠ ビルドは作業ツリーから作る。frontend/ に未コミットの変更があれば、それも載ってしまうので止まる。
#
# 先に:  aws sso login --profile kakeibo-prod
# 実行:  bash deploy-android-launch.sh
set -euo pipefail
export PYTHONUTF8=1 AWS_PAGER=""

BUCKET=kakeibo-web-prod-117953360790
DIST=E32HZNCIT2MXUM
PROFILE=kakeibo-prod
REGION=us-east-1
PLAY="https://play.google.com/store/apps/details?id=com.kurofukubo.app&hl=ja"

cd "$(dirname "$0")"

echo "== 0. 事前チェック =="
CODE=$(curl -sL -o /tmp/play-check.html -w '%{http_code}' "$PLAY")
{ [ "$CODE" = "200" ] && grep -q 'com.kurofukubo.app' /tmp/play-check.html; } \
  || { echo "  !! Google Play のページが開けません（$CODE）。止めます。"; exit 1; }
grep -q 'live: true' src/config/release.js || { echo "  !! release.js が live:true ではありません"; exit 1; }
[ -f src/components/Common/AndroidPromoModal.jsx ] || { echo "  !! AndroidPromoModal.jsx がありません"; exit 1; }
git diff --quiet HEAD -- . || { echo "  !! frontend/ に未コミットの変更があります。載せたくなければコミットか退避してから:"; git status --short -- . ; exit 1; }
aws s3api head-bucket --bucket "$BUCKET" --profile "$PROFILE" --region "$REGION" 2>/dev/null \
  || { echo "  !! バケットに到達できません: $BUCKET（aws sso login --profile $PROFILE）"; exit 1; }
echo "  Google Play: 200・release.js live:true・コミット済み・バケット到達"

echo "== 1. ビルド =="
npm run build
grep -rq 'android_promo_shown' dist/assets || { echo "  !! dist に Android の案内がありません"; exit 1; }
echo "  ok"

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
echo "  curl -s https://app.kurofukubo.com/updates.json | grep -o '\"latest\"[^}]*}[^}]*}'   # android が 1.0.4"
echo "  ブラウザで app.kurofukubo.com を開き、更新情報の先頭が「Androidアプリを公開しました」であること（?selftest=1 を付ける）"
