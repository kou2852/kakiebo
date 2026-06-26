# 基本設計書 — 複式家計簿 SaaS（kurofukubo）

| 項目 | 内容 |
|---|---|
| システム名 | 複式家計簿 SaaS（kurofukubo.com） |
| 文書種別 | 基本設計書 |
| 対象環境 | prod（本番）/ dev（開発） |
| 最終更新 | 2026-06-11 |

## 1. 目的・コンセプト

複式簿記をベースにした個人向け家計簿 SaaS。一般的な家計簿（単式）と異なり、
**貸借対照表(BS)・損益計算書(PL)・キャッシュフロー計算書(CF)** を個人で作成できる点が差別化要素。

- ターゲット: FIRE・資産形成層 / 副業・フリーランス / 簿記学習者
- 提供価値: 「純資産の推移が見える」「確定申告の経費が集計できる」「使いながら簿記を学べる」

## 2. システム化の範囲

| 区分 | 範囲 |
|---|---|
| 対象 | 仕訳入力、勘定科目・口座・タグ管理、財務諸表(BS/PL/CF)、予算、定期取引、CSV取込、データ移行 |
| 利用者 | エンドユーザー（登録個人）。管理操作は当面AWSコンソールで代替し、専用管理画面は作らない |
| 対象外 | 銀行API連携、レシートOCR、外部送金。**外部APIとは連携しない**（自前AWSリソースで完結） |

## 3. 機能一覧

| 画面/機能 | 概要 |
|---|---|
| ダッシュボード | KPI、円グラフ（費用内訳）、月次推移、予算進捗 |
| 仕訳入力 | 借方/貸方の複式入力、クイック入力（ワンライン）、プリセット |
| 仕訳帳 | 仕訳の一覧・編集・削除 |
| 貸借対照表(BS) | 資産=負債+純資産（累計残高） |
| 損益計算書(PL) | 収益-費用（期間損益） |
| キャッシュフロー計算書(CF) | 営業/投資/財務の3区分（簡易直接法） |
| 勘定科目・口座 | 科目CRUD、口座、プリセット、自動分類ルール |
| タグ・配分 | タグCRUD、勘定への配分 |
| カレンダー | 日次の取引表示 |
| 定期取引 | 月次/週次/年次の自動生成 |
| バックアップ/移行 | 全データのJSONエクスポート/インポート（旧HTML版からの移行） |
| 認証 | サインアップ（メール確認コード）/ ログイン（将来: Googleログイン） |

## 4. 非機能要件

| 区分 | 方針 |
|---|---|
| 性能 | 個人利用想定。サーバーレス自動スケール。仕訳1000件規模をクライアント計算 |
| 可用性 | マネージドサービス(API GW/Lambda/DynamoDB)に委譲。SLA はAWS依存 |
| 拡張性 | DynamoDB PAY_PER_REQUEST、Lambda 同時実行で自動スケール |
| セキュリティ | Cognito認証 + JWT、DynamoDB PKによるテナント分離、最小権限IAM、保存時暗号化、CORS制限 |
| バックアップ | DynamoDB Point-in-Time Recovery 有効。ユーザー側はJSONエクスポート常時可能 |
| コスト | 1,000ユーザー想定で月¥1,500前後（詳細は `STRATEGY.md`） |
| 監視 | CloudWatch アラート（Lambdaエラー / API 5xx / DynamoDBスロットリング）→ SNSメール通知 |

## 5. システム構成（論理）

```
ユーザー（ブラウザ）
  │  HTTPS
  ├─ app.kurofukubo.com ──→ CloudFront ──→ S3（React SPA, 非公開/OAC）
  │
  └─ APIコール（JWT付き）──→ API Gateway(REST)
                                 ├─ Cognito Authorizer（JWT検証）
                                 └─ Lambda(Node.js 20, arm64)
                                       └─ DynamoDB（シングルテーブル）
監視: CloudWatch Alarms ──→ SNS ──→ メール通知
```

詳細な構成図は `docs/architecture.drawio`（draw.io で開く）を参照。

## 6. AWSアカウント構成（環境分離）

AWS Organizations による物理分離。root常用は廃止し IAM Identity Center(SSO) でアクセス。

| アカウント | ID | 用途 |
|---|---|---|
| 管理 | 885418708508 | Organizations / 請求 / Identity Center のみ |
| dev | 296391867332 | 開発（スタック `kakeibo-saas-dev`） |
| prod | 117953360790 | 本番（`kakeibo-saas-prod`、`kakeibo-web-prod`、ドメイン、証明書） |

## 7. 技術スタック

| レイヤ | 技術 |
|---|---|
| フロント | React 18 + Vite 5、CSS変数によるテーマ |
| 認証SDK | amazon-cognito-identity-js（将来 OAuth へ移行予定） |
| ホスティング | S3（非公開）+ CloudFront（OAC, SPAフォールバック）+ ACM + Route53 |
| API | API Gateway(REST) + Cognito Authorizer |
| 実行基盤 | AWS Lambda（Node.js 20, ESM, arm64） |
| データ | DynamoDB（シングルテーブル, GSI1, PITR） |
| IaC | AWS SAM（backend）、CloudFormation（hosting） |
| 監視 | CloudWatch Alarms + SNS |

## 8. 環境・ドメイン

| 環境 | アプリURL | API | CORS許可オリジン |
|---|---|---|---|
| prod | https://app.kurofukubo.com | https://ecbjdndcbe.execute-api.ap-northeast-1.amazonaws.com/prod | https://app.kurofukubo.com |
| dev | ローカル（`npm run dev`） | https://9be6dndzzi.execute-api.ap-northeast-1.amazonaws.com/dev | http://localhost:3000 |

リージョン: ap-northeast-1（ACM証明書のみ us-east-1）。

## 9. データ概要

DynamoDB シングルテーブル。PK=`USER#<userId>` でユーザーを物理分離し、SK種別でエンティティを区別。
GSI1 で仕訳の日付範囲検索。詳細は `DATA_MODEL.md` / `DETAILED_DESIGN.md`。

## 10. 関連文書

- 詳細設計: `docs/DETAILED_DESIGN.md`
- API仕様: `docs/API_SPEC.md`
- データモデル: `docs/DATA_MODEL.md`
- インフラ手順: `docs/INFRA_SETUP.md` / `docs/DOMAIN_SETUP.md`
- 事業戦略: `docs/STRATEGY.md`
- 構成図: `docs/architecture.drawio`
