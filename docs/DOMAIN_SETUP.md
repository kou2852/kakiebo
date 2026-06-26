# 独自ドメイン + SSL 設定手順

prod アカウント(`117953360790`)に独自ドメインを取得し、CloudFront(`d2vxkqrh04ac1u.cloudfront.net`)に
HTTPSで紐付ける。Route53 で取得すれば NS 委任が不要で最も簡単。

## 構成

**確定ドメイン: `kurofukubo.com`**（黒字＋複簿。Route53で取得、$15/年）

```
kurofukubo.com      → (後で) LP
www.kurofukubo.com  → (後で) LP
app.kurofukubo.com  → CloudFront E32HZNCIT2MXUM (Reactアプリ)   ← 今回の対象
```

- ホストゾーン: prod アカウントに作成（Route53取得時は自動）
- ACM証明書: **us-east-1 必須**（CloudFront用）。`app.<domain>`（と将来用に `<domain>`, `*.<domain>`）を含める
- 凡例: 🖥=手動（コンソール、私は代行不可） / 💻=CLIで私が実行可

---

## フェーズA: ドメイン取得（🖥 あなた）

### A-1. ドメイン名とTLDを決める
- **.com**: 最も信頼され一般的。約 $14/年
- **.app / .dev**: モダンでWebアプリ向き。HSTSプリロード済み=常時HTTPS必須だが、本構成はCloudFrontで常時HTTPSなので問題なし。約 $14〜20/年
- 短く・打ちやすく・サービス名と一致するものを推奨

### A-2. prod アカウントのコンソールにSSOで入る
1. AWSアクセスポータル（`https://d-956795c16b.awsapps.com/start`）を開く
2. `kakeibo-prod` → `AdministratorAccess` → 「Management console」

### A-3. Route53 でドメイン登録
1. Route53 → 左メニュー **Domains → Registered domains** → **Register domains**
2. 希望ドメインを検索 → 利用可能なものを選び **Select** → **Proceed to checkout**
3. 期間（1年）、**Auto-renew: Enable** 推奨
4. 連絡先情報（登録者）を入力。**Privacy protection: Enable**（対応TLDは無料で個人情報を隠せる）
5. ICANN規約に同意 → **Complete order**
6. ステータスが **registration successful** になるまで待つ（.com/.appなら数分〜数十分）
   - ※ TLDによっては登録者メールの確認リンクを15日以内にクリックする必要あり。届いたら必ず確認
7. 登録完了すると **ホストゾーンが自動作成**される（Route53 → Hosted zones に `<domain>` が出る）

### A-4. 私に伝える
- 取得した **ドメイン名**
- `app.<domain>` をアプリURLにする構成でよいか（別案があれば）

---

## ✅ 実施結果（完了）

- ドメイン: `kurofukubo.com`（Route53、Hosted Zone `Z0591546DS1L9CEG542K`）
- ACM証明書(us-east-1): `arn:aws:acm:us-east-1:117953360790:certificate/b7b9910a-cac5-43f4-8b93-c63c5d2a42a2`（`app` + apex + `*` をDNS検証で発行）
- CloudFront `E32HZNCIT2MXUM` に Alias `app.kurofukubo.com` + 証明書(SNI, TLS1.2_2021)を適用
- Route53 に `app.kurofukubo.com` の A/AAAA Alias を作成
- prod API CORS を `https://app.kurofukubo.com` に更新（Lambda CORSのため `sam deploy` のみで反映）
- 確認: `https://app.kurofukubo.com/` が 200、プリフライト 204 で新オリジン許可

---

## フェーズB: 証明書発行〜CloudFront紐付け（💻 私が実行）

ドメイン名が分かれば以下をCLIで実施する。

1. **ACM証明書をus-east-1で発行**（DNS検証、`app.<domain>` + `<domain>` + `*.<domain>`）
   ```
   aws acm request-certificate --domain-name app.<domain> \
     --subject-alternative-names <domain> *.<domain> \
     --validation-method DNS --region us-east-1 --profile kakeibo-prod
   ```
2. **検証用CNAMEをRoute53に自動追加** → 証明書が `ISSUED` になるまで待つ（数分）
3. **CloudFrontに代替ドメイン名(Aliases)と証明書を設定**
   - Aliases: `app.<domain>`
   - ViewerCertificate: 上のACM ARN, SNI, TLSv1.2_2021
4. **Route53にAliasレコード作成** `app.<domain>` (A/AAAA) → CloudFront
5. **動作確認**: `https://app.<domain>/` が 200 を返すこと

---

## フェーズC: 新ドメインへの追従更新（💻 私が実行）

1. フロント `.env.production` は API URL 変更なし（APIは別途カスタムドメイン化しない方針なら据え置き）
2. **prod API の CORS を `https://app.<domain>` に更新** → `samconfig.toml` prod の AllowedOrigin 変更 → `sam deploy --config-env prod`
   → その後 `INFRA_SETUP.md` の「CORS修正レシピ」を必ず実行（プリフライト反映のため）
3. Googleログイン実装時、Cognito/GoogleのコールバックURLを `https://app.<domain>` で登録

---

## 補足
- APIエンドポイント自体（execute-api）はカスタムドメイン化しない（フロントは `VITE_API_URL` で直接叩く）。
  必要になれば API Gateway カスタムドメイン + `api.<domain>` を後付け可能。
- ドメイン移管や外部レジストラ利用時は、Route53ホストゾーンのNS4本をレジストラ側に設定する作業が追加で必要。
