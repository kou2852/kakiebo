# iPhoneアプリ公開日（2026-09-25）の手順

公開日の変更は、ブランチ `ios-launch` の1コミットにまとめてある。公開前に誤って配らないよう、
作業ブランチ（`feat/mobile-app`）には入れていない。

## 1. 公開を機械で確かめる

```
node scripts/check-ios-live.mjs
```

- 通れば（exit 0）先へ進む。止まったら待つ。目視で「出ている」と判断しない
- 予約注文の受付中も Lookup は1件返す（2026-09-19 に確認）。判定は**製品ページの
  「予約注文」の印**（`"expectedReleaseDate"` の値）が消えたかで行う
- **配信開始は 2026-09-25 6:00 JST**（App Store Connect の設定を 2026-09-21 に確認。
  「App Review完了後、2026年9月25日 6:00 JST 以降に自動でリリース」＝ 2026-09-24 21:00 GMT）
- ⚠ Lookup の `releaseDate`（2026-09-25T07:00:00Z）を公開時刻と読まないこと。あれは日付だけの
  値で、時刻は米国太平洋時間の0時に揃えられているだけ。上の設定とは10時間ずれる
- ⚠ このあとの公開用スクリプトは、判定が通らないと止まる作り。ただし**止まることを確かめる
  目的でも、許可なしに実行しない**（2026-09-19 に、予約中の Lookup の変化でガードを素通りした）

## 2. 公開日の変更を作業ブランチに取り込む

```
git cherry-pick <ios-launch のコミット>
```

変わるファイル:
- `frontend/src/config/release.js` … `live: true` / `date: '2026-09-25'` / `preorder: false`
- `frontend/index.html` … Smart App Banner
- `lp/index.html` … #ios の節・FAQ（表示と JSON-LD）・Smart App Banner
- 公開用スクリプト2本と、この手順書

## 3. 本番へ反映（毎回許可を取る）

```
bash lp/deploy-ios-launch.sh
bash frontend/deploy-ios-launch.sh
```

どちらも最初に `check-ios-live.mjs` を通し、公開前の文言が残っていれば止まる。

## 4. 確かめる

- LP: 「App Store で配信中」とダウンロードのバッジ。予約注文の文言が無いこと
- Web: 更新情報の先頭が「iPhoneアプリを公開しました」
- iPhone の Safari で kurofukubo.com を開き、上部に App Store の案内（Smart App Banner）が出ること

## 5. 告知

X の公開日の投稿（`docs/promo/x/a-hero-0925.png`）。
