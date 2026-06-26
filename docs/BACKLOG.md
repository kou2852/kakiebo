# 機能バックログ

## 凡例
- 🔴 高: SaaS公開に必須
- 🟡 中: 差別化・収益に直結
- 🟢 低: あると良い

## Step 1: 摩擦を減らす（継続率向上）

### ✅ 完了済み
- [x] クイック入力モード（ワンライン入力 → 自動仕訳生成）
- [x] 予算vs実績 改善（残日数・日あたり予算・超過警告）
- [x] 定期取引の自動実行バナー（取消ボタン付き）
- [x] CSV取込（重複検知・ルール自動適用）
- [x] 自動分類ルール学習（3回以上同じパターンで提案）

### 未着手
- [ ] 🟡 プリセットのワンタップ記帳（口座画面からプリセット選択→確認なしで即記帳）
- [ ] 🟢 入力履歴からのサジェスト強化（摘要だけでなく金額パターンも学習）

## Step 2: 「見える」を強化する（利用価値向上）

### 完了済み
- [x] 🔴 キャッシュフロー計算書（営業/投資/財務の3区分。簡易直接法。`Reports/CFPage.jsx`）

### 未着手
- [ ] 🟡 AI支出分析（クライアントサイドのみ。前月比・カテゴリ別異常検知・傾向コメント生成）
  - 実装方針: 統計ベース（標準偏差で異常検知）。LLM不使用
  - 表示場所: ダッシュボードのKPI下に「インサイト」カード追加
- [ ] 🟡 確定申告サポート（医療費控除・ふるさと納税・iDeCo等の対象経費自動集計）
  - 科目にタグ付け（「確定申告:医療費控除」等）で対象を識別
  - レポート画面に「確定申告」タブ追加
- [ ] 🟡 資産推移グラフ（純資産の月次推移を折れ線で可視化。目標線設定可）
- [ ] 🟢 科目別明細レポート（特定科目の全仕訳を時系列で一覧）

## Step 3: 生活に溶け込む（利用頻度向上）

### 未着手
- [ ] 🔴 PWA対応
  - Service Worker でオフラインキャッシュ
  - IndexedDB にオフライン仕訳を蓄積
  - オンライン復帰時にAPIと同期（コンフリクト解決: last-write-wins）
  - manifest.json でホーム画面追加対応
- [ ] 🔴 モバイル最適化
  - スワイプでカテゴリ選択するクイック入力UI
  - ボトムシートモーダル（モバイルでのモーダルは上から出すより下から出す方が親指が届く）
  - フローティング「+」ボタン（右下固定）

## Step 4: 世帯で使う（単価向上）

### 未着手
- [ ] 🟡 家族アカウント
  - 招待メールでメンバー追加
  - 「個人」と「共通」の帳簿を分離
  - DynamoDB: `PK=FAMILY#<familyId>` で共通データを管理
- [ ] 🟡 権限管理（閲覧のみ / 入力可 / 管理者）
- [ ] 🟢 投資ポートフォリオ（銘柄と数量を手入力。時価は手動更新）
- [ ] 🟢 複数通貨対応（為替レート手動入力。自動取得はしない）

## インフラ・運用

### 完了済み
- [x] 🔴 AWSバックエンドデプロイ（dev ステージ。スタック `kakeibo-saas` / `ap-northeast-1`）
- [x] 🔴 ランディングページ作成（`lp/index.html` + 利用規約・プライバシーポリシー雛形）

### 完了済み（インフラ追記）
- [x] 🔴 マルチアカウント分離（Organizations: dev=296391867332 / prod=117953360790、root脱却・SSO化）。手順は `docs/INFRA_SETUP.md`
- [x] 🔴 セキュリティ修正の本番反映（再デプロイ）＋ 本番ステージ(prod)デプロイ。dev/prod 両アカウントに `Stage` 別スタックでデプロイ済み
- [x] 🔴 フロント/LP ホスティング（S3 + CloudFront、OAC・SPAフォールバック）。prod: `kakeibo-web-prod` / `https://d2vxkqrh04ac1u.cloudfront.net`
- [x] 🟡 CloudWatch アラート（Lambda エラー率 / API 5xx / DynamoDB スロットリング）→ SNS `kakeibo-alarms-prod`。通知メールは要確認クリック
- [x] 🔴 CORS恒久対策：ゲートウェイMOCK廃止→各LambdaでOPTIONSを `ALLOWED_ORIGIN` から返す設計に変更（AllowedOrigin変更が `sam deploy` だけで反映される）
- [x] 🔴 移行導線：React版にバックアップ/移行UI（`Settings/SettingsPage.jsx`）を追加。旧HTML版エクスポートJSON → `/api/import` で取り込み可能に
- [x] 🔴 独自ドメイン + SSL：`kurofukubo.com` 取得（Route53）。`app.kurofukubo.com` → CloudFront、ACM(us-east-1)証明書発行・適用。CORSも新ドメインに更新済み。手順は `docs/DOMAIN_SETUP.md`
- [x] 🟡 SES メール送信：ドメインID `kurofukubo.com`（Easy DKIM検証済み）→ Cognito を SES送信(`no-reply@kurofukubo.com`, prodのみ)に切替。本番アクセス申請は **PENDING（AWS審査中、〜24h）**。承認まではサンドボックス（検証済み宛先のみ送信可）

### 未着手
- [ ] 🔴 フロント/LP ホスティング（S3 + CloudFront）の IaC 化
  - 静的HTML（Astro or 素のHTML）
  - ヒーロー + 機能紹介 + スクリーンショット + 料金 + CTA
  - OGP画像、meta description、JSON-LD構造化データ
  - sitemap.xml, robots.txt
- [ ] 🔴 利用規約・プライバシーポリシー
- [ ] 🔴 独自ドメイン + SSL（Route 53 + ACM + CloudFront）
- [ ] 🟡 Stripe Checkout連携（月額課金）
  - 料金案: Free=月30仕訳 / Pro=¥500/月 / Family=¥800/月
  - Lambda Webhook でプラン情報をDynamoDBに保存
  - フロントで残仕訳数チェック→アップグレード誘導
- [ ] 🟡 CloudWatch アラート（Lambda エラー率、API 5xx、DynamoDB スロットリング）
- [ ] 🟢 ブログ（技術記事でSEO種まき。「個人開発で複式簿記SaaSを作った話」等）

## React版の残モーダル

### 完了済み
- [x] 🔴 SplitModal（仕訳行のタグ分割。JournalModalの🏷ボタンから呼び出し）
- [x] 🔴 WalletModal（口座の追加・編集。AccountsPageの「＋口座」ボタンから呼び出し）
- [x] 🟡 PresetModal（プリセット編集。AccountsPageの口座一覧内から呼び出し）
- [x] 🟡 CSVModal（CSV取込。kakeibo.htmlの既存ロジックをReact化。`utils/csv.js`に純粋関数を分離）

## 技術的改善

### 未着手
- [ ] 🟡 a11y改善（ARIA属性、キーボードナビゲーション、フォーカストラップ）
- [ ] 🟡 パフォーマンス（仕訳1000件超でのcalcBal最適化。月次サマリーキャッシュ）
- [ ] 🟢 E2Eテスト（Playwright）
- [ ] 🟢 ユニットテスト（bookkeeping.js, format.js）
