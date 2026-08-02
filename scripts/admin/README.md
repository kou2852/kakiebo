# ローカル管理者ダッシュボード

CloudFront(app)のアクセスログから、いつも確認している数字だけをローカル画面で見るツール。
**localhost限定**（127.0.0.1でのみ待受）。数字のみを表示し、解釈・アドバイスはしない方針。

## 使い方

```bash
# 1. AWS未認証なら先にログイン
aws sso login --profile kakeibo-prod

# 2. 起動
node scripts/admin/server.mjs

# 3. ブラウザで開く
#    http://localhost:8787
```

- ヘッダーの「期間」で 7/14/30/90日 を切替、「更新」で最新ログを再取得。
- 初回や長期間は S3 同期に少し時間がかかる（2回目以降は増分同期で高速）。

## 表示内容（= いつもログで確認していること）

- 人間の訪問（オープン）と実人数（distinct IP）／ボット・self の除外内訳
- 日別オープン（人間 / bot / self）
- 媒体別流入（utm_source、無印=X想定）と実人数
- 自前イベント `/_e/*`（guest_start, journal_added 等）合計・日別、アクティベーション（記帳/ゲスト開始）
- 参照元 上位、ボットUA 上位

集計ロジックは `docs/design-gen/analyze-cflogs.mjs` と同一。

## メモ

- ログバケット: `kakeibo-cf-logs-117953360790` / プレフィックス `app/`
- 取得したログは `scripts/admin/.cache-cflogs/` にキャッシュ（増分同期用）
- 環境変数: `PORT`（既定8787）, `AWS_PROFILE`（既定 kakeibo-prod）
- 自分IP判定（self）は selftest クエリ送信IP + 既知プレフィックス。プレフィックスは変動するため `server.mjs` の `SELF_PREFIXES` を随時確認。
