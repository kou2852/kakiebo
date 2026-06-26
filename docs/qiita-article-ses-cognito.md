---
title: "Amazon SESの本番アクセスに2回落ちたので、Cognito標準送信でメール認証を動かした（落とし穴つき）"
tags:
  - AWS
  - Cognito
  - AmazonSES
  - 個人開発
  - CloudFormation
private: false
updated_at: ""
id: null
organization_url_name: null
slide: false
ignorePublish: false
---

個人開発のWebアプリ（Cognito + SESでメール認証）で、**確認コードのメールが新規ユーザーに届かない**問題に詰まり、最終的に **Cognito標準送信（COGNITO_DEFAULT）** に切り替えて回避しました。同じところでハマる人が多そうなので、原因・回避・落とし穴を残します。

> なお、作っているのは家計簿アプリ **[kurofukubo](https://kurofukubo.com/?utm_source=qiita&utm_medium=article)** です（紹介は末尾に）。

## まず誤解していたこと：「SESサンドボックスの制約＝1日200通」ではない

SESをサンドボックスのまま使うと、こう思いがちです。

> 200通/日も使わないから、うちは問題ないでしょ

**これが間違いでした。** サンドボックスの本当の制約は送信数ではなく、

> **検証済み（verified）のメールアドレス／ドメインにしか送れない**

です。つまり新規ユーザーが適当なメアドで登録 → Cognitoが確認コードをSESで送信 → **その宛先は未検証だから届かない**。結果、**誰も登録を完了できない**。200通/日は関係ありませんでした。

確認は CLI で一発：

```bash
aws sesv2 get-account --query "{prod:ProductionAccessEnabled,max:SendQuota.Max24HourSend}"
# => {"prod": false, "max": 200.0}  ← false = サンドボックス
```

## 本番アクセス申請は、理由非開示で2回却下された

サンドボックスを抜けるには「本番アクセス（production access）」の承認が要ります。が、申請すると——

> お客様が Amazon SES を利用することで Amazon のサービスに悪影響が生じる恐れがあると判断されました。（…）セキュリティ上の理由により、詳細情報を提供することはできません。

という**定型文で2回拒否**。理由が分からないので改善のしようもなく、**同じ内容での再申請は時間の無駄**と判断しました。新規アカウント／新しいドメインだと通りにくい、という話はよく聞きます。

## 選択肢の整理

| 手段 | 宛先制限 | 到達性/ブランド | 手間 |
|---|---|---|---|
| SES本番を再申請 | 解除される | ◎（DKIM・独自差出人） | 承認が下りない |
| **Cognito標準送信(COGNITO_DEFAULT)** | **なし（誰にでも届く）** | △（汎用差出人・約50通/日） | **小** |
| 専用ESP(Resend/Postmark等) | なし | ◎ | 中（CustomEmailSender Lambda） |

「まず動かす」を最優先に、**Cognito標準送信**を選びました。

## Cognitoには2つのメール送信方式がある

- `EmailSendingAccount: DEVELOPER` … **SES経由**（サンドボックス制約をそのまま食らう）
- `EmailSendingAccount: COGNITO_DEFAULT` … **Cognito標準送信**。差出人は固定の `no-reply@verificationemail.com`、**約50通/日**、ただし**宛先検証は不要＝誰にでも届く**

トレードオフは明確です。COGNITO_DEFAULTは**約50通/日**・**汎用差出人で迷惑メールに入りやすい**・**独自ドメイン差出人にできない**。が、個人開発の初期で「1日50登録」は十分なので、これで開けます。

## 実装：SAMテンプレートを“条件で外す”だけ

ポイントは、`EmailConfiguration` を**条件付き**にしておくこと。SES用のパラメータが空なら、`EmailConfiguration` ごと省略 → Cognitoは自動で **COGNITO_DEFAULT** にフォールバックします。

```yaml
Parameters:
  SesIdentityArn:
    Type: String
    Default: ""   # 空なら Cognito 標準送信

Conditions:
  HasSes: !Not [!Equals [!Ref SesIdentityArn, ""]]

Resources:
  UserPool:
    Type: AWS::Cognito::UserPool
    Properties:
      AutoVerifiedAttributes: [email]
      UsernameAttributes: [email]
      EmailConfiguration: !If
        - HasSes
        - EmailSendingAccount: DEVELOPER
          From: !Ref SesFromEmail
          SourceArn: !Ref SesIdentityArn
        - !Ref AWS::NoValue          # ← ここ。SES無しなら COGNITO_DEFAULT
      # 確認メールを日本語でブランド化（標準送信でも有効）
      VerificationMessageTemplate:
        DefaultEmailOption: CONFIRM_WITH_CODE
        EmailSubject: "【MyApp】メールアドレスの確認コード"
        EmailMessage: "ご登録ありがとうございます。<br><br>確認コード： <b>{####}</b><br>このコードを入力してください。"
```

切り替えは **`SesIdentityArn=""` を渡すだけ**。既存スタックでも `EmailConfiguration` が外れて COGNITO_DEFAULT に落ちます（後述しますが UserPool は再作成されません）。

## 落とし穴①：件名の `{####}` は展開されない

最初、件名を `"【MyApp】確認コード: {####}"` にしたら、**届いたメールの件名がそのまま `確認コード: {####}`** になりました。

調べると、`VerificationMessageTemplate` で **`{####}`（確認コード）が展開されるのは本文 `EmailMessage` だけ**。**`EmailSubject` では展開されません**（むしろ `EmailMessage` には `{####}` が必須）。件名にコードを入れたいと思ってもダメなので、件名はプレーンに、コードは本文に置きます。

## 落とし穴②：デプロイ時にシークレットをコマンドラインに出さない

このスタックは Google ログイン用に `GoogleClientSecret` パラメータも持っていました。`sam deploy --parameter-overrides GoogleClientSecret=...` だと**シークレットがコマンドライン（履歴・プロセス一覧）に露出**します。

避けるために、**`sam package` + CloudFormation の change-set** で、変更しないパラメータは `UsePreviousValue=true` にしました（シークレットは触らない＝渡さない）。

```bash
sam build
sam package --resolve-s3 --output-template-file packaged.yaml

# 変更するのは SesIdentityArn だけ。他は前回値を流用
cat > params.json <<'JSON'
[
  {"ParameterKey":"SesIdentityArn","ParameterValue":""},
  {"ParameterKey":"GoogleClientSecret","UsePreviousValue":true},
  {"ParameterKey":"GoogleClientId","UsePreviousValue":true}
]
JSON

aws cloudformation create-change-set --stack-name my-stack \
  --change-set-name enable-cognito-email \
  --template-body file://packaged.yaml --capabilities CAPABILITY_IAM \
  --parameters file://params.json

# 中身を確認してから実行
aws cloudformation describe-change-set --stack-name my-stack --change-set-name enable-cognito-email \
  --query "Changes[].ResourceChange.{A:Action,R:LogicalResourceId,Rep:Replacement}"
aws cloudformation execute-change-set --stack-name my-stack --change-set-name enable-cognito-email
```

change-set で確認すると **UserPool は `Modify` / `Replacement=False`** ＝ **既存ユーザーを保持したまま in-place 更新**でした。ここは事前に必ず確認した方がいいです（Replacement=True だと作り直し＝ユーザー消滅）。

切り替え後の確認：

```bash
aws cognito-idp describe-user-pool --user-pool-id <POOL_ID> \
  --query "UserPool.EmailConfiguration"
# => { "EmailSendingAccount": "COGNITO_DEFAULT" }
```

## CX（顧客体験）も落とさない工夫

COGNITO_DEFAULTは差出人が汎用で**迷惑メールに入りやすい**。フラグを倒すだけでなく、こうしました：

- 確認画面に **「数分しても届かない場合は迷惑メールフォルダをご確認ください（差出人: no-reply@verificationemail.com）」** と明記
- **「コードを再送」**ボタン（`amazon-cognito-identity-js` の `resendConfirmationCode`）
- そもそも **Googleログインを主導線**にして「メール確認が要らない最短ルート」へ誘導

```js
// 確認コードの再送
const cognitoUser = new CognitoUser({ Username: email, Pool: userPool });
cognitoUser.resendConfirmationCode((err, res) => { /* ... */ });
```

## まとめ

- SESサンドボックスの壁は**「200通/日」ではなく「検証済み宛先のみ」**。
- 本番アクセスが通らないなら、**Cognito標準送信(COGNITO_DEFAULT)で“まず動かす”**のが現実的。`SesIdentityArn=""` で切替、テンプレ改修不要。
- 落とし穴は **件名の`{####}`非展開** と **デプロイ時のシークレット露出**（change-set + `UsePreviousValue` で回避）。
- 到達性が課題になったら、後から **ESP（Resend等）を CustomEmailSender で**、もしくは SES本番に**戻せる（可逆）**。

---

## 作ったもの：kurofukubo（黒福簿）

この記事の認証は、自作の家計簿アプリ **kurofukubo** で実際に動いています。メールが主役ではないサービスなら「Googleログイン主体＋メールはCognito標準送信」で十分立ち上がる、という判断でした。

![一行入力→自動で複式仕訳→純資産に反映](https://kurofukubo.com/op.gif)

- 預金・証券・NISA/iDeCo・ローンまで含めた **純資産** を1画面で把握
- 「食費 1200 現金」と一行打つだけ → 裏で **複式簿記** の仕訳に自動変換
- **銀行連携なし**／**運営者にも中身が読めないE2E暗号化**に対応
- **完全無料・登録不要**（ゲストでそのまま試せる）

👉 登録なしで試す： https://app.kurofukubo.com/?guest&utm_source=qiita&utm_medium=article
