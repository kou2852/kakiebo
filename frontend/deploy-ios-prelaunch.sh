#!/usr/bin/env bash
# iPhoneアプリの公開前告知をWebアプリへ反映（2026-09-09）
#   - 更新情報に「iPhoneアプリをまもなく公開します」を追加
#   - 記帳が1件以上ある人に、1回だけ案内のポップアップを出す
#   - 自前ビーコン ios_soon_shown / ios_promo_shown / ios_promo_click を追加
#
# ⚠ 公開前は config/release.js の live が false。この状態では
#    App Storeへのリンクは一切描画されない（未公開IDは404のため）。
#    公開後は live:true + date を入れて再デプロイすると告知が切り替わる。
#
# 実行:  bash deploy-ios-prelaunch.sh
set -euo pipefail
export PYTHONUTF8=1 AWS_PAGER=""

BUCKET=kakeibo-web-prod-117953360790
DIST=E32HZNCIT2MXUM
PROFILE=kakeibo-prod
REGION=us-east-1

cd "$(dirname "$0")"

echo "== 0. 事前チェック =="
# 公開前なのに live:true のまま配ると、死んだApp Storeリンクを全ユーザーに見せる。
if ! grep -q 'live: false' src/config/release.js; then
  echo "  !! release.js が live:false ではありません。"
  echo "     公開後の配信なら node ../scripts/check-ios-live.mjs を通してから続けてください。"
  exit 1
fi
echo "  release.js: live=false（公開前の内容）"

# バケットの存在確認。名前を間違えたまま進むと別の場所へ配ってしまう。
aws s3api head-bucket --bucket "$BUCKET" --profile "$PROFILE" --region "$REGION" 2>/dev/null \
  || { echo "  !! バケットに到達できません: $BUCKET"; exit 1; }
echo "  バケット確認: $BUCKET"

echo "== 1. ビルド =="
npm run build

# ビルド成果物にApp Storeへの参照が混ざっていないこと（公開前）。
if grep -rq 'apps\.apple\.com\|apple-itunes-app' dist/ 2>/dev/null; then
  echo "  !! dist に App Store への参照があります。公開前に配ってはいけません。"
  exit 1
fi
echo "  dist に App Store への参照なし"

echo "== 2. 反映 =="
# ハッシュ付きの資産が積み上がるだけなので --delete は付けない
# （付けると、配信中の古いHTMLが参照している資産を消してしまう）。
aws s3 sync dist/ "s3://$BUCKET/" \
  --profile "$PROFILE" --region "$REGION" --only-show-errors
echo "  sync 完了"

echo "== 3. CloudFront 無効化 =="
MSYS_NO_PATHCONV=1 aws cloudfront create-invalidation \
  --distribution-id "$DIST" --paths '/*' \
  --profile "$PROFILE" --region "$REGION" \
  --query 'Invalidation.{Id:Id,Status:Status}' --output table

echo
echo "== 完了。数分後に下で確認 =="
echo "  curl -s https://app.kurofukubo.com/ | grep -c 'apple'   # 0 が正しい（公開前）"
echo "  ブラウザで app.kurofukubo.com を開き、ベルに未読の赤ドットが出ること"
echo "  「iPhoneアプリをまもなく公開します」が更新情報の先頭に出ること"
