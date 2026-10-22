# App Store 掲載内容（iOS 1.0.4 / ビルド 30）

ASC に貼る順に並べてある。ブラウザで入力するときは、この文面をそのままコピーする。
ここに無いもの（スクリーンショット、年齢区分、価格など）は `SUBMISSION.md` の値を使う。

**名前・サブタイトル・キーワード・説明文・プロモーション用テキストの正は `aso-1.0.3.md`（1.0.3 で入力済み。1.0.4 では変えない）。**
このファイルは 1.0.4 の最新情報・審査メモ・アプリのプライバシー・チェックリストだけを持つ。

⚠ **デモアカウントのパスワードはこのファイルに書かない。** `SUBMISSION.md` の審査用の欄から手で貼る（チャットにも貼らない）。

**状態（2026-10-22）: ASC にバージョン 1.0.4 の下書きを作成・保存済み（ビルド 30・最新情報・審査メモ）。Appのプライバシーは 6 データタイプを追加して公開済み（2026-10-22・本人の許可）。審査への提出は未実施。提出するのは本人（私は押さない）。**

---

## 1. バージョンとビルド

| 項目 | 値 |
|---|---|
| バージョン | 1.0.4 |
| ビルド | **30**（Build ID `8121cf7c-f3d4-47e9-97de-78ed8c2dd2a0`、2026/10/21 ビルド・TestFlight へ提出済み・本人が実機で動作確認済み） |
| コミット | `449b7fa` |
| runtimeVersion | `ba25b163fbb945db3859a09aae61603356ebf366` |
| 更新チャンネル | **`testflight`**（`eas.json` の testflight プロファイルで作ったため。1.0.3 までは `production`） |

**OTA の注意（重要）:** このビルドを審査に出して公開すると、App Store の利用者の端末は `testflight` チャンネルから更新を取りに行く。
今後の iOS 1.0.4 向けの OTA は **`eas update --channel testflight --platform ios`**。`production` に出しても届かない
（Android の 1.0.4 は `production` なので、チャンネル名が OS で違う）。
1.0.3 の端末（`e5094af6…`）は `production` のまま。

**配信済みの OTA（1.0.4 のランタイムにだけ届く）:** 資産の使いみちの基準日の修正（`1220fd3`・iOS group `7aaffb6a`）。
ビルド 30 の本体の JS には入っていないので、審査員が入れた直後の初回起動だけは修正前の動き（OTA は起動後に取得・次の起動で反映）。審査上は影響しない。

---

## 2. 最新情報（What's New・日本語・4000字以内）

1.0.3 から増えた分。アプリのベルの更新情報（`frontend/src/config/updates.js` の 1.0.4 の記事）と同じ内容。

```
1.0.4 の変更点です。

・はじめて使うとき、ホームの紹介カードと「ツアー」で、口座と残高・カードの締め日・記帳・タグ・毎月のお金の順に、実際に画面を押しながら設定できるようになりました。
・仕訳帳に「元帳」を追加しました。科目を選ぶと、その科目の明細を日付順に、繰越・借方・貸方・差引残高つきで見られます。
・ホームに「資産の使いみち」を追加しました。口座ごとに、そのお金がどのタグ（目的）のものかを帯で見られます。口座の行を押すと、タグごとの額と割合が開きます。
・CSV取込を作り直しました。列の一番上を押して、日付・摘要・金額・出金額・入金額・借方科目・貸方科目の列を選んで取り込みます。出金と入金が別の列の銀行の明細にも対応しました。帳簿に無い科目名は、名前ごとにこの帳簿の科目を選べます。選んだ割り当ては保存でき、同じ形の CSV では自動で選ばれます。
・レポートを「財務諸表」と「カード」の2つに分けました。財務諸表では、横にスライドして貸借対照表・損益計算書・キャッシュフローを行き来できます。資産と費用のカードには円グラフが入りました。
・仕訳帳のカレンダーを、横にスライドして月を移せるようになりました。
・プリセットに、明細を何行でも登録できるようになりました（金額は空でもかまいません）。記帳では複合仕訳の形で開きます。
・ホームに出す項目を選んで並べ替えられます（設定の「ホームの表示」）。外観では、テーマカラーを9色から選べます。
・タグ・口座・プリセット・ルール・定期取引・科目の並びを、右上の「並び替え」から、行のつまみを動かして変えられるようになりました。
・定期取引に「飛ばす」と「先に記帳」を追加しました。今回の分だけ予定を見送ることや、次の予定日の分を前もって記帳することができます。
・定期取引で、複数の科目に分けて登録したり、タグを分けたりできるようになりました（「明細を分ける」）。
・純資産に入れる科目の組み合わせを、いくつか作ってホームに出せるようになりました。
・ホームの純資産のカードの目のボタンで、人前でも金額を伏せられます。
・ホームの右下の「広告を消す」から、動画広告を見て今日の広告を消せます。記帳の全画面広告があと何件で出るかも分かります。
・仕訳帳の一覧に、広告が1つ入ります。
・ストアに新しいバージョンがあるときは、「新しいバージョンがあります」と案内します。
```

---

## 3. 掲載文・プロモーション用テキスト・スクリーンショット

- 名前・サブタイトル・キーワード・説明文は **変更しない**（`aso-1.0.3.md`。1.0.3 で入力済み。ASC の画面で、1.0.3 の値が引き継がれているか確認する）。
- プロモーション用テキストが空欄になっていないか確認する（空なら `aso-1.0.3.md` 5章の文）。
- スクリーンショットは 1.0.3 のもの（iPhone 6枚・iPad 5枚）のまま出す案。1.0.4 で見た目が変わったのはホーム（資産の使いみち・紹介カード）・レポート（2タブ）・外観。
  撮り直すかは判断（Guideline 2.3.3: 実際の使用画面であること。今の画面と大きく食い違っていなければ差し替え不要）。

---

## 4. 審査メモ（App Review Information → Notes・英文）

**ASC には、1.0.3 から引き継いだメモ（約1,800字・Password 入り・初回画面は「はじめる／あとで」の書き方）が入っていた。1.0.4 では置き換えず、同じ欄を次の4か所だけ直した（2026-10-22）:** ① 初回セットアップのあとのツアーの一文 ② 広告に「仕訳帳の一覧に1つ」 ③ 動画広告の入口に「ホーム右下の広告を消す」 ④ 6 項目目（計測の出来事）を末尾に追加。Password の行はそのまま（長さ 14 を確認）。下の全文はゼロから書くときの参考で、ASC の実際の文面とは異なる（特に冒頭の "Start" の書き方と、2 章の広告の書き方）。

**1.0.2 のメモから変えた点:**
- 初回画面に「アカウントなしで始める」ボタンは **もう無い**（1.0.4 のオンボーディングの作り直しで、「はじめる」を押すとそのまま端末だけで使える形になった。ログインは「アカウントをお持ちの方はログイン」）。旧メモの "Start without an account" は審査員を迷わせるので直した。
- 広告は、ホーム・レポートに加えて仕訳帳の一覧にも1つ入る（4行目。少ないときは最後。0件は出ない）。
- 動画広告（設定の「広告」またはホーム右下の「広告を消す」）で、その日の広告を消せる。
- 初回起動のツアー（ホームの紹介カード → 「ツアー」）を足した。
- 新しい権限・外部送信・課金は無い（自前の計測は出来事の名前だけを自社ドメインへ送る。下の 5 章）。

```
This app works fully without an account. On the first screen, tap "はじめる"
(Start) and you can use every feature; the ledger is stored on the device
only. After the short setup, a guided tour on the home screen walks through
the main screens (you can dismiss it with "あとで").

An account is optional and only used to sync the same ledger across devices.
To check the sync feature, tap "アカウントをお持ちの方はログイン" on the first
screen (or Settings > アカウントと同期) and use the demo account below.

  Email:    appreview@kurofukubo.com
  Password: (paste from docs/appstore/SUBMISSION.md, do not commit it here)

Notes for review:

1. Encryption. The app can encrypt the ledger on the device before uploading it
   (Settings > 暗号化・バックアップ). The key never leaves the device. We use
   only standard algorithms (AES-256-GCM, PBKDF2-SHA256).

2. Ads. For guests, a full-screen ad is shown after every 8 journal entries
   (not while signed in). The app also shows AdMob banners on the home and
   reports screens and one in the journal list. Ads are non-personalized only;
   we do not request App Tracking Transparency permission and do not use IDFA.
   A rewarded video (Settings > 広告, or "広告を消す" at the bottom right of
   the home screen, shown only when the user taps it) hides all ads until the
   end of the day.

3. Account deletion. Settings > アカウントと同期 > アカウント削除に進む deletes
   the account and all server-side data (Guideline 5.1.1(v)). A reason can be
   entered on the next screen; it is optional.

4. Face ID. Used only to unlock the app and to retrieve the locally stored
   encryption key. Never sent anywhere.

5. Receipt scanning (撮って記帳). Text recognition runs on the device (Apple
   Vision). The image and the recognized text are never sent to a server.

6. Usage events. The app sends only the name of a few milestones (for example,
   that the first entry was saved, or that the app is still in use after 7 or
   30 days) as a plain GET request to our own domain (app.kurofukubo.com), at
   most once per event per device. No amounts, account names, descriptions or
   device identifiers are sent. No third-party analytics SDK is used.
```

**注意**: `Password:` の行は、提出時に `SUBMISSION.md` の値を手で入れる。このファイルには値を書かない。
⚠ 「アカウントをお持ちの方はログイン」「ツアー」の文言は、ビルド 30 の実機（または TestFlight）の画面と一致するか、貼る前に確認する。

---

## 5. Appのプライバシー（ASC → アプリのプライバシー）

**ASC の実際の申告（2026-10-22 に画面で確認。`SUBMISSION.md` の記録とは違い 7 種類だった）:** メールアドレス・その他の財務情報・ユーザID（以上、アプリの機能・ユーザに関連付け）／デバイスID（サードパーティ広告）・製品の操作（サードパーティ広告・アナリティクス）・広告データ（サードパーティ広告）・その他の診断データ（アナリティクス）（以上、関連付けなし）。

**追加するのは次の 6 データタイプ（すべて「トラッキング: いいえ」）。** 製品の操作・広告データ・デバイスID・ユーザID・メール・財務は変更なし。

| データ種別 | 用途 | ユーザに関連付け | 根拠 |
|---|---|---|---|
| 位置情報 → おおよその場所 | サードパーティ広告・アナリティクス | いいえ | AdMob SDK が IP から推定 |
| ユーザコンテンツ → カスタマーサポート | アプリの機能 | はい | ログイン後の問い合わせ（本文・返信） |
| ユーザコンテンツ → その他のユーザコンテンツ | アナリティクス | いいえ | 匿名のご意見・退会理由 |
| 使用状況データ → その他の使用状況データ | アナリティクス | はい | 最終利用日（アカウントごと） |
| 診断 → クラッシュデータ | サードパーティ広告・アナリティクス | いいえ | AdMob SDK |
| 診断 → パフォーマンスデータ | サードパーティ広告・アナリティクス | いいえ | AdMob SDK |

**実施結果（2026-10-22）:** 6 つとも入力して公開した。入力画面で質問文が 2 行になる項目（クラッシュ・パフォーマンスなど）は、「はい／いいえ」の位置がずれるので、押したあとに必ず選択状態を確かめる（パフォーマンスは一度「はい」を選んでしまい、公開前に戻して直した）。

**操作の注意（ASC）:** データタイプのチェック → 「続ける」→ 追加した各タイプの「〜を設定」を 1 つずつ開く（用途 → 関連付け → トラッキングの順）。
**各モーダルの最後のボタンは「公開」で、押すと App Store に表示されるプライバシー情報が即時に更新される**（配信中の 1.0.3 の商品ページにも出る。バージョンの審査とは別）。途中のデータタイプだけが公開された状態を避けるため、6 つの回答を決めてから、本人の許可を得て順に押す。
「トラッキング」の質問は「いいえ」（非パーソナライズ広告のみ・ATT なし・IDFA なし）。プライバシーポリシーの URL は `https://kurofukubo.com/privacy.html`（2026-10-22 に改定版を公開済み）。

---

## 6. 提出前チェック（ブラウザで入力するときの順）

- [x] プライバシーポリシー・利用規約の改定版を公開した（2026-10-22）
- [x] 更新情報（アプリのベル）の 1.0.4 の記事を配信した（2026-10-22）
- [x] ASC にログインした（本人）
- [x] Appのプライバシーを 5 章のとおりに直し、公開した（2026-10-22。再読み込みで 13 種類・警告なし・6 つとも狙いどおりの用途と関連付けを確認。バージョン 1.0.4 は「提出準備中」のまま・審査は始まらない）
- [x] バージョン 1.0.4 を作った（ASC で「提出準備中」・2026-10-22）
- [x] ビルドを **30** に差し替えた（TestFlight の 1.0.4 のビルド 30。輸出コンプライアンスの確認が出たら、1.0.3 と同じ回答）
- [x] 最新情報（2章）を貼った（18行・1,018字）
- [x] 名前・サブタイトル・キーワード・説明文は 1.0.3 の値のまま引き継がれていた。プロモーション用テキストは空欄だったので、`aso-1.0.3.md` の文（94字）を入れた
- [ ] スクリーンショット（1.0.3 のまま出すか）を決めた
- [x] 審査メモを直した（引き継ぎの文面を 4 か所だけ。Password は元のまま）
- [ ] リリース方法を決めた（自動 / 手動）。**ASC は 1.0.3 から引き継いで「自動」のまま**
- [ ] `https://app.kurofukubo.com/updates.json` が 200 で返り、1.0.4 の記事が 16 項目ある
- [ ] 提出するのは **本人**（私は押さない）

---

## 7. 変更履歴

- 2026-10-22: 1.0.4 / ビルド 30 向けに作成。ASC にバージョン 1.0.4 の下書きを作り、ビルド・最新情報・プロモーション用テキスト・審査メモを入れて保存した。Appのプライバシーに 6 データタイプを追加して公開した。審査提出はまだ。
