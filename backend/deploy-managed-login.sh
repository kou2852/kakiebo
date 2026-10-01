#!/usr/bin/env bash
# Cognito のログイン画面をマネージドログイン（バージョン 2）に切り替える（2026-10-01）
#
# なぜ: 従来のホスト UI は prompt=select_account を Google に渡さないため、Android で
#       端末の Google アカウントが勝手に選ばれ、別のアカウントでログインできなかった。
#       マネージドログインは prompt を外部 IdP へ渡す（AWS の資料で確認）。プランは既に Essentials。
#
# テンプレートの変更は2つ:
#   - UserPoolDomain に ManagedLoginVersion: 2
#   - ManagedLoginBranding（AWS 標準の見た目）を1つ追加
# ドメイン名・戻り先 URL（/oauth2/idpresponse）は変わらない。Google Cloud・Apple 側の設定は不要。
#
# ⚠ パラメータは deploy-access-log-ua.sh と同じく本番の現在値と SSM から組み立てる（書き漏らすとログインが壊れる）。
# ⚠ チェンジセットに API Gateway のステージ（アクセスログの書式）が出たら、9/10 の UA の変更が未適用のまま
#    ここに相乗りしている。害は無いが、出た旨を確認してから適用する。
#
# 実行:
#   bash deploy-managed-login.sh            … チェンジセットを作るだけ（適用しない）
#   bash deploy-managed-login.sh --execute  … 中身を確認したうえで適用する
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

echo "== 0. ビルド（テンプレートの変更を反映する） =="
# ⚠ sam deploy は .aws-sam/build の古いビルド結果を使う。ビルドし直さないと、テンプレートを直しても
#    「No changes to deploy」になる（2026-10-01 に踏んだ。9/23 のビルドが使われていた）。
PYTHONUTF8=1 sam build >/dev/null || { echo "  !! sam build に失敗しました"; exit 1; }
grep -q 'ManagedLoginVersion' .aws-sam/build/template.yaml || { echo "  !! ビルド結果に ManagedLoginVersion がありません"; exit 1; }
echo "  ok"

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
  echo "  上の一覧で、変更が次だけか確認してください:"
  echo "    - AWS::Cognito::UserPoolDomain（Modify）"
  echo "    - AWS::Cognito::ManagedLoginBranding（Add）"
  echo "    - （出ることがある）API Gateway のステージ＝9/10 の UA の変更の相乗り"
  echo "  UserPool・UserPoolClient・IdP・Lambda・DynamoDB の Replace が出たら適用しないこと。"
  echo "  問題なければ: bash deploy-managed-login.sh --execute"
fi

echo
echo "== 適用後の確認 =="
echo "  1) Google への転送先に prompt=select_account が付くか（ログインはしない）は Claude が確認する"
echo "  2) Pixel・iPhone・ウェブで Google ログイン → アカウントを選ぶ画面が出ること"
echo "  3) Apple ログイン・メールのログインが通ること"
