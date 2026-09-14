#!/usr/bin/env bash
# API Gateway のアクセスログに User-Agent を1項目足す（2026-09-10）
#
# なぜ: モバイルアプリには計測を入れていないが、APIは叩いている。ログに UA が
#       あれば「アプリからか、ブラウザからか」が分かり、アプリを更新せずに
#       利用者数・記帳数・継続を端末別に出せる。集計は scripts/admin 側に実装済み。
#
# ⚠ テンプレートの変更は Format 行の1行だけ。だがこのデプロイ自体は危険度が高い。
#    `--parameter-overrides` は**書かなかったパラメータを既定値（空文字）に戻す**。
#    全パラメータの Default が "" なので、書き漏らすと Google ログイン・
#    Sign in with Apple・モバイルのOAuthリダイレクトが同時に壊れる。
#    そのため下では本番の現在値を describe-stacks から読み、秘密2つだけ SSM から
#    取って組み立てる。値をここに直書きしない。
#
# ⚠ SesIdentityArn は空のままにする。値を入れると Cognito が SES 経由になり、
#    未検証アドレスへ確認コードが一切届かなくなる（2026-08-02〜08-08 に発生）。
#
# 実行:
#   bash deploy-access-log-ua.sh            … チェンジセットを作るだけ（適用しない）
#   bash deploy-access-log-ua.sh --execute  … 中身を確認したうえで適用する
set -euo pipefail
export PYTHONUTF8=1 AWS_PAGER=""

STACK=kakeibo-saas-prod
PROFILE=kakeibo-prod
REGION=ap-northeast-1

cd "$(dirname "$0")"

aws() { command aws "$@" --profile "$PROFILE" --region "$REGION"; }

# sam の呼び出し方。
#
# ⚠ Git Bash の PATH に sam が入っていないことがある（インストーラが cmd 側にだけ通す）。
# ⚠ 見つけても sam.cmd を直接叩いてはいけない。cmd.exe 経由になり、パス中の空白で
#    「'C:\Program' は認識されていません」と落ちる。sam.cmd の中身は
#    `runtime/python.exe -m samcli %*` だけなので、python.exe を直に呼べば回避できる。
# ⚠ このチェックは秘密を SSM から読む前に置く。後ろだと、読んだ後で落ちて無駄になる。
SAM_PY="/c/Program Files/Amazon/AWSSAMCLI/runtime/python.exe"
if [ -f "$SAM_PY" ]; then
  sam() { "$SAM_PY" -m samcli "$@"; }
elif command -v sam >/dev/null 2>&1; then
  sam() { command sam "$@"; }
else
  echo "  !! sam が見つかりません。AWS SAM CLI の場所を確認してください。"; exit 1
fi
sam --version >/dev/null 2>&1 || { echo "  !! sam を実行できません。"; exit 1; }

echo "== 1. 本番の現在値を読む =="
PARAMS_JSON=$(aws cloudformation describe-stacks --stack-name "$STACK" \
  --query 'Stacks[0].Parameters' --output json)
get() { printf '%s' "$PARAMS_JSON" | node -e "
  let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
    const p=JSON.parse(s).find(x=>x.ParameterKey==='$1');
    process.stdout.write(p?p.ParameterValue:'');
  });"; }

STAGE=$(get Stage); ALLOWED=$(get AllowedOrigin); LP=$(get LpOrigin)
ALARM=$(get AlarmEmail); GCID=$(get GoogleClientId); MOBILE=$(get MobileRedirectUris)
ASID=$(get AppleServicesId); ATID=$(get AppleTeamId); AKID=$(get AppleKeyId)
SESFROM=$(get SesFromEmail)

for v in STAGE ALLOWED LP ALARM GCID MOBILE ASID ATID AKID; do
  [ -n "${!v}" ] || { echo "  !! $v が空です。書き漏らすと機能が壊れるため中断します。"; exit 1; }
done
echo "  Stage=$STAGE / Apple=$ASID / Mobile=$MOBILE"

echo "== 2. 秘密を SSM から読む（describe-stacks では **** で返るため） =="
# ⚠ client_secret は ssm-secure 動的参照が Cognito IdP で非対応。デプロイ時に渡す方式。
# ⚠ MSYS_NO_PATHCONV=1 が要る。Git Bash は先頭スラッシュの引数を Windows パスへ
#    書き換えるので、無いと /kakeibo/... が別名になり ParameterNotFound で落ちる
#    （2026-09-10 に実際に踏んだ。パラメータ自体は正しく存在していた）。
GSEC=$(MSYS_NO_PATHCONV=1 aws ssm get-parameter --name /kakeibo/google-client-secret --with-decryption \
  --query Parameter.Value --output text)
APKEY=$(MSYS_NO_PATHCONV=1 aws ssm get-parameter --name /kakeibo/apple-private-key --with-decryption \
  --query Parameter.Value --output text)
[ -n "$GSEC" ] && [ -n "$APKEY" ] || { echo "  !! 秘密を取得できませんでした。中断します。"; exit 1; }
echo "  google-client-secret: ${#GSEC} 文字 / apple-private-key: ${#APKEY} 文字"

echo "== 3. チェンジセットを作る =="
# ⚠ SesIdentityArn は意図的に渡さない（既定の空のまま）。
OVERRIDES="Stage=$STAGE AllowedOrigin=$ALLOWED LpOrigin=$LP AlarmEmail=$ALARM \
SesFromEmail=$SESFROM \
GoogleClientId=$GCID GoogleClientSecret=$GSEC MobileRedirectUris=$MOBILE \
AppleServicesId=$ASID AppleTeamId=$ATID AppleKeyId=$AKID ApplePrivateKey=$APKEY"

if [ "${1:-}" = "--execute" ]; then
  echo "  ※ 適用します"
  sam deploy --config-env prod --no-confirm-changeset \
    --parameter-overrides "$OVERRIDES"
else
  sam deploy --config-env prod --no-execute-changeset \
    --parameter-overrides "$OVERRIDES"
  echo
  echo "== チェンジセットを作りました。適用していません。 =="
  echo "  上の一覧で、変更が AWS::ApiGateway::Stage（または ServerlessRestApi の Stage）だけか"
  echo "  確認してください。Cognito・Lambda・DynamoDB が出てきたら適用しないこと。"
  echo "  問題なければ: bash deploy-access-log-ua.sh --execute"
fi

echo
echo "== 適用後の確認 =="
echo "  1) 実機のiPhoneアプリで1操作する"
echo "  2) 下でUAが載っているか見る（ua が空でなければ成功）"
echo "     aws logs filter-log-events --log-group-name /aws/apigateway/$STACK \\"
echo "       --start-time \$(( \$(date +%s) * 1000 - 600000 )) --limit 5 \\"
echo "       --query 'events[].message' --output text --profile $PROFILE --region $REGION"
echo "  3) Googleログイン・Appleログインが通ることを実機で確認する"
