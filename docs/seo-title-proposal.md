# kurofukubo.com SEO title・meta description再設計提案

作成日: 2026-08-01  
対象: `lp/guide-furusato.html`、`lp/guide-net-worth.html`、`lp/guide-start.html`、`lp/guides.html`、`lp/guide-networth-trend.html`、`lp/guide-privacy.html`  
参照（変更しない）: `lp/index.html`

## 結論

6ページのtitleとdescriptionを次の案へ変更する。文字数は空白・句読点・記号・半角英数字も1字として、Unicodeコードポイント単位で実測した。全titleを30〜32字に収め、検索語と本文にある答えを前半から配置する。

| ページ | 新title | 実測 | 新description実測 |
|---|---|---:|---:|
| `guide-furusato.html` | `ふるさと納税の家計簿｜項目・何費・つけ方は2,000円と立替金` | 31字 | 119字 |
| `guide-net-worth.html` | `家計純資産とは？資産－負債の計算と増えない3つの原因・増やし方` | 31字 | 113字 |
| `guide-start.html` | `複式家計簿の使い方・始め方｜口座登録から最初の記帳まで3ステップ` | 32字 | 111字 |
| `guides.html` | `複式簿記の家計簿ガイド19記事｜始め方・仕訳・純資産から探す` | 30字 | 114字 |
| `guide-networth-trend.html` | `純資産推移グラフの作り方｜Excelは手動作成・家計簿は自動作成` | 32字 | 115字 |
| `guide-privacy.html` | `家計簿データは誰が見られる？E2E暗号化なら運営者も読めない` | 30字 | 113字 |

ブランド接尾辞 `| kurofukubo` は、非指名検索を主対象とする上記6ページでは外し、限られた表示幅を検索語と答えへ使う。Googleによるtitle書き換えや端末別のピクセル幅は文字数とは別要因であり、30〜32字でも表示は保証されない。

## 1. `lp/guide-furusato.html`

### 狙うクエリと現状

| クエリ | 表示 | 平均順位 | CTR |
|---|---:|---:|---:|
| ふるさと納税 家計簿 項目 | 46 | 5.39位 | 0% |
| ふるさと納税 家計簿 つけ方 | 15 | 6.80位 | 0% |
| ふるさと納税 家計簿 | 14 | 8.93位 | 0% |
| 家計簿 ふるさと納税 何費 | 7 | 8.00位 | 0% |
| ふるさと納税 勘定科目 | 2 | 54.50位 | 0% |

ページ実績はクリック5、表示211、CTR 2.37%、平均7.59位。表示46回の「項目」に加え、すでに平均6.80位の「つけ方」を落とさないことを最優先とする。

### 提案

- 現行title: `ふるさと納税 家計簿のつけ方｜何費で記帳？ 勘定科目と控除の書き方 | kurofukubo`
- 新title（31字）: `ふるさと納税の家計簿｜項目・何費・つけ方は2,000円と立替金`
- 新description（119字）: `ふるさと納税は家計簿で何費？自己負担2,000円は支出、残りは立替金（資産）にするつけ方を紹介。3万円寄附時の仕訳、全額を支出にするシンプル法との違い、返礼品の扱い、ワンストップ特例・確定申告後の控除反映と立替金の取り崩しまで解説します。`

### 判断理由と本文根拠

- titleは「ふるさと納税」「家計簿」「項目」「何費」「つけ方」の5語をすべて文字列として保持する。ページ1にいる実クエリの語を同義語へ置き換えない。
- 31字内で、本文の結論「自己負担2,000円」と「残りは立替金」を `2,000円と立替金` として予告できたため、語を切る優先順位トレードオフは発生していない。「自己負担」はdescriptionで明示する。
- 本文は、自己負担2,000円だけを支出、3万円寄附なら残り28,000円を立替金（資産）とする例を掲載している。
- 本文は全額を支出にする「シンプル法」と、2,000円以外を立替金にする「立替法」を比較し、返礼品は基本的に記帳不要、翌年は控除に応じて立替金を取り崩すと説明している。

## 2. `lp/guide-net-worth.html`

### 狙うクエリと現状

主対象は実クエリ「家計純資産とは」（表示22、平均6.41位、CTR 0%）。ページ実績はクリック1、表示44、CTR 2.27%、平均9.02位。「純資産 いくらあれば」（表示4、平均28.50位）は専用記事の意図なので、このページでは狙わない。

### 提案

- 現行title: `家計の「純資産」とは？ いちばん大事な数字の見方と増やし方 | kurofukubo`
- 新title（31字）: `家計純資産とは？資産－負債の計算と増えない3つの原因・増やし方`
- 新description（113字）: `家計純資産とは、預金などの資産からカード未払い・ローンなどの負債を引いた正味の財産です。預金300万円、未払い30万円なら270万円。収支だけでは見えない家計の変化、純資産が増えない3つの原因と、着実に増やすコツを解説します。`

### 判断理由と本文根拠

- 実クエリ「家計純資産とは」をtitle冒頭で完全一致させる。
- 前案の23字から31字へ広げ、空いていた表示幅に本文に実在する「増えない3つの原因」を追加した。計算式だけでなく、原因診断と改善まで読める価値を示す。
- 本文に「純資産＝資産－負債」、預金300万円－カード未払い30万円＝270万円の例がある。
- 本文の3原因は、収入を超える支出、負債の見落とし、資産の目減り。増やすコツとして毎月追う、負債を可視化する、支出を増やしすぎない、の3点がある。

## 3. `lp/guide-start.html`

### 検索意図の修正

このページは「使い方・始め方」に限定する。前案で割り当てた次の実クエリは、特定機能の操作方法よりも家計簿アプリの比較・選択・利用を求める商品探索意図が強いため、`guide-start.html` の主対象から外す。

| トップページへ割り当てる実クエリ | 表示 | 平均順位 | CTR |
|---|---:|---:|---:|
| 家計簿 複式簿記アプリ | 3 | 1.33位 | 0% |
| 家計簿 複式簿記 アプリ | 1 | 2.00位 | 0% |
| 複式簿記 家計簿 アプリ | 1 | 3.00位 | 0% |

これらはプロダクトを提示して無料利用へ導く `lp/index.html` の役割とする。トップページ実績は表示18、平均4.33位、CTR 11.11%で、分析対象中唯一CTRが良い。したがってトップページの現行title `黒福簿（kurofukubo）— 複式簿記で純資産まで見える家計簿` は変更しない。良好なCTRを持つtitleを、表示5・CTR 0%のガイド側へ寄せて崩したり、guide側に「アプリ」商品探索語を強く持たせてカニバリゼーションを起こしたりしない。

クエリ別データとページ別データの直接対応表は提示されていないため、この割り当ては検索意図とページ内容に基づく役割設計であり、各クエリの現在のランディングページを断定するものではない。

### 提案

- 現行title: `はじめての複式家計簿 — 使い方ガイド | kurofukubo`
- 新title（32字）: `複式家計簿の使い方・始め方｜口座登録から最初の記帳まで3ステップ`
- 新description（111字）: `複式家計簿の使い方・始め方を3ステップで解説。口座登録、最初の記帳、ダッシュボード確認の順に進めます。クイック入力、かんたんモード、CSV取込、定期取引の使い方や、登録・メール入力なしでゲスト利用を始める方法も紹介します。`

### 判断理由と本文根拠

- title冒頭を「使い方・始め方」にし、商品探索語「アプリ」を外す。トップページとの役割を分ける。
- 本文は「登録から最初の記帳までを3ステップで紹介」し、口座登録、最初の取引、ダッシュボード確認の順で説明している。
- クイック入力、かんたんモード、CSV取込、定期取引、登録・メール入力なしのゲスト利用も本文に実在する。

## 4. `lp/guides.html`

### 狙うクエリと実数確認

主対象は情報収集意図の広い実クエリ「複式簿記 家計簿」（表示3、平均29.33位、CTR 0%）。ページ実績はクリック0、表示4、CTR 0%、平均7.25位。このページは個別の答えではなく、目的別に適切な答えの記事へ案内するハブとする。

`lp/guide-*.html` をディレクトリ上で実際に列挙した結果は19ファイル。`guides.html` 本文にも19記事が掲載され、JSON-LD `ItemList` もposition 1〜19を持つため、「19記事」を使用できる。確認したファイルは次のとおり。

`guide-bs-pl.html`、`guide-budget.html`、`guide-credit-card.html`、`guide-csv.html`、`guide-double-entry.html`、`guide-dual-income.html`、`guide-emergency-fund.html`、`guide-family-bs.html`、`guide-furusato.html`、`guide-medical-expense.html`、`guide-moneyforward.html`、`guide-net-worth.html`、`guide-networth-average.html`、`guide-networth-howmuch.html`、`guide-networth-investments.html`、`guide-networth-trend.html`、`guide-privacy.html`、`guide-savings-rate.html`、`guide-start.html`

### 提案

- 現行title: `ガイド・お役立ち記事 — kurofukubo（複式家計簿）`
- 新title（30字）: `複式簿記の家計簿ガイド19記事｜始め方・仕訳・純資産から探す`
- 新description（114字）: `複式簿記で家計を管理したい人向けのガイド全19記事。使い方・始め方、単式との違い、BS・PL、純資産、予算、カードやふるさと納税の仕訳、CSV取込、データ保護まで、目的や悩みから読む記事を選べます。初めての方は使い方ガイドから。`

### 判断理由と本文根拠

- 弱い「記事一覧」だけで終えず、検証済みの「19記事」と、答えへ到達する選び方「始め方・仕訳・純資産から探す」を示す。
- 本文には始め方、単式との違い、BS・PL、純資産、予算、カード、ふるさと納税、CSV、データ保護の記事が実在する。
- 「はじめての方は『使い方ガイド』から読むのがおすすめ」と本文にある。

## 5. `lp/guide-networth-trend.html`

### 狙うクエリと現状

主対象は本文と現行titleが示す「純資産推移グラフ 作り方」、副対象は「純資産推移グラフ 見方」。クエリ別実績は未提示。ページ実績はクリック0、表示3、CTR 0%、平均2.00位。

### 提案

- 現行title: `純資産推移グラフの作り方と見方｜毎月の増減を1本の線で | kurofukubo`
- 新title（32字）: `純資産推移グラフの作り方｜Excelは手動作成・家計簿は自動作成`
- 新description（115字）: `純資産推移グラフは、毎月末の「資産－負債」を1本の線で結びます。Excel・スプレッドシートで手動作成する手順と、複式簿記の家計簿へ記帳して自動作成する方法を明確に分けて紹介。傾き、前月比、増減要因、投資評価額の見方も解説します。`

### 判断理由と本文根拠

- 「Excel・家計簿で自動作成」ではExcelまで自動に読めるため不採用。新案は `Excelは手動作成・家計簿は自動作成` と対比を明示し、誇張を除いた。
- 本文の方法1は「手動（Excel／スプレッドシート）」。毎月末に資産・負債を手で合計し、「年月」「純資産」の2列から折れ線グラフを作る。
- 本文の方法2は「自動（複式簿記の家計簿で記帳するだけ）」。日々の取引入力から資産・負債・純資産と推移グラフが自動計算される。
- 自動なのは銀行連携やExcel集計ではなく、家計簿で記帳した後の計算・グラフ表示である。descriptionもこの条件を維持する。

## 6. `lp/guide-privacy.html`

### 狙うクエリと現状

主対象は本文・現行titleと一致する「家計簿 データ 誰が見られる」、副対象は「家計簿 E2E暗号化」「家計簿 連携なし」。クエリ別実績は未提示。ページ実績はクリック0、表示3、CTR 0%、平均5.33位。

### 提案

- 現行title: `家計簿のデータは誰が見られる？ 連携なし・ゼロ知識(E2E)で使う家計簿 | kurofukubo`
- 新title（30字）: `家計簿データは誰が見られる？E2E暗号化なら運営者も読めない`
- 新description（113字）: `家計簿データは誰が見られる？kurofukuboは銀行自動連携をせず、認証情報を預かりません。E2E暗号化をONにすると端末で暗号化され、運営者も中身を復号できません。暗号化OFF・ゲスト利用を含む保存場所の違いも解説します。`

### 判断理由と本文根拠

- E2E暗号化を有効にすると運営者を含む第三者が復号できない、という本文の答えをtitleで条件付き提示する。
- 本文は、銀行自動連携をせず認証情報を預からないと説明している。
- 暗号化OFFでは技術上運営者が閲覧可能、ゲストデータは端末のみ、という例外も本文どおりdescriptionで示す。「常に誰にも見えない」とは表現しない。

## 変更後の検索意図の分担

| ページ | 固有の役割 | titleの中心語 | 方針 |
|---|---|---|---|
| `index.html` | アプリ／商品探索・利用開始 | 黒福簿、複式簿記、純資産、家計簿 | **titleを変更しない**。表示18、平均4.33位、CTR 11.11%を守る |
| `guide-start.html` | 操作方法・利用開始手順 | 使い方、始め方、3ステップ | 「アプリ」商品探索語を主対象にしない |
| `guides.html` | 課題別の記事探索 | 19記事、始め方、仕訳、純資産 | 個別記事へ送るハブ |
| `guide-furusato.html` | ふるさと納税の費目・記帳 | 項目、何費、つけ方、2,000円、立替金 | 既存の1ページ目クエリ語を保持 |
| `guide-net-worth.html` | 家計純資産の定義・原因・増やし方 | 家計純資産とは、資産－負債、3つの原因 | 「いくらあれば」は専用記事へ分離 |
| `guide-networth-trend.html` | 純資産推移グラフの作成 | Excelは手動、家計簿は自動 | 二つの手法を混同しない |
| `guide-privacy.html` | 家計データの閲覧可否 | 誰が見られる、E2E暗号化 | 暗号化ONの条件を明示 |

## メタデータ同期ポリシー

titleまたはdescriptionを変更するときは、検索用メタデータだけを単独で変えず、SNSカードと構造化データを同時に更新する。今回変更する6ページではSNS向けに別コピーを作らず、上記の新title・新descriptionへ**完全同期**する。これにより古いtitleやdescriptionがOGPやJSON-LDに残る事故を防ぐ。

### 共通チェックリスト

BlogPosting型のガイド記事5ページ（`guide-furusato.html`、`guide-net-worth.html`、`guide-start.html`、`guide-networth-trend.html`、`guide-privacy.html`）は、ページごとに次の8項目を更新する。

- [ ] `<title>` = 新title
- [ ] `<meta property="og:title" content="…">` = 新title
- [ ] `<meta name="twitter:title" content="…">` = 新title。現状タグがないため追加する
- [ ] JSON-LD `BlogPosting.headline` = 新title
- [ ] `<meta name="description" content="…">` = 新description
- [ ] `<meta property="og:description" content="…">` = 新description
- [ ] `<meta name="twitter:description" content="…">` = 新description。現状タグがないため追加する
- [ ] JSON-LD `BlogPosting.description` = 新description

一覧ページ `guides.html` はBlogPostingではなくCollectionPageなので、次の8項目を更新する。

- [ ] `<title>` = 新title
- [ ] `<meta property="og:title" content="…">` = 新title
- [ ] `<meta name="twitter:title" content="…">` = 新title。現状タグがないため追加する
- [ ] JSON-LD `CollectionPage.name` = 新title
- [ ] `<meta name="description" content="…">` = 新description
- [ ] `<meta property="og:description" content="…">` = 新description
- [ ] `<meta name="twitter:description" content="…">` = 新description。現状タグがないため追加する
- [ ] JSON-LD `CollectionPage.description` = 新description

### ページ別同期宣言

| ページ | title系 | description系 | SNS専用コピー |
|---|---|---|---|
| `guide-furusato.html` | `<title>` / `og:title` / `twitter:title` / `BlogPosting.headline` を新titleへ同期 | meta / OG / Twitter / `BlogPosting.description` を新descriptionへ同期 | なし |
| `guide-net-worth.html` | 同上 | 同上 | なし |
| `guide-start.html` | 同上 | 同上 | なし |
| `guides.html` | `<title>` / `og:title` / `twitter:title` / `CollectionPage.name` を新titleへ同期 | meta / OG / Twitter / `CollectionPage.description` を新descriptionへ同期 | なし |
| `guide-networth-trend.html` | `<title>` / `og:title` / `twitter:title` / `BlogPosting.headline` を新titleへ同期 | meta / OG / Twitter / `BlogPosting.description` を新descriptionへ同期 | なし |
| `guide-privacy.html` | `<title>` / `og:title` / `twitter:title` / `BlogPosting.headline` を新titleへ同期 | meta / OG / Twitter / `BlogPosting.description` を新descriptionへ同期 | なし |
| `index.html` | **更新なし**。現行の `<title>` / `og:title` / `twitter:title` は同一のまま保持 | **更新なし**。現状のmeta・OG、短いTwitter用、製品説明寄りの `SoftwareApplication.description` の差もそのまま保持 | 現状を意図的に維持 |

実装時は1ページずつ8項目を検索し、旧title・旧descriptionの残存が0件であることを確認する。BreadcrumbList末尾の名称、本文h1、カード見出しは検索/SNSメタデータではなく、今回のtitle同期対象には含めない。別途変える場合は本文導線への影響を確認して扱う。

## 効果測定

6ページを同日に変更してSearch Consoleへ変更日を記録し、最低28日、可能なら同曜日構成の56日でページ別CTRと対象クエリ別CTRを比較する。順位変動とCTR変動を分けて見る。

- `guide-furusato.html`: 「項目」「つけ方」「何費」の各クエリで平均順位を維持しながらCTRが上がるか。
- `guide-start.html` と `index.html`: アプリ系クエリのランディングページ、表示、CTRを確認し、カニバリゼーションが弱まるか。`index.html` はtitle無変更の対照として扱う。
- `guide-networth-trend.html`: スニペットでExcel＝手動、家計簿＝自動が誤解なく伝わり、平均2位前後でクリックが発生するか。
- `guides.html`: 「19記事」がファイル追加・削除後も真実か。記事数変更時はtitle、description、CollectionPageのItemListを同時に更新する。

## 厳しめの自己採点

| 評価項目 | 配点 | 自己採点 | 厳しめの評価 |
|---|---:|---:|---|
| クエリ適合 | 25 | 22 | ふるさと納税の5語を保持し、guide-startとindexの意図を分離した。一方、クエリとランディングページの直接対応表がなく、低表示ページのクエリ実績も未提示。 |
| 答えの予告 | 20 | 18 | 2,000円＋立替金、資産－負債＋3原因、3ステップ、19記事、手動対自動、暗号化条件を提示。ただし一覧ページは性質上、単一の答えではなく選択肢の予告に留まる。 |
| 表示長最適化 | 15 | 15 | 最終titleは実測30〜32字。全案で重要語と結論を範囲内に置いた。 |
| クリック誘因 | 15 | 12 | 数字・計算式・手法の対比で具体化したが、実際のSERP競合スニペットとの比較やタイトルA/Bテストはしていない。 |
| 内容との一致 | 15 | 15 | 対象本文と構造化データを照合。Excel手動／家計簿自動、暗号化ON条件、19ファイルを確認し、過大表現を除いた。 |
| description品質 | 10 | 8 | 111〜119字で答えと記事範囲を提示したが、Googleの書き換えや検索語ごとの最適スニペットは実測前である。 |
| **合計** | **100** | **90** | **既知の事実誤認と意図混同は解消したが、クエリ着地データ・SERP競合比較・変更後の実測がないため満点寄りには評価しない。** |

### 残る既知の弱点

- `guide-furusato.html` は31字へ5検索語と2つの答えを収めたため、「項目・何費・つけ方」の並列表現がやや硬い。語を削るより、すでに順位のある語を守る方を優先した。
- `guide-networth-trend.html` の「家計簿は自動作成」は、本文どおり記帳後の計算・グラフ作成が自動という意味。入力自体や銀行連携まで自動とは述べていないが、descriptionとの併読で条件を補う必要がある。
- `guides.html` の「19記事」は現時点では正確だが可変値。記事追加・削除時にメタデータも更新する運用が必要。
- 変更効果はまだ未検証。順位を保ったままCTRが改善するかをSearch Consoleで追い、悪化時はページ単位で戻す判断が必要。
