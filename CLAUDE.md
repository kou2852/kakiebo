# CLAUDE.md — 複式家計簿 SaaS

## プロジェクト概要

複式簿記ベースの個人向け家計簿SaaS。元は単一HTMLファイル(`kakeibo.html`)で動作するローカルアプリだったものを、React + AWS構成のSaaSに移行中。

**リポジトリ構成:**
- `kakeibo.html` — 本番稼働中の単一HTMLアプリ（localStorage使用、981行）
- `frontend/` — React + Vite SPA（移行先、開発モードで動作確認済み）
- `backend/` — AWS SAM（Lambda + DynamoDB + Cognito、**dev ステージにデプロイ済み**。スタック名 `kakeibo-saas` / リージョン `ap-northeast-1`）
- `lp/` — ランディングページ（静的HTML、SEO/OGP/JSON-LD対応）
- `docs/` — 設計書・戦略書

## 現在の状況

### 動作するもの
- `kakeibo.html` をブラウザで開けば全機能が使える（localStorageキー: `kk4`）
- React版は `cd frontend && npm install && npm run dev` で開発モードが起動する（Cognito未設定時はlocalStorageフォールバック）
- AWSバックエンド（dev ステージ）はデプロイ済みで稼働中。`frontend/.env.local` に接続情報が設定済みのため、API モードで本番 DynamoDB/Cognito に接続できる
- React版の残モーダル（SplitModal / WalletModal / PresetModal / CSVModal）実装済み
- キャッシュフロー計算書（簡易直接法）実装済み（`Reports/CFPage.jsx`）
- LP（`lp/index.html`）＋利用規約・プライバシーポリシー（`lp/terms.html` / `lp/privacy.html`、雛形）

### 未完了
- フロント/LP のホスティング基盤（S3 + CloudFront）は SAM テンプレート未定義（手動 or IaC 化が必要）
- 独自ドメイン + SSL（Route 53 + ACM）
- Stripe課金
- セキュリティ修正（テナント分離・入力検証・CORS制限）をコードに反映済み。**再デプロイで本番適用が必要**

## 開発ルール

### コードスタイル
- `kakeibo.html`: 変数名は短縮形（`S`=state, `sv`=save, `rp`=renderPage, `fa`=formatAmount）
- React版: 標準的なReact慣習。コンポーネントはPascalCase、フックはcamelCase
- CSSはCSS変数ベース（`--bg0`, `--tx`, `--ac`等）。テーマ切替はdata-theme属性

### 修正時の注意
- **余分なdiffを出さない。** 修正不要の部分を触らない
- `kakeibo.html` は本番稼働中。壊すと全データにアクセスできなくなる
- localStorageのキーは `kk4`。データ構造を変える場合はマイグレーションが必要

### テスト方法
- `kakeibo.html` をブラウザで開いて手動確認
- React版: `npm run dev` → localhost:3000

## 外部連携の方針

**外部APIとの連携は原則行わない。** OCR（Textract）、銀行API、プッシュ通知サービス等は使わない。家計データ処理はすべてクライアントサイドまたは自前のAWSリソースで完結させる。

**例外（明示判断済み）:**
- **Google ログイン**（Cognito + Google IdP / OAuth）: ユーザー認証のみ。`auth/oauth.js`、backend の Google IdP。
- **Google AdSense**（広告配信）: ティア別インライン広告（`Common/AdBanner.jsx` を `Common/Ad.jsx` で遅延ロード。配置とゲスト上限は `config/tiers.js` の `AD_CONFIG` / `GUEST_LIMITS`）。ゲスト=多め・Free=同配置で頻度低・Pro/Family=なし。env（`VITE_ADSENSE_CLIENT`/`VITE_ADSENSE_SLOT`）未設定なら非表示、広告ブロック時は枠を畳む。全画面インタースティシャルは AdSense ポリシー上使わずインライン差込で代替。**家計データは広告事業者へ渡さない**。プライバシーポリシー（`lp/privacy.html` 第7項）に第三者Cookie/オプトアウトを記載済み。（旧 `Common/DailyAd.jsx` は削除済み）
- いずれも**家計データそのものを外部送信しない**点は維持する。

## 主要ファイルの役割

### kakeibo.html（単一HTMLアプリ）
| セクション | 行番号（目安） | 内容 |
|---|---|---|
| CSS | 1-87 | テーマ変数、レイアウト、コンポーネントスタイル |
| HTML構造 | 88-265 | サイドバー、9ページ、11モーダル |
| JS: データ層 | 266-300 | State(`S`), デフォルト科目(`DA`), load/save |
| JS: ユーティリティ | 300-350 | `fa()`, `esc()`, `uid()`, `calcBal()`, `acBal()` |
| JS: チャート | 350-400 | `drawPie()`, `rDashTrend()`, ツールチップ |
| JS: ページ描画 | 400-600 | `rDash()`, `rJ()`, `rL()`, `rBS()`, `rPL()`, `rAc()`, `rTg()`, `rCal()`, `rRec()` |
| JS: CSV取込 | 616-660 | `procCsv()`, `parseCT()`, `csvEx()`, 重複検知 |
| JS: プリセット | 661-700 | `openPE()`, `savePE()`, `applyPreset()` |
| JS: 予算・トレンド | 700-750 | `rDashBudget()`, `rDashTrend()` |
| JS: カレンダー・定期 | 750-830 | `rCal()`, `rRec()`, `genOneRec()`, `genAllRec()` |
| JS: クイック入力 | 930-976 | `qeParse()`, `qeSubmit()`, `qePreview()` |
| JS: 初期化 | 978 | `ld(); ldTheme(); autoGenOnLoad(); nav('dashboard');` |

### React版 (frontend/)
| ファイル | 役割 |
|---|---|
| `src/contexts/AuthContext.jsx` | Cognito認証。未設定時はdevModeで認証スキップ |
| `src/contexts/DataContext.jsx` | 全データ管理。API or localStorage自動切替 |
| `src/api/client.js` | APIクライアント。認証トークン自動付与 |
| `src/utils/bookkeeping.js` | 残高計算、期間フィルタ、月次推移 |
| `src/utils/format.js` | `fa()`, `esc()`, 定数定義 |
| `src/components/Dashboard/` | ダッシュボード + PieChart + TrendChart + PeriodBar |
| `src/components/Journal/` | 仕訳入力 + JournalModal |
| `src/components/Ledger/` | 仕訳帳 |
| `src/components/Reports/` | BS + PL |
| `src/components/Accounts/` | 科目管理 + AccountModal + RuleModal |
| `src/components/Tags/` | タグ管理 + TagModal |
| `src/components/Calendar/` | カレンダー |
| `src/components/Recurring/` | 定期取引 + RecurringModal |
| `src/components/Settings/` | BudgetModal |
| `src/components/Common/` | Modal, Toast, ErrorBoundary |

### バックエンド (backend/)
| ファイル | 役割 |
|---|---|
| `template.yaml` | SAMテンプレート。Cognito, API Gateway, Lambda, DynamoDB |
| `src/lib/db.js` | DynamoDBシングルテーブルヘルパー |
| `src/middleware/apiHelper.js` | レスポンスヘルパー、JWT userId抽出 |
| `src/handlers/journals.js` | 仕訳CRUD。借貸一致検証付き |
| `src/handlers/accounts.js` | 勘定科目CRUD |
| `src/handlers/settings.js` | タグ/口座/予算/エクスポート/インポート |
| `src/handlers/postConfirm.js` | 新規ユーザー登録時にデフォルト26科目を投入 |

## データ構造

### localStorage（kk4キー）
```json
{
  "accounts": [{ "id": "a01", "code": "1001", "name": "現金", "type": "asset", "sys": 1 }],
  "journals": [{ "id": "xxx", "date": "2025-01-15", "desc": "コンビニ",
    "lines": [
      { "accountId": "e01", "side": "dr", "amount": 580, "taxRate": 0 },
      { "accountId": "a01", "side": "cr", "amount": 580, "taxRate": 0 }
    ]}],
  "tags": [{ "id": "t1", "name": "生活費", "color": "#6090d8" }],
  "wallets": [{ "id": "w1", "name": "日常口座", "accountId": "a02" }],
  "budgets": [{ "accountId": "e01", "amount": 50000 }],
  "presets": [{ "id": "p1", "walletId": "w1", "type": "out", "name": "食費(現金)", "lines": [...] }],
  "recurring": [{ "id": "r1", "name": "家賃", "frequency": "monthly", "day": 27, "nextDate": "2025-02-27", "lines": [...] }],
  "rules": [{ "id": "rl1", "keyword": "コンビニ", "drAccountId": "e01", "crAccountId": "a01" }],
  "allocs": [{ "accountId": "a02", "tagId": "t1", "amount": 100000 }]
}
```

### DynamoDB（シングルテーブル設計）
- PK: `USER#<userId>`, SK: `JOURNAL#<id>` / `ACCOUNT#<id>` / `TAG#<id>` 等
- GSI1: PK同じ, GSI1SK=date（仕訳の日付検索用）
- 詳細: `docs/DATA_MODEL.md`

## 機能バックログ

詳細は `docs/BACKLOG.md` を参照。優先度順:

1. React版の残モーダル実装（SplitModal, WalletModal, PresetModal, CSVModal）
2. AWSバックエンドデプロイ＆E2E接続確認
3. ランディングページ＋SEO基盤
4. AI支出分析（クライアントサイドのみ、外部API不使用）
5. キャッシュフロー計算書
6. 確定申告サポート（医療費控除・ふるさと納税の集計）
7. 予算vs実績ダッシュボード強化
8. 資産推移グラフ
9. PWA対応（オフライン＋同期）
10. 家族アカウント＋権限管理
11. Stripe課金
