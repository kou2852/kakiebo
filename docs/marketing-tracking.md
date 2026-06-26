# マーケ計測のURL規約（流入計測 ＆ 自己除外）

プロモリンクに付けるパラメータの早見表。**媒体別の流入計測**と**自分の利用を除外**するための合言葉をまとめる。

---

## ① 媒体別の流入計測：`utm_source`

GA4は独自の `?ref=` は無視する。**`utm_source`（UTMパラメータ）**を付けるとGA4が「参照元」として自動記録し、媒体別に分かれる。
※ アプリ宛リンクにも同じ `utm_source` を付けておくと、CloudFrontアクセスログ解析でも「媒体別のゲスト流入」を集計できる。

| 媒体 | パラメータ |
|---|---|
| X | `utm_source=x&utm_medium=social` |
| Zenn | `utm_source=zenn&utm_medium=article` |
| note | `utm_source=note&utm_medium=article` |
| Qiita | `utm_source=qiita&utm_medium=article` |

### そのまま貼れるURL

**LP（kurofukubo.com）宛**
```
X     : https://kurofukubo.com/?utm_source=x&utm_medium=social
Zenn  : https://kurofukubo.com/?utm_source=zenn&utm_medium=article
note  : https://kurofukubo.com/?utm_source=note&utm_medium=article
Qiita : https://kurofukubo.com/?utm_source=qiita&utm_medium=article
```

**アプリ（app.kurofukubo.com・ゲスト）宛**
```
X     : https://app.kurofukubo.com/?guest&utm_source=x&utm_medium=social
Zenn  : https://app.kurofukubo.com/?guest&utm_source=zenn&utm_medium=article
note  : https://app.kurofukubo.com/?guest&utm_source=note&utm_medium=article
Qiita : https://app.kurofukubo.com/?guest&utm_source=qiita&utm_medium=article
```

### 見方
- **LP（GA4）**：レポート → 集客 → **トラフィック獲得** → ディメンションを **「セッションの参照元」**（または 参照元/メディア）に → x / zenn / note / qiita が並ぶ。リアルタイムでも参照元別に見える。探索(Exploration)で `utm_source` 別表も作成可。
- **アプリ（CloudFrontログ）**：`utm_source` がクエリに残るので、ログ解析で媒体別に集計（依頼があれば実施）。

---

## ② 自分の利用を除外：`?selftest=1`

自分のアクセスを**全アナリティクスから外す**ための合言葉。実ユーザーには無影響。

| | URL | 効果 |
|---|---|---|
| LP | `https://kurofukubo.com/?selftest=1` | そのブラウザで**GA4を読み込まない**（localStorageに記録・永続）。解除は `?selftest=0` |
| アプリ | `https://app.kurofukubo.com/?selftest=1` | CloudFrontログ解析時に**そのアクセス＋同一IPを除外** |

- **使う各ブラウザ／端末で一度ずつ** `?selftest=1` を開く（LPはlocalStorage保存なので以降は自動で除外）。
- ブラウザのデータ消去・シークレットウィンドウではフラグも消えるので、その時は再度 `?selftest=1`。
- 本番アプリを動作確認するときは `?selftest=1` 付き（`?guest&selftest=1` でも可）で開く。
- ※ 計測したいのは「他人の流入」なので、**自分のテストは utm ではなく selftest を使う**（utmを付けるとその媒体の数字に自分が混ざる）。

---

## ③ Xの既存投稿は「無印」＝Xとみなす

X投稿は**公開済み・編集不可**で、リンクにutmが付いていない（無印）。そのため**ログ解析では「utmなしの“人間opens”」をXとみなす**。
- 集計は必ず **opens限定（uri=`/` or `/index.html`）＋ボット除外（UAに `bot/spider/crawl/Ruby/preview` 等）＋自分の除外**で行う（生のリクエスト総数はアセット・ボットだらけで無意味）。
- **自分の除外は「IP（IPv6は /64 プレフィックス）」単位で行う**：記事リンク（utm付き/無印）には `?selftest=1` が付かないため、**自分が記事リンクを誤クリックすると“実流入”として混入する**。対策＝「`?selftest=1` を一度でも送ったIP＝自分」とみなし、**そのIP/プレフィックスの全リクエストを除外**（selftestパラメータだけの除外では漏れる）。LP(GA4)はlocalStorageフラグで安全。
- 「無印」には直接アクセス/ブックマークも混じるが、Xが唯一の“無印プロモ経路”のため近似として扱う。t.co/Xアプリは参照元が落ちる（direct/none）点も整合的。
- 今後のX投稿で計測を厳密にしたい場合のみ、新規投稿に `utm_source=x&utm_medium=social` を付ける。

## メモ
- `utm_source` と `?selftest=1` は併用可（例：自分がXリンクを検証するなら `?utm_source=x&...&selftest=1`）。ただし基本は「他人向け＝utm」「自分用＝selftest」で使い分け。
- 各記事・投稿のドラフトのリンクは **すべて `utm_source=` 済み**（`docs/qiita-article-*.md` / `zenn-article-*.md` / `note-article.md` / `x-posts.md`）。
- 実装の所在：LP自己除外＝`lp/analytics.js`（`kk_noanalytics`）。アプリ計測＝CloudFrontアクセスログ（bucket `kakeibo-cf-logs-117953360790`/prefix `app/`）。
