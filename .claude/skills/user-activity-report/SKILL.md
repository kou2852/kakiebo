---
name: user-activity-report
description: kurofukubo本番の登録ユーザーごとの最終ログイン日・最終記帳日・継続状況を確認する。「アクティブユーザー見て」「最終ログイン/記帳日は？」「ユーザーの利用状況確認して」「記帳が続いてる人どれくらい？」のような依頼で必ず使う。CloudFrontログの匿名ビーコン集計（scripts/admin）とは別物 — 個人（sub）単位の利用状況が要る場合はこちらを使う。
---

# ユーザー利用状況レポート

登録ユーザー1人ずつの「最終ログイン日」「最終記帳日」「継続日数」を、DynamoDB本番テーブル (`kakeibo-prod`) を直接読んで出す。

**既存スクリプトをそのまま使う。新しく書き直さない。**

## 実行コマンド

```bash
cd /c/dev/BudgetBook/kakeibo-saas
node docs/design-gen/report-users.mjs        # 最終利用日・最終書込日・仕訳数
node docs/design-gen/report-journal-days.mjs # 記帳日数・初日集中度・継続日数
```

どちらも `--profile kakeibo-prod --region ap-northeast-1` で動く。AWS SSOログインが必要な場合は `aws sso login --profile kakeibo-prod` を案内する。

## 何が分かるか

- `report-users.mjs`：Cognito登録日 × DynamoDB `PROFILE.lastSeen`（最終利用日・GET時に記録）× `updatedAt`最大値（最終書込日）を突き合わせる。7日/30日以内の利用者数の集計も出る。
- `report-journal-days.mjs`：`JOURNAL#` の `createdAt` を日別に数え、初回記帳日・最終記帳日・何日記帳が続いたか・初日に集中していないかを見る。

両方とも **sub の先頭8桁のみ表示**（メールアドレス等のPIIは扱わない）。E2E暗号化ユーザーは仕訳が `ENCDATA` の1ブロブなので `report-journal-days.mjs` には現れず、末尾に別掲される。

## 使うとき

- 「最終ログイン」はCognito標準APIでは取れない（`UserLastModifiedDate`は登録時刻のまま変わらず、ログインでは更新されない）。PROFILE.lastSeenがその代わり。
- CloudFrontログ・自前ビーコン集計（`scripts/admin` の管理ダッシュボード、localhost:8787）は匿名の訪問者単位の集計で、**個人（登録ユーザー）単位の利用状況はこの2本でしか出ない**。「アクティブユーザー」「最終ログイン」「記帳が続いている人」と言われたら、まずこちらを使う。
- 本番DynamoDBへの直接アクセスだが、読み取り専用のscan（`report-users.mjs`は `PK,SK,updatedAt,lastSeen` のみ、`report-journal-days.mjs`は `PK,SK,createdAt` のみ projection）で、金額や仕訳内容は一切読まない。確認なしで実行してよい。
