# インフラ初期設定手順（マルチアカウント + root脱却）

財務データを扱うため、**root常用をやめ、AWS Organizations で dev/prod を別アカウントに物理分離**する。
pre-launch の今が唯一の低コストな移行タイミング（実ユーザーが付いた後の移行は prod データ移設が困難）。

## 目標構成

```
AWS Organizations
├── 管理アカウント (885418708508 ← 現アカウント)
│     ・請求 / Organizations / IAM Identity Center のみ
│     ・ワークロードは置かない。rootはMFA+金庫行き
├── dev アカウント（新規）   … kakeibo-saas-dev スタック
└── prod アカウント（新規）  … kakeibo-saas-prod スタック
```

人間のアクセスは **IAM Identity Center (SSO)** 経由で各アカウントへ。
ローカルからのデプロイは `aws sso login` で取得する一時クレデンシャル（プロファイル `kakeibo-dev` / `kakeibo-prod`）を使う。長期アクセスキーは作らない。

## 凡例
- 🖥 = AWSコンソールでの手動操作（私は代行不可）
- 💻 = ローカルでCLI実行（`! <cmd>` でこのセッションにも流せる）
- 📝 = リポジトリ側で対応済み / 私が用意

---

## フェーズ0: 管理アカウントの root を保護

1. 🖥 ルートでログイン → IAM → ルートユーザーの **MFA を有効化**（仮想MFAアプリ可）
2. 🖥 IAM → ルートの **アクセスキーがあれば後で削除**（フェーズ4でSSO疎通を確認してから。今消すとデプロイ手段を失うため順序厳守）

## フェーズ1: Organizations と member アカウント作成

3. 🖥 コンソール → **AWS Organizations** → 組織を作成（管理アカウント = 現アカウント）
4. 🖥 アカウントを2つ追加（「AWSアカウントを追加」→ 新規作成）
   - `kakeibo-dev`  / メール例: `aws+dev@<yourdomain>`
   - `kakeibo-prod` / メール例: `aws+prod@<yourdomain>`
   - ※ メールは各アカウントで一意必須。Gmail等の `+エイリアス` が使える
   - 作成された **dev / prod の 12桁アカウントID を控える**

## フェーズ2: IAM Identity Center (SSO) でアクセス基盤を作る

5. 🖥 コンソール → **IAM Identity Center** を有効化（リージョンは ap-northeast-1 推奨）
6. 🖥 Users → 自分のユーザーを1つ作成（MFA必須化推奨）
7. 🖥 Permission sets → `AdministratorAccess`（AWS管理ポリシー）を1つ作成
   - 当面はAdminで運用。落ち着いたらデプロイ専用の最小権限セットに絞る（フェーズ6補足）
8. 🖥 AWS accounts → dev と prod の両方に、自分のユーザー × `AdministratorAccess` を割り当て
9. 🖥 設定の **AWSアクセスポータルURL** を控える（`https://d-xxxx.awsapps.com/start`）

## フェーズ3: ローカルCLIをSSO化

10. 💻 SSOプロファイルを設定（対話）。`! aws configure sso` を実行し、以下を入力:
    - SSO start URL: フェーズ2-9のポータルURL
    - SSO region: `ap-northeast-1`
    - アカウント選択: dev → プロファイル名 `kakeibo-dev`
    - もう一度実行して prod → プロファイル名 `kakeibo-prod`
11. 💻 疎通確認:
    ```
    ! aws sts get-caller-identity --profile kakeibo-dev
    ! aws sts get-caller-identity --profile kakeibo-prod
    ```
    それぞれ **dev / prod のアカウントID** が返ればOK（root ARN でないこと）

## フェーズ4: root アクセスキーを削除

12. 🖥 SSO経由のデプロイ（フェーズ5）が通ることを確認した後、
    管理アカウントの **ルートのアクセスキーを削除**。以後 root はログインのみ・通常作業で使わない。
13. 💻 旧 root プロファイル（`~/.aws/credentials` の default 等）に root キーが残っていれば削除。

---

## フェーズ5: 各環境へデプロイ

`samconfig.toml` を dev/prod のプロファイル切替に対応済み（📝）。

14. 💻 dev へデプロイ（セキュリティ修正反映済みコードを新 dev アカウントに展開）:
    ```
    ! cd backend; sam build; sam deploy --config-env dev
    ```
15. 💻 prod へデプロイ:
    ```
    ! cd backend; sam build; sam deploy --config-env prod
    ```
16. 💻 各 deploy の Outputs（ApiUrl / UserPoolId / UserPoolClientId）を控え、
    フロントの環境ファイルに反映:
    - dev: `frontend/.env.local`（開発用）
    - prod: `frontend/.env.production`（ビルド時に使用）

> **AllowedOrigin 注意**: prod は CORS を実オリジンに絞る必要がある。
> 独自ドメイン未確定の間は仮値のままにせず、ドメイン確定後に
> `samconfig.toml` の prod `parameter_overrides` を更新して再デプロイすること。

---

## CORSプリフライト（✅ 恒久対策済み）

**解決済み**: ゲートウェイの CORS(MOCK OPTIONS)を廃止し、OPTIONS を各 Lambda に
`Authorizer: NONE` で流して `ALLOWED_ORIGIN` 環境変数からCORSを返す設計に変更した
（`template.yaml` + 各ハンドラ冒頭の `if (event.httpMethod === 'OPTIONS') return noContent();`）。
これにより **`AllowedOrigin` を変えたら `sam deploy --config-env prod` だけで反映される**。
下記の手動パッチはもう不要（履歴として残す）。

---

### （旧）手動パッチ手順 — 現在は不要

以前は SAM が CORS の `AllowOrigin` を API Gateway の `DefinitionBody` 内に `Fn::Sub` で埋め込んでおり、
`AllowedOrigin` を変えて `sam deploy` しても OPTIONS(MOCK)統合レスポンスが更新されなかった。

**症状の確認:**
```
Invoke-WebRequest -Uri "<ApiUrl>/api/journals" -Method Options `
  -Headers @{ "Origin"="<新オリジン>"; "Access-Control-Request-Method"="GET" } -UseBasicParsing |
  ForEach-Object { $_.Headers['Access-Control-Allow-Origin'] }
```

**修正レシピ（`sam deploy` で AllowedOrigin を変えた後は毎回これを実行）:**
```powershell
$api="<rest-api-id>"; $origin="'<新オリジン>'"; $profile="kakeibo-prod"
$res = aws apigateway get-resources --rest-api-id $api --profile $profile --region ap-northeast-1 --output json | ConvertFrom-Json
foreach ($r in $res.items) {
  if ($r.resourceMethods -and $r.resourceMethods.PSObject.Properties.Name -contains 'OPTIONS') {
    aws apigateway update-integration-response --rest-api-id $api --resource-id $r.id --http-method OPTIONS --status-code 200 `
      --patch-operations "op=replace,path=/responseParameters/method.response.header.Access-Control-Allow-Origin,value=`"$origin`"" `
      --profile $profile --region ap-northeast-1 --output text > $null
  }
}
aws apigateway create-deployment --rest-api-id $api --stage-name prod --profile $profile --region ap-northeast-1
```

> （この恒久対策は実施済み。上記の通り OPTIONS を Lambda で返すよう変更した）

## 補足: IAM最適化の現状評価

- **Lambda実行ロール**: 各関数とも `DynamoDBCrudPolicy`（テーブル単位にスコープ済み）で、
  既に最小権限に近い。`*` リソースや過剰権限は無し → 追加対応不要。
- **本当の問題はデプロイ/人間のID**（= root常用）であり、本手順がそれを解消する。
- **将来のハードニング**: デプロイをAdminでなく専用CloudFormation実行ロールに絞る場合、
  scopedポリシー（CFN/Lambda/DynamoDB/Cognito/APIGW/IAM:PassRoleの該当アクションのみ）の
  サービスロールを各 member アカウントに作り、`sam deploy --role-arn` で渡す。
  pre-launch段階では優先度低。
