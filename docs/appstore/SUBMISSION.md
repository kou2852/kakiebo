# App Store 提出メモ（kurofukubo iOS）

実装から拾った事実だけを書く。推測で埋めない。空欄は判断待ち。

- Bundle ID: `com.kurofukubo.app`
- EAS プロジェクト: `@pokupoku_x_x_x/kurofukubo`
- サポートURL: https://kurofukubo.com
- プライバシーポリシー: https://kurofukubo.com/privacy.html
- 利用規約: https://kurofukubo.com/terms.html

---

## 1. App Privacy（プライバシー栄養ラベル）

App Store Connect → アプリのプライバシー。**実装と食い違うと審査で落ちる**ので、
以下は実際のコードから確認した内容。

### 収集する（ユーザーに紐づく）

| データ種別 | 用途 | 根拠 |
|---|---|---|
| メールアドレス | アプリの機能（アカウント） | Cognito 認証。`src/auth/cognito.js` |

追跡（Tracking）には使わない。

### 収集する（ユーザーに紐づかない）

| データ種別 | 用途 | 根拠 |
|---|---|---|
| 広告データ / デバイスID | サードパーティ広告 | AdMob バナー。`src/components/Ad.jsx` |

**注意**: `requestNonPersonalizedAdsOnly: true` で非パーソナライズ広告に限定している。
それでも AdMob を積む以上、識別子の申告は必要。

### 収集しない

- **家計データ（仕訳・残高・科目）** — サーバーへは送るが、これは「開発者が利用者に提供する
  ストレージ」であり、Apple の定義でも申告対象になる。**「財務情報 → その他の財務情報」を
  「アプリの機能」用途で申告するのが正確。** E2E暗号化を有効にしている場合でも、
  暗号文をサーバーに保存している事実は変わらないため、暗号化を理由に非申告にはしない。
- 位置情報・連絡先・健康・閲覧履歴 — 一切扱わない
- 写真 — 端末内で読み取るだけで、外部送信しない（`modules/text-recognition`。Apple Vision）

### 決定済み（2026-08-30）

- **家計データは「財務情報 → その他の財務情報」を「アプリの機能」用途で申告する。**
  用途は「アプリの機能」のみ。分析にも広告にも使わない。ユーザーに紐づく（アカウントに保存するため）。
  追跡には使わない。
- **AdMob は初回リリースから含める。** よって広告データ・デバイスIDの申告も行う。

---

## 2. 輸出コンプライアンス

Apple のルールではなく、**米国輸出管理規則（EAR）に基づく米国政府への自己申告**。
App Store が米国から配信されるため、暗号を含むアプリが対象になる。

### 質問は2段階

**Q1「暗号化を使用しているか」→ Yes。** AES-256-GCM でデータ本体を暗号化している。

**Q2「Category 5 Part 2 の免除に該当するか」**

| 免除の類型 | 該当 | 理由 |
|---|---|---|
| HTTPS通信だけ | ✕ | データ本体を暗号化している |
| OS標準の暗号のみ | ✕ | `@noble/ciphers`（純JSのAES）をアプリに同梱している |
| 鍵長 56bit 以下 | ✕ | AES-256 |
| 認証・署名のみ | ✕ | データ保護に使っている |
| **量産品（mass market）** | **○** | 一般消費者向け・標準暗号・暗号機能をユーザーが改変できない |

### 実装上の事実

- AES-256-GCM（`src/crypto/index.js`、実装は `@noble/ciphers`）
- PBKDF2-SHA256 60万回（WebView 経由で WebKit の Web Crypto ＝ OS 実装）
- 独自アルゴリズムは無く、標準方式のみ
- 暗号化はユーザーのデータ保護が目的で、暗号製品として販売していない

### 申告先の設定値

`app.json` の `ios.infoPlist.ITSAppUsesNonExemptEncryption`:

- `false` = 免除に該当する暗号のみ使用 → 提出のたびに聞かれなくなる
- `true` = 非免除の暗号を使用 → 分類書類（CCATS 等）の提出が必要。この構成では過剰

**`false` を選ぶ場合、量産品としての自己分類レポートを年1回 BIS と NSA へ提出する義務が伴う**
（メールでスプレッドシートを送る手続き）。省略している個人開発者は多いが、それは各自が負うリスク。

### 判断（2026-09-04・確定）

**`ITSAppUsesNonExemptEncryption: false` を選ぶ。** 検討したうえでの決定であり、
Expo の既定値をそのまま残しているのではない。

根拠として置いた事実:

- 使っているのは AES-256-GCM と PBKDF2-SHA256 のみ。**独自方式・非標準方式はゼロ**
- 暗号は利用者自身のデータを守るためのもので、暗号製品として売っていない
- 一般消費者向けの無料アプリで、暗号の挙動を利用者が改変できない
  （＝量産品 / mass market の性格）

割り切った点:

- `@noble/ciphers` を同梱しており「OS 標準の暗号だけ」には当てはまらない。
  それでも量産品免除に該当すると判断した
- この判断に立つ場合、年1回の自己分類レポート提出義務があるとする見解もある。
  その解釈上のリスクは事業者が負う

⚠ これは Apple のルールではなく**米国政府（BIS）への自己申告**。
配信地域が日本のみでも、App Store が米国から配信される以上は対象になる。
暗号の実装を変えたら（例: 独自方式の導入、鍵長の変更）この判断を見直すこと。

---

## 3. ストア掲載情報（2026-09-05 現在）

App Store Connect にそのまま貼れる形で置く。**コードから確認した実際の値**。

### 名前について（2026-09-06 決定）

`kurofukubo` は ASC で「すでに使用されています」と出た。

⚠ **まず自分の既存レコード（App ID 6806592989）ではないか確認する。**
build 12・13 を提出済みなので、そこが名前を押さえている可能性が高い。
新規に「App を追加」しているなら、既存レコードを開いて使うのが正しい。
その場合は改名の必要がない。

他社に取られていた場合の名前:

```
黒福簿 - 複式簿記の家計簿
```

`黒福簿` 単体にはしない。**読み方が分からない**（くろふくぼ）ので口コミで
広がらず、造語なので検索もされない。日本のみの配信で、アプリ名は検索順位に
最も効く欄なので、そこを空費できない。

名前とサブタイトルで語が重ならないよう振り分けた:

| 欄 | 値 | 拾う語 |
|---|---|---|
| 名前 | `黒福簿 - 複式簿記の家計簿` | 家計簿・複式簿記 |
| サブタイトル | `純資産まで見える資産管理` | 純資産・資産管理 |

`kurofukubo` はドメインとバンドルID（`com.kurofukubo.app`）に残るので、
ブランドの一貫性は保たれる。**ローマ字は日本語話者が検索しない**ため、
表示名に入れる価値は低い。

### App 情報（固定値）

| 項目 | 値 |
|---|---|
| 名前 | `黒福簿 - 複式簿記の家計簿` （14字） |
| サブタイトル（30字以内） | `純資産まで見える資産管理` （12字） |
| Bundle ID | `com.kurofukubo.app` |
| ASC App ID | `6806592989` |
| SKU | `kurofukubo-ios` |
| プライマリカテゴリ | ファイナンス |
| セカンダリカテゴリ | 仕事効率化 |
| 著作権 | `2026 pokupoku_x_x_x` |
| 年齢区分 | 4+（暴力・性的表現・ギャンブル・ユーザー生成コンテンツなし） |
| 価格 | 無料 |
| App内課金 | なし（0.2.0 で追加予定。`docs/MONETIZATION.md`） |
| 配信地域 | **日本のみ** |

### バージョン情報

| 項目 | 値 |
|---|---|
| バージョン | `0.1.2` |
| ビルド | EAS が自動採番 |

⚠ **build 12（0.1.0）と build 13（0.1.1）は使わない。**
12 はテスト広告入り、13 はツアー・広告の被り修正・ログアウトが未反映。

### 出す前の検査

```powershell
npx expo export --platform ios --clear --output-dir <一時ディレクトリ>
node scripts/prod-bundle.check.cjs <一時ディレクトリ>
```

本番バンドルに何が入っているかを見る。EAS のビルドを1回無駄にすると
15〜30分失うので、その前に手元で確かめる。0.1.2 で全項目を通過済み。

### URL

| 項目 | 値 |
|---|---|
| プライバシーポリシー | `https://kurofukubo.com/privacy.html` |
| サポート | `https://kurofukubo.com/contact.html` |
| **マーケティング** | `https://kurofukubo.com/` |

⚠ **マーケティングURL は空欄にしない。** AdMob のクローラは App Store の掲載情報に
ある開発者サイトの URL を見て、そのドメイン直下の `/app-ads.txt` を探す。
App Store ではこれがマーケティングURL にあたる。空欄だと探しに行く先が無く、
`app-ads.txt` が永久に「未確認」のままになり、承認済みの販売者として
認識されず入札が減る。

ドメインは一致している（`https://kurofukubo.com/app-ads.txt` は HTTP 200。
`www` 付きでも引ける）。

⚠ **クロールはアプリが公開されてから。** 掲載情報を読みに行く仕組みなので、
審査中は確認されない。公開後に AdMob 管理画面で「認証済み」になったかを見ること。

2026-09-05 にデプロイ済み。本番とローカルの一致を確認。

### LP の配信先（デプロイ時に使う）

| 項目 | 値 |
|---|---|
| バケット | `s3://kakeibo-lp-117953360790`（us-east-1） |
| CloudFront | `E2ANL068WDF75Y`（kurofukubo.com / www.kurofukubo.com） |
| プロファイル | `kakeibo-prod`（SSO。アカウント 117953360790） |

⚠ `s3 sync` は使わない。消し込みで意図しないファイルが消える。
`aws s3 cp` で必要なファイルだけ差し替え、そのパスだけ無効化する。

### プロモーションテキスト（170字以内・審査なしで随時変更可）

```
入力は一行から。裏側で複式簿記に変換して、現金・口座・カード・資産・負債を
ひとつの帳簿でつなぎます。純資産の推移が自動で見えるので、貯まっているのか
減っているのかが一目で分かります。登録なしですぐ使えます。
```

### 説明文

家計簿アプリではなく**資産管理**として書く。

```
kurofukubo（黒福簿）は、複式簿記で資産を管理するアプリです。

■ 入力は一行、裏側は複式簿記
「コンビニ 580」のように書くだけで、借方と貸方に振り分けて記帳します。
簿記の知識は要りません。慣れてきたら仕訳を直接編集することもできます。

■ 純資産が見える
現金・預金・クレジットカード・投資・借入をひとつの帳簿でつなぐので、
「手元にいくらあるか」ではなく「差し引きでいくら持っているか」が分かります。
月ごとの推移をグラフで追えます。

■ カードの締めと引き落としに強い
利用日と引き落とし日がずれても帳簿が合います。締め日・支払日を登録すれば、
未払い残高と引き落とし予定を自動で計算します。

■ 登録なしで使える
アカウントを作らなくても全機能を使えます。データは端末内に保存されます。
アカウントを作ると、複数の端末で同じ帳簿を見られます。

■ 暗号化してから預けられる
パスフレーズを設定すると、端末内で暗号化してからサーバーへ送ります。
鍵は端末から出ないため、運営者も中身を読めません。

■ 主な機能
・一行入力、プリセット、自動仕訳ルール、定期取引
・貸借対照表、損益計算書、キャッシュフロー計算書
・予算、タグ配分、実査・評価替え
・CSV の入出力
・カレンダー表示、レシートの読み取り（端末内で処理）

■ 料金
現在は全機能を無料で使えます。広告が表示されます。

■ ご注意
本アプリは記帳と集計を行うもので、税務・投資の助言は行いません。
```

### キーワード（100字以内・カンマ区切り・スペースなし）

```
複式簿記,資産管理,純資産,家計簿,貸借対照表,BS,PL,簿記,資産形成,貯蓄,クレジットカード,予算,仕訳,オフライン
```

### スクリーンショット

⚠ **`supportsTablet: true` なので iPad のスクリーンショットも必須。**
（iPhone だけで足りるのは `supportsTablet: false` の場合）

| 対象 | 必要サイズ | 状態 |
|---|---|---|
| iPhone | **6.5インチ（1242×2688）** | **用意済み**（`docs/appstore/screenshots/`） |
| **iPad** | 13インチ（2064×2752）※ supportsTablet: true のため | **用意済み** |

### iPhone の5枚（2026-09-06）

実機（iPhone 6.1インチ・1170×2532）で撮り、**6.5インチ（1242×2688）**へ変換した。
ASC は 6.1インチを受け付けない。

⚠ **最初 6.9インチ（1320×2868）で作ったが、ASC に弾かれた。**
「1242×2688、2688×1242、1284×2778 または 2778×1284 にしてください」と出る。
枠ごとに求める寸法が違うので、**エラーに書かれた寸法をそのまま使う**のが早い。

> 2026-10-01 追記: 弾かれたのは **6.5インチの枠に** 1320×2868 を入れたため（エラーの寸法は 6.5インチ用）。1320×2868 は **6.9インチの枠**の寸法で、メディアマネージャーの「6.9インチディスプレイ」に入れれば受け付けられる（1.0.2 で確認）。6.9インチを入れて 6.5インチの枠を空にすると、6.5・6.3インチは「6.9インチディスプレイを使用」になる。

変換の方法（`docs/appstore/screenshots/` に出力）:

- **双一次補間**で拡大（最近傍だと文字がギザつく）
- 縦横比は 0.462085 と 0.462054 で**差が 0.0069%**。余白の補填は要らない
- 拡大率 1.06 で、6.9インチ（1.13）より劣化が少ない

| 元 | 縦横比 | 拡大率 |
|---|---|---|
| 1170×2532 | 0.462085 | — |
| **1242×2688（採用）** | 0.462054 | 1.0615 |
| 1284×2778 | 0.462203 | 1.0974 |
| 1320×2868 | 0.460251 | 1.1282（比が違い余白が要る） |

| # | ファイル | 画面 |
|---|---|---|
| 1 | `01_dashboard.png` | ダッシュボード（純資産 ¥1,650,640・推移・支出内訳） |
| 2 | `02_entry.png` | 記帳（複合仕訳。借方・貸方を明示） |
| 3 | `03_balance_sheet.png` | 貸借対照表（資産 ¥1,740,770・負債 ¥90,130） |
| 4 | `04_credit_card.png` | カード（15日締→翌月10日引落・サイクル別） |
| 5 | `05_ledger.png` | 仕訳帳 |

### iPad の5枚（2026-09-06）

実機（2400×3200）で撮り、2064×2752 へ縮小した。**縦横比はどちらも 0.750 で
一致する**ので、iPhone と違って余白の補填は要らない。

⚠ **右下に OS の表示（黒い弧）が 5枚とも同じ位置に写り込んでいた。**
x 2099〜2388 / y 3054〜3188。アプリの要素ではないので、行ごとに
すぐ左の色で塗りつぶした。上下で地の色が変わっても継ぎ目が出ない方法。
消し残り 0px を確認済み。

| # | ファイル | 画面 |
|---|---|---|
| 1 | `ipad_01_dashboard.png` | ダッシュボード（口座の残高・支出の推移・予算の消化・投資資産まで一画面） |
| 2 | `ipad_02_entry.png` | 記帳（複合仕訳） |
| 3 | `ipad_03_balance_sheet.png` | 貸借対照表 |
| 4 | `ipad_04_credit_card.png` | カード（サイクル一覧まで表示） |
| 5 | `ipad_05_ledger.png` | 仕訳帳 |

**iPad のレイアウトに崩れは無い。** タブバーと記帳ボタンは間延びせず、
広告バナーとの重なりも起きていない。Guideline 2.1 の懸念は解消と見てよい。

広告は写っていない。AdMob が未配信のため枠ごと畳まれている。
**撮影用に無効化したわけではない**ので Guideline 5.6 には触れない。

**撮影に使うビルドは、審査に提出するものと同じ。**
撮影用に広告を無効化した専用ビルドを作ってはならない（`docs/MONETIZATION.md`）。
広告が写り込むこと自体は問題ない。

撮る画面:
1. ダッシュボード（純資産＋推移グラフ）
2. 入力（一行入力＋プリセット）
3. レポート（貸借対照表）
4. レポート（カードの締めサイクル）
5. 実査・評価替え

ダミーではなく、意味の通る数字を入れた状態で撮ること（`4.9 デモ帳簿`）。

### App Privacy（1章の決定を ASC の選択肢に対応させたもの）

| データ種別 | 用途 | ユーザーに紐づく | 追跡 |
|---|---|---|---|
| 連絡先情報 → メールアドレス | アプリの機能 | はい | いいえ |
| 財務情報 → その他の財務情報 | アプリの機能 | はい | いいえ |
| 識別子 → デバイスID | サードパーティ広告 | いいえ | いいえ |
| 使用状況データ → 広告データ | サードパーティ広告 | いいえ | いいえ |

「トラッキング」は**いいえ**。`requestNonPersonalizedAdsOnly: true` で
非パーソナライズ広告に限定し、ATT の許可も求めていない。

### 審査メモ（App Review Information → Notes）

英文で書く。日本語だけだと読まれないことがある。

```
This app works fully without an account. You can use every feature by tapping
"Start without an account" on the first screen; the ledger is stored on the
device only.

An account is optional and only used to sync the same ledger across devices.
If you want to check the sync feature, please use the demo account below.

  Email:    appreview@kurofukubo.com
  Password: R4gsZwhK485Nqi

Notes for review:

1. Encryption. The app can encrypt the ledger on the device before uploading it
   (Settings > 暗号化・バックアップ). The key never leaves the device. We use
   only standard algorithms (AES-256-GCM, PBKDF2-SHA256).

2. Ads. The app shows an AdMob anchored banner above the tab bar. Ads are
   non-personalized only; we do not request App Tracking Transparency
   permission and do not use IDFA.

3. Account deletion. Settings > アカウントと同期 > アカウントを削除 deletes the
   account and all server-side data (Guideline 5.1.1(v)).

4. Face ID. Used only to unlock the app and to retrieve the locally stored
   encryption key. Never sent anywhere.
```

## 4. 審査で聞かれそうな点と、答えの根拠

- **アカウント登録が必須か** → 必須ではない。ログインせず端末内だけで使える（`src/store/DataProvider.jsx`）。
  審査用アカウントの提供は不要だが、同期機能を見せるなら用意した方が早い。
- **広告** → インラインバナーのみ。全画面インタースティシャルは使っていない。
- **文字認識** → 端末内（Apple Vision）。画像を外部送信しないことを説明できる。

---

## 4.5 広告（AdMob）の方針と手順

### 決定済み（2026-08-31）

- **配信地域は日本のみ。** App Store Connect の「価格および配信状況」で日本だけを選ぶ。
  EEA・英国へ配信しないので **GDPR の同意取得（UMP / AdsConsent）は実装しない。**
  将来的に配信地域を広げるなら、その前に UMP の実装が必要になる。
- **非パーソナライズ広告に固定する。**（`requestNonPersonalizedAdsOnly: true`）
  IDFA を使わないので **ATT（トラッキング許可）のダイアログは出さない。**
  単価は下がるが、「家計データを外部に出さない」という訴求と矛盾しないことを優先した。

### 配置

タブバー直上のアンカーバナー（`ANCHORED_ADAPTIVE_BANNER`）。
`app/(tabs)/_layout.jsx` の `tabBar` で描画しているため、react-navigation が
タブバー高さに含めて測り、各画面の下端が隠れない。
タブ外の画面（クレジット・管理・撮影など）には出ない。全画面インタースティシャルは使わない。

### ID（2026-09-02 に AdMob 管理画面で作成・取得）

| 種別 | 値 | 置き場所 |
|---|---|---|
| アプリ ID | `ca-app-pub-1494837719359912~3751918994` | `app.json`（ネイティブ設定・**要ビルド**） |
| 広告ユニット ID | `ca-app-pub-1494837719359912/3915570524` | `src/components/Ad.jsx` の `PROD_UNIT_ID`（JS・OTA可） |
| パブリッシャー ID | `pub-1494837719359912` | `lp/app-ads.txt` |

ユニットの設定はすべて既定のまま:
広告の種類＝テキスト/イメージ/リッチメディア＋動画、自動更新＝Google による最適化、
eCPM 下限＝Google による最適化（すべての価格＝掲載率を優先）。
新規アプリで配信実績が無いため、下限を付けずに掲載率を取りにいく。

**AdMob 上の承認状況は「要審査」。** App Store で公開され、ストアの掲載情報と
紐づくまでは配信が制限される。公開前に収益が立たないのは想定どおり。

### app-ads.txt

`lp/app-ads.txt` を作成済み。**LP へのデプロイが必要**（`https://kurofukubo.com/app-ads.txt`）。
App Store の掲載情報に書くデベロッパーサイトのドメイン直下に置く必要がある。
無いと「認証済み販売者」として扱われず、入札を避ける買い手が出る。

    google.com, pub-1494837719359912, DIRECT, f08c47fec0942fa0

publisher ID が AdMob のアプリ ID の前半（`ca-app-pub-1494837719359912~…`）と
一致することを確認済み。AdSense の `ads.txt` と同じ ID で正しい。

### 残っている手順

1. **`src/ads.js` の `TEST_DEVICES` に自分の端末IDを登録する。**
   登録せずに本番の広告を自分の端末で操作すると「自分の広告をクリックした」と
   記録され、**AdMob アカウントが停止される可能性がある。**
   端末IDは一度起動するとログに出る `testDeviceIdentifiers = @[ @"..." ]` の文字列。
2. 登録後に `src/components/Ad.jsx` の `TEST_ADS` を false にする。
   ここは JS だけなので **OTA で反映でき、ビルドは要らない。**

いまは `TEST_ADS = true` で、本番IDを持ったままテスト広告を出している。
配置と見た目の確認はこの状態でできて、収益も無効なトラフィックも発生しない。

広告そのものを止めたいときは `ADS_ENABLED` を false にする（同じく OTA 可）。

### Android

`androidAppId` は Google 公開のテストIDのまま。AdMob に Android アプリを
登録していないため。Android を出すときに登録して差し替える。

## 4.6 アカウントの削除（審査要件 5.1.1(v)）

**アカウントを作れるアプリは、アプリ内から削除を開始できなければならない。**
「サイトで削除してください」と案内する形は認められない。よく出るリジェクト理由。

アプリに新規登録の画面は無いが、**Google ログインの初回サインインで Cognito が
ユーザーを自動作成する**ため、作成に該当する。

### 実装（2026-09-02）

設定 → アカウントと同期（`app/settings/sync.jsx`）の一番下。ログイン中だけ出す。
`DELETE /api/account` を叩き、サーバー側で DynamoDB の全アイテムと Cognito
ユーザーを削除する（`backend/src/handlers/settings.js`。データの削除を検証してから
Cognito を消すので、「ログインできないのにデータが残る」状態にはならない）。

端末側は **サーバー → Keychain の鍵 → ローカルDB → 再読み込み** の順で消す。

- サーバーを先にするのは、削除に失敗したときに端末だけ空にしないため
  （端末だけ消すと、次の同期でサーバーの内容が戻る）
- Keychain のデータ鍵（`forgetDek`）を消し忘れると、消したアカウントの鍵が端末に残る
- 最後に `Updates.reloadAsync()`。消した直後の画面には、もう存在しない帳簿が
  描かれたままになる

### 審査に出すときの注意

新規登録をアプリ内に入れた（4.7）ので、審査員は自分でアカウントを作って
削除まで確認できる。テスト用アカウントの用意は必須ではないが、確認コードの
メールが届かない環境も考えられるため、審査メモに用意しておくのが安全。

## 4.7 新規登録（2026-09-02 追加）

接続画面（`app/connect.jsx`）に「ログイン / 新規登録」の切り替えを置いた。
`signUp` / `confirmSignUp` は元から実装済みで、UI だけが無かった。
アカウントを作るにはサイトへ行くしかなく、App Store が入口になる以上そこで落ちる。

- パスワード条件は画面に出す（8文字以上・英小文字と数字）。
  `backend/template.yaml` の `PasswordPolicy` と揃えること
- 確認コードの再送を用意した。届かないと、そのアドレスは登録済みのまま使えなくなる
- ログイン時に `UserNotConfirmedException` が返ったら確認画面へ戻す。
  登録の途中でやめた人が二度と入れなくなる行き止まりを塞ぐ
- Cognito のエラーは英語で返るので `authMessage()` で訳す。
  **「アドレスが無い」と「パスワードが違う」は同じ文言にする。**
  分けると、どのアドレスが登録済みかを総当たりで調べられる
- 登録直後にサーバーからの取り込みはしない。新規アカウントのサーバー側は
  既定科目だけなので、取り込むと登録前に端末で入れた帳簿が消える
- 端末の既定科目（`src/db/defaults.js`）とサーバーの seed（`postConfirm.js`）は
  ID が同じ（`a01`…）。初回同期で重複しない

**⚠ Cognito の標準メール送信は 1日 50通が上限。** SES は使わない
（`SesIdentityArn` を渡すと送信が全滅する）。登録数が増えるとここが先に詰まる。

### 利用規約・プライバシーポリシー

新規登録の画面から `kurofukubo.com` の規約とポリシーへリンクしている。
アプリ内から辿れる導線はここだけ。

## 4.8 審査ガイドラインの照合（2026-09-02）

App Review Guidelines を読み直して突き合わせた結果。

### 直したもの

| ガイドライン | 内容 | 対応 |
|---|---|---|
| 5.1.1(i) | プライバシーポリシーへのリンクを**アプリ内の分かりやすい場所**に置く | 設定に「利用規約」「プライバシーポリシー」を追加。従来はアプリ内から辿れる導線が無かった |
| 5.1.1(i) | ポリシーが収集する情報を**具体的に**書く | `lp/privacy.html` に「8. iOS アプリについて」「9. アプリ内の広告配信（AdMob）」を追加。従来は Web と AdSense の記述しか無く、**App Store Connect の App Privacy 申告（広告データ・デバイスID）と食い違っていた** |
| 2.1 | 審査員が機能を判断できる状態で出す | デモ帳簿を用意（下記 4.9） |

### 満たしていることを確認したもの

- **4.8（ログインサービス）** — Google ログインだけでなく、自前のメール／パスワードを
  提供しているため、第三者ログイン単独ではない。Sign in with Apple は必須ではない。
  ただし審査官の判断が割れる項目ではある。差し戻された場合は Sign in with Apple の
  追加を検討する（ネイティブの追加＝再ビルドが必要）
- **5.1.1(v)** — アカウント無しで全機能が使える。アカウント削除はアプリ内にある（4.6）
- **5.1.1(ii)/(iii)** — カメラ・写真・Face ID・通知はいずれも任意。許可しなくてもアプリは動く。
  目的文字列は `app.json` に記載済み
- **2.5.14** — カメラは OS 標準の UI（expo-image-picker）経由でのみ起動する
- **1.5** — アプリ内に問い合わせ画面がある
- **2.5.18 / 3.2.2(iii)** — 広告はタブバー直上の固定バナー1つのみ。全画面広告は使わない。
  広告が主目的の構成ではない
- **3.1.1** — アプリ内課金なし。機能の解除も課金も無い

### 判断が要るもの

- **2.3.1「隠し機能を入れない」と動作診断画面** — メニューからは外したが、
  ルート（`/diag`）は残っている。問い合わせ対応で使うため。
  **審査メモに用途を書くか、リリース前にルートごと消すかを決めること。**
  黙って残すのは 2.3.1 の趣旨に反する

## 4.8.5 審査用アカウント（2026-09-06 作成）

| 項目 | 値 |
|---|---|
| メール | `appreview@kurofukubo.com` |
| パスワード | `R4gsZwhK485Nqi` |

⚠ **記号を入れない。**審査担当は手で入力する。最初 `-fPrm47E#Af8k` にしたが、
`-` と `#` は打ち間違いを誘うし、CLI でもフラグと解釈されて手間が増えた。
| 作成方法 | `admin-create-user` + `admin-set-user-password --permanent` |

⚠ **このメールアドレスは実在しない。**`admin-create-user` は確認メールを
送らないので作成は通るが、**パスワードの再設定ができない**。忘れたら
同じ手順で作り直すこと。

⚠ **確認メールを経ないため PostConfirmation は発火しない。** デフォルト科目は
`postAuth` の初回ログイン時に投入される（`seedDefaults()`）。実際に
29科目が入っていることを確認済み。

作り直す手順（PowerShell）:

```powershell
$U = "appreview@kurofukubo.com"
aws cognito-idp admin-create-user --user-pool-id ap-northeast-1_ddBDF3HKK `
  --username "$U" --message-action SUPPRESS `
  --user-attributes "Name=email,Value=$U" "Name=email_verified,Value=true" `
  --profile kakeibo-prod
aws cognito-idp admin-set-user-password --user-pool-id ap-northeast-1_ddBDF3HKK `
  --username "$U" "--password=<パスワード>" --permanent --profile kakeibo-prod
```

⚠ 引数は必ず引用符でくくる。くくらないと `Invalid email address format` で
落ちる。パスワードが `-` で始まる場合は `"--password=..."` の形にしないと
CLI がフラグと解釈する。どちらも実際に踏んだ。

---

## 4.9 デモ帳簿（審査用）

`mobile/scripts/demo-data.mjs`。3か月分の家計簿を生成し、審査用アカウントへ投入する。
空の家計簿では、ダッシュボードもレポートも白紙で、4.2（最低限の機能）を判断できない。

```
node scripts/demo-data.mjs                 # JSON を書き出すだけ
node scripts/demo-data.check.mjs           # 生成した帳簿を検算
DEMO_EMAIL=... DEMO_PASSWORD=... \
node scripts/demo-data.mjs --push          # 本番のデモ口座へ投入（要許可）
```

- 乱数は種から回すので、**何度実行しても同じ帳簿になる**。
  差し戻しで作り直してもスクリーンショットと食い違わない
- 未来日付の仕訳は落とす。まだ起きていない取引が並ぶと不具合に見える
- `demo-data.check.mjs` がアプリと同じ関数で検算する。貸借の一致、現金・預金が
  マイナスでないこと、カードの締め→引落サイクルが立つこと、予算の費目に実績があること

**⚠ 当月の厚みは投入した日に左右される。** 月初に投入すると当月の記録が数件しか無く、
既定の「今月」で開いたダッシュボードが寂しく見える。検算スクリプトが当月10件未満なら警告する。

### 当月が薄いときの扱い（2026-09-05 決定）

生成の基準日はいじらない。**スクリーンショットを「先月」か「全期間」で撮る。**

期間バーはアプリの標準機能で、利用者が自由に切り替えられる。実際に使える画面を
掲載していれば Guideline 2.3.3（スクリーンショットは実際の使用画面であること）を
満たす。基準日をずらして当月を厚く見せる方が、実際の使用感から離れる。

2026-09-05 時点の生成結果:

| | |
|---|---|
| 仕訳 | 56件（2026-07-25 〜 09-05。未来日付32件は除外） |
| 費用合計 | 376,270円 |
| 現金 / 普通預金 | +75,430円 / +1,106,430円 |
| カードのサイクル | 3件（open / unsettled / settled が揃う） |
| 予算 | 5費目すべてに実績あり |
| 当月の仕訳 | **5件**（薄い。上記のとおり期間を切り替えて撮る） |

**⚠ `--push` は本番への書き込み。** 審査用に用意した使い捨て口座だけに使う。

## 5. 残っている作業


- [ ] **公開後に AdMob 管理画面で `app-ads.txt` が「認証済み」になったか確認。**
      マーケティングURL が空欄だとクロールされない
- [ ] **公開後、本番広告が配信され始める前に `src/ads.js` の `TEST_DEVICES` へ
      自分の端末を登録。** 登録せずに自分の広告を触ると無効なトラフィックと
      判定され、AdMob アカウントが停止されうる
- [x] ~~AdMob の本番ID~~ 2026-09-02 に取得して反映済み（上記 4.5）
- [ ] **本番IDを載せたビルドを作る。** `app.json` の `iosAppId` を変えたので
      fingerprint は build 10 の `eed776eb…` から `aa1e139c…` に変わった。
      **build 10 には OTA が届かなくなっている。**
      `eas build --platform ios --profile testflight`
- [ ] 端末IDを `src/ads.js` の `TEST_DEVICES` に登録
      （`TEST_ADS` は廃止した。テスト広告は `__DEV__` のときだけになり、
      ストア配布ビルドは常に本番ユニットを使う。詳細は `docs/MONETIZATION.md`）
- [x] ~~`lp/app-ads.txt` を LP へデプロイ~~ 2026-09-05 実施（404 → 200 を確認）
- [x] ~~アプリ内のアカウント削除~~ 2026-09-02 実装（上記 4.6）
- [x] ~~輸出コンプライアンスの判断~~ 2026-09-04 に `false` で確定（上記 2 章）
- [ ] 説明文・キーワード・スクリーンショット
- [x] ~~デモ帳簿を審査用アカウントへ投入~~ 2026-09-06 実施。サーバーから
      読み直して確認（科目29・仕訳57・貸借の不一致0）
- [ ] 提出直前に投入し直すか判断する。当月が薄いままなら「先月」で撮る（上記 4.9）
- [ ] **動作診断（`/diag`）を残すか消すかの判断。** 上記 4.8
- [x] ~~`lp/privacy.html` の更新分をデプロイ~~ 2026-09-05 実施。
      本番とローカルの一致、「8. iOS アプリについて」「9. アプリ内の広告配信について」を確認
- [x] ~~アプリ内の新規登録~~ 2026-09-02 実装（上記 4.7）
- [x] ~~審査メモ用のテスト用アカウント~~ 2026-09-06 作成（下記）
- [ ] 配信地域は**日本のみ**。App Store Connect の「価格および配信状況」で設定する
- [x] ~~配布物から開発環境を外した~~ 2026-09-05 に静的確認。`ENVIRONMENTS` は
      `prod` のみで、dev/staging を指す文字列も切替UIも残っていない
- [ ] **実機での通し確認**: 本番アカウントでログイン → 取り込み → 同期 → 削除
      （本番 Cognito にアカウントを作るため、実施には許可が要る）


## Sign in with Apple（Guideline 4.8）

### なぜ要るか

Google ログインを出しているため。4.8 は、外部/ソーシャルログインで主アカウントを作らせるアプリに、
**同等の選択肢**として次を満たすログインの併設を求める。

1. 収集は氏名とメールアドレスのみ
2. **メールアドレスを伏せたままアカウントを作れる**
3. 広告目的で利用状況を収集しない

2 を満たせるのは実質 Sign in with Apple の **Hide My Email** だけ。自前のメール＋パスワードは
Cognito が確認コードを送るため実在のアドレスを要求し、2 を満たさない。
Apple が公表している免除（自社認証**のみ** / 教育・法人 / 公的ID / 特定サービスのクライアント）に
「アカウントが任意」「ゲストで使える」は含まれないので、ゲスト利用可であることは根拠にならない。

**Google を外して回避しない。** 動いている機能をプラットフォーム単位で削ることになる。

### アプリ側（実装済み）

| ファイル | 内容 |
|---|---|
| `src/auth/oauth.js` | `loginWithIdp(env, 'google' | 'apple')`。`IDP` で Cognito のプロバイダ名に対応付け。保存する記録に `idp` を持たせ、`oauthProvider()` で復元時に判別 |
| `src/store/AuthProvider.jsx` | `signInWithApple` を追加。`via` は `'password' | 'google' | 'apple'` |
| `app/connect.jsx` | `AppleButton`。Apple のデザイン規定に従い明色時は黒地・暗色時は白地。Google より上に置き、塗りつぶしで**より目立たせている**（規定：他のログイン手段より目立たなくしてはいけない） |

### Apple Developer 側（要作業）

1. **App ID に capability を足す** — Certificates, Identifiers & Profiles → Identifiers →
   `com.kurofukubo.app` → **Sign In with Apple** にチェック → Save
2. **Services ID を作る** — Identifiers → + → **Services IDs**
   - Description: `kurofukubo Sign in`
   - Identifier: `com.kurofukubo.app.signin`（Bundle ID と同じにはできない）
3. 作った Services ID を開き **Sign In with Apple** → Configure
   - Primary App ID: `com.kurofukubo.app`
   - Domains and Subdomains: `kurofukubo-auth-prod.auth.ap-northeast-1.amazoncognito.com`
   - Return URLs: `https://kurofukubo-auth-prod.auth.ap-northeast-1.amazoncognito.com/oauth2/idpresponse`
4. **キーを作る** — Keys → + → Key Name `kurofukubo SIWA` → **Sign in with Apple** にチェック →
   Configure → Primary App ID `com.kurofukubo.app` → Register → **.p8 をダウンロード**
   - ⚠ .p8 は**一度しか落とせない**
   - Key ID（キーの画面）と Team ID（ポータル右上）を控える

集めるもの: **Services ID / Team ID / Key ID / .p8 の中身**。
.p8 はリポジトリにも Obsidian にも置かない。

### Cognito 側（本番設定変更・実行前に許可を取る）

⚠ **CLI で直接足さないこと。** User Pool・アプリクライアント・Google IdP はすべて
`backend/template.yaml` の管理下にある。`aws cognito-idp create-identity-provider` で足すと
次の `sam deploy` で消えるか、スタックと食い違う。**SAM 経由で入れる。**

テンプレートは修正済み（`AppleIdP` リソース、`HasApple` 条件、
`SupportedIdentityProviders` の Google×Apple 4通り分岐、Outputs 2本）。
残るのはパラメータを渡してデプロイするだけ。

| パラメータ | 値 | 秘密 |
|---|---|---|
| `AppleServicesId` | `com.kurofukubo.app.signin` | 公開 |
| `AppleTeamId` | Apple Developer ポータル右上の10文字 | 公開 |
| `AppleKeyId` | `AuthKey_XXXXXXXXXX.p8` の XXXXXXXXXX | 公開 |
| `ApplePrivateKey` | .p8 の中身（BEGIN/END と改行を除いた本文1行） | **秘密** |

秘密の扱いは `GoogleClientSecret` と同じにする。SSM SecureString に置き、
デプロイ時に読んで渡す。**コマンドラインに直書きしない**（履歴とプロセス一覧に残る）。

```sh
# 1) SSM に入れる（一度だけ）
aws ssm put-parameter --name /kakeibo/apple-private-key --type SecureString --value "<.p8の本文1行>"

# 2) デプロイ時に読んで渡す
sec=$(aws ssm get-parameter --name /kakeibo/apple-private-key --with-decryption --query Parameter.Value --output text)
sam deploy --config-env prod --parameter-overrides "... ApplePrivateKey=$sec AppleServicesId=... AppleTeamId=... AppleKeyId=..."
```

⚠ `--parameter-overrides` は**書かなかったパラメータを既定値に戻す**。
既存の `Stage` / `AllowedOrigin` / `LpOrigin` / `AlarmEmail` / `GoogleClientId` /
`GoogleClientSecret` / `MobileRedirectUris` を必ず全部添えること。
`docs/NEXT_STEPS.md` の prod デプロイ行が現行の正解なので、そこに Apple の4つを足す。

⚠ `sam deploy` は本番への干渉。**change set を確認してから実行**（`confirm_changeset = true` 済み）。
変更が `AppleIdP` の追加と `UserPoolClient` の更新だけであることを目視する。

### 確認

- `connect.jsx` の「Appleで続ける」→ Apple のサインイン画面 → **Hide My Email を選ぶ**
- Cognito に `@privaterelay.appleid.com` のユーザーが増えること
- そのアカウントで同期できること

### 1.0 での割り切り

**同じ人がメール登録と Apple 登録で別アカウントになる。** Apple は Hide My Email だと
中継アドレスを返すため、自前登録時のメールと一致しない。統合（アカウントリンク）は 1.0 では行わない。

**Hide My Email のアカウントには、こちらからメールを送れない。** 中継の転送は送信元ドメインを
Apple に登録している場合のみ機能する。メール本文で本人に届ける前提の機能を足すときは、ここを見直すこと。


## 1.0.1 に回したもの

### Cognito Hosted UI のカスタムドメイン（`auth.kurofukubo.com`）

**症状。** 「Appleで続ける」「Google で続ける」を押すと、iOS の
`ASWebAuthenticationSession` が出す確認ダイアログに

> "kurofukubo"がサインインするために**"amazoncognito.com"**を使用しようとしています

と表示される。続くブラウザにも
`kurofukubo-auth-prod.auth.ap-northeast-1.amazoncognito.com` が出る。
Apple でサインインするつもりの利用者に見慣れないドメインを見せることになり、
金銭を扱うアプリでは離脱要因になる。

**審査上の問題ではない。** ガイドラインの論点ではなく、Auth0・Firebase・Cognito を
使う多数のアプリで同じ表示になる。1.0 を止める理由にはならないと判断した（2026-09-07）。

**1.0 で直さなかった理由。** ドメインを変えると次が連鎖し、ビルドし直しになる。

| 変える先 | 作業 |
|---|---|
| Cognito | カスタムドメイン作成（本番変更）、Route53 に A レコード |
| Apple Services ID | Domains と Return URLs を貼り直し |
| Google Cloud Console | 承認済みリダイレクトURIを貼り直し |
| `mobile/src/config.js` の `authDomain` | **アプリのコード変更＝再ビルド** |

切り替えの瞬間、旧ドメインを焼き込んだ既存アプリが認証できなくなる。
移行の段取り（両ドメイン併存の可否、強制アップデートの要否）を先に決めること。

**下地は確認済み（2026-09-07）。**

- Route53 ホストゾーン `kurofukubo.com` あり
- ACM(us-east-1) の `app.kurofukubo.com` 証明書に **`*.kurofukubo.com` が含まれる**
  → `auth.kurofukubo.com` を**新規発行なしで覆える**。証明書の待ち時間はゼロ
  （Cognito のカスタムドメインは us-east-1 の証明書が必須）

**緩和策（未実施）。** ドメインを変えずとも、外部ログインのボタン付近に
「Apple / Google の認証画面が開きます（安全のため端末のブラウザで行われます）」
と添えるだけで印象は変わる。`app/connect.jsx` のテキスト追加だけで済む。
