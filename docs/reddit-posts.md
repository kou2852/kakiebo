# Reddit / 個人開発コミュニティ 投稿原稿

> 目的：広告費ゼロで初期ユーザー＋率直なフィードバックを得る。
> 注意（重要）：各サブレディットには **自己宣伝ルール（9:1ルール等）** がある。投稿前に必ずそのコミュニティのルールを読み、コメントには誠実に返信すること。「貼って終わり」はBAN対象。

---

## 前提・到達範囲のリアルな見立て（先に共有）

- アプリUIは**日本語のみ**。→ 英語圏の大型サブ（r/SideProject, r/webdev 等）は読者が使えないのでCVRは低い。露出（被リンク・話のネタ）目的なら有効。
- 日本語サブ（r/ja, r/newsokur, r/japanlife など）は**母数が小さい**。バズより「数人の濃いFB」が現実的なリターン。
- 期待値：**爆発的流入ではなく、初期テスター獲得＋生の声**。ここを誤解しないこと。

---

## 案A：日本語サブ向け（r/ja など。FB獲得が主目的）

**タイトル**
複式簿記ベースの家計簿Webアプリを個人で作りました（完全無料・登録不要で試せます）。フィードバックください

**本文**
個人開発で、家計簿Webアプリ「kurofukubo（黒福簿）」を作っています。

「今月いくら使ったか」ではなく、**預金・投資（NISA/iDeCo）・ローンまで全部ひっくるめた“純資産”が先月より増えたか**を一目で見たくて、自分用に作り始めました。

特徴：
- 開くと真っ先に「家全体でいくら持ってるか（純資産）」が出る
- 入力は「食費 1200 現金」と一行打つだけ。裏で複式簿記の帳簿を自動生成
- 銀行と自動連携しない／暗号化をオンにすると運営者(自分)にも中身が読めない（E2E）
- **完全無料・登録不要**（「ゲストで試す」を押すだけ、データは端末内のみ）

👉 https://app.kurofukubo.com/?guest

まだ個人開発のベータです。とくに知りたいのは：
- 既存の家計簿（マネフォ/Zaim等）から乗り換える気になるか？ ならない理由は？
- 「複式簿記」と聞いて身構えるか／一行入力なら使えそうか
- 最初の画面で「何のアプリか」伝わるか

辛口歓迎です。よろしくお願いします。

---

## 案B：英語圏 indie 向け（r/SideProject 等。露出・被リンク目的）

**Title**
I built a free personal-finance web app that shows your *net worth* (assets − debts), not just monthly spending — feedback welcome

**Body**
Solo dev here. I wanted a budgeting app that answers “how much do we actually have?” — bank + investments (NISA/iDeCo) + loans rolled into one **net worth** number, updated as I log expenses.

- Double-entry bookkeeping runs under the hood, but you just type one line to record
- No bank linking; optional end-to-end encryption (even I can’t read your data)
- 100% free, no signup (guest mode), data stays on your device

⚠️ Note: the UI is **Japanese-only** right now, so it’s mainly useful if you read JP. Sharing for feedback on the concept / UX.

👉 https://app.kurofukubo.com/?guest

Would love thoughts on the net-worth-first framing and the “one line = a proper ledger” idea.

---

## 個人開発シェアサービス（登録して露出を増やす：Uが登録・Cが文面用意）

- Zenn / note … **記事はドラフト済み**（`docs/zenn-article-*.md`, `docs/note-article.md`）→ 公開するだけが最速の一手
- X（@pakupaku_x_x_x）… ポスト案は `docs/x-posts.md`
- その他JP個人開発系（ProductHunt日本枠/各種「作ったもの」紹介系）… 登録はUの作業。紹介文は案Bを流用可

---

## 投稿の進め方（Uの作業フロー）

1. まず Zenn / note を**公開**（最速・既にドラフト済み）
2. X で告知（`docs/x-posts.md`）
3. r/ja に 案A を投稿 → コメントに丁寧に返信（最重要）
4. 反応を見て r/SideProject に 案B
5. 流入と離脱を見て、刺さった訴求をLP冒頭コピーに反映（Cが対応）
