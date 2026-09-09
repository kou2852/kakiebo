#!/usr/bin/env bash
# iPhoneアプリの公開前告知をLPへ反映（2026-09-09）
#   - iPhoneアプリのセクションを新設（#ios）
#   - 「アプリのインストールも不要」の記載を削除（iOS版を出すため事実と合わなくなる）
#   - FAQを審査中の表現に更新（表示とJSON-LDの両方）
#   - analytics.js に cta_appstore を追加（公開後のApp Store遷移をGA4で数える）
#
# ⚠ このスクリプトは「公開前」の内容を配る。App Storeへのリンクもバッジも含まない。
#    公開後の差し替えは deploy-ios-launch.sh（公開後に作る）で行う。
#
# ⚠ s3 sync は使わない。消し込みで意図しないファイルが消える（SUBMISSION.md の方針）。
#    aws s3 cp で必要なファイルだけ差し替え、そのパスだけ無効化する。
#
# 実行:  bash deploy-ios-prelaunch.sh
set -euo pipefail
export PYTHONUTF8=1 AWS_PAGER=""

BUCKET=kakeibo-lp-117953360790
DIST=E2ANL068WDF75Y
PROFILE=kakeibo-prod
REGION=us-east-1
CC="public, max-age=0, must-revalidate"

cd "$(dirname "$0")"

echo "== 0. 事前チェック =="
# 公開前の告知なので、App Storeへのリンクが混ざっていたら止める。
if grep -q 'apps\.apple\.com\|apple-itunes-app\|appstore-badge' index.html; then
  echo "  !! index.html に App Store への参照があります。公開前に配ってはいけません。"
  exit 1
fi
echo "  index.html に App Store への参照なし"

echo "== 1. HTML / JS =="
for f in index.html analytics.js; do
  [ -f "$f" ] || { echo "  !! 見つかりません: $f"; exit 1; }
  case "$f" in
    *.html) CT="text/html; charset=utf-8" ;;
    *.js)   CT="text/javascript; charset=utf-8" ;;
  esac
  aws s3 cp "$f" "s3://$BUCKET/$f" \
    --profile "$PROFILE" --region "$REGION" \
    --content-type "$CT" --cache-control "$CC" --only-show-errors
  echo "  uploaded: $f"
done

echo "== 2. 画像（新規） =="
for f in img/ios-dashboard.webp img/ios-entry.webp; do
  [ -f "$f" ] || { echo "  !! 見つかりません: $f"; exit 1; }
  aws s3 cp "$f" "s3://$BUCKET/$f" \
    --profile "$PROFILE" --region "$REGION" \
    --content-type "image/webp" --cache-control "$CC" --only-show-errors
  echo "  uploaded: $f"
done

echo "== 3. CloudFront 無効化 =="
MSYS_NO_PATHCONV=1 aws cloudfront create-invalidation \
  --distribution-id "$DIST" \
  --paths /index.html /analytics.js /img/ios-dashboard.webp /img/ios-entry.webp \
  --profile "$PROFILE" --region "$REGION" \
  --query 'Invalidation.{Id:Id,Status:Status}' --output table

echo
echo "== 完了。数分後に下で確認 =="
echo "  curl -s https://kurofukubo.com/ | grep -c 'ポケットに'          # 1 なら反映済み"
echo "  curl -s https://kurofukubo.com/ | grep -c 'インストールも不要'   # 0 が正しい"
echo "  curl -s https://kurofukubo.com/ | grep -c 'apps.apple.com'      # 0 が正しい（公開前）"
echo "  curl -sI https://kurofukubo.com/img/ios-dashboard.webp | head -1"
