---
title: "個人開発の家計簿に「運営者にも復号できない」ゼロ知識E2E暗号化を入れた（Web Crypto / エンベロープ暗号）"
tags:
  - 暗号
  - セキュリティ
  - WebCrypto
  - JavaScript
  - 個人開発
private: false
updated_at: ""
id: null
organization_url_name: null
slide: false
ignorePublish: false
---

家計簿アプリには、収入・貯金・借金という**最も見られたくない情報**が集まります。「運営者は見ません」と書くより、**そもそも運営者が復号できない設計**にしたかった。そこで Web Crypto API だけで **ゼロ知識（E2E）暗号化** を実装しました。外部ライブラリ依存ゼロ、サーバーには鍵も平文も渡しません。実装のキモを共有します。

> なお、作っているのは家計簿アプリ **[kurofukubo](https://kurofukubo.com/?utm_source=qiita&utm_medium=article)** です（紹介は末尾に）。

## 方針：「見ない約束」ではなく「見られない設計」

- **認証（Cognito）と暗号鍵を分離**する。ログインできること ≠ データを復号できること。
- **鍵・パスフレーズ・平文はサーバーに送らない／保存しない**。サーバーが持つのは“鍵を持たない暗号文”だけ。
- パスフレーズは Cognito のパスワードとは**別**（運営はログインは扱えても中身は読めない）。

## アーキテクチャ：エンベロープ暗号

鍵を2層に分けます。

- **DEK（Data Encryption Key）**：実データを暗号化するランダムな鍵（AES-256-GCM）
- **KEK（Key Encryption Key）**：パスフレーズから `PBKDF2-SHA256`（60万回）で導出し、**DEKをラップ（暗号化）する**鍵

さらに、パスフレーズを忘れても復元できるよう、**リカバリーキー（約140bit）からも別のKEKを作り、同じDEKをもう一重ラップ**します。

結果、サーバーに保存するのは次の `bundle` だけ。**平文の鍵は一切含まれません**：

```json
{
  "v": 1, "kdf": "PBKDF2-SHA256", "cipher": "AES-256-GCM", "iterations": 600000,
  "salt": "...", "wrappedDEK": "...",
  "recoverySalt": "...", "recoveryWrappedDEK": "..."
}
```

ポイントは **「データはDEKで暗号化、DEKだけをパスフレーズ/リカバリキーでラップ」** していること。これにより後述の“パス変更が激安”が効きます。

## コア実装（Web Crypto だけ）

KDF と鍵ラップ。`deriveKEK` を独立させておくと、後で Argon2id（libsodium）へ差し替えやすい。

```js
const subtle = globalThis.crypto.subtle;
const rand = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));
const PBKDF2_ITERATIONS = 600000;          // OWASP推奨水準
const NONCE_LEN = 12;                       // AES-GCM IV

// パスフレーズ + salt → KEK（AES-GCM鍵）
async function deriveKEK(passphrase, salt) {
  const base = await subtle.importKey('raw', new TextEncoder().encode(passphrase),
    'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

// DEKをKEKでラップ（raw鍵をAES-GCM暗号化）→ b64(nonce|ct)
async function wrapDEK(dek, kek) {
  const raw = new Uint8Array(await subtle.exportKey('raw', dek));
  const nonce = rand(NONCE_LEN);
  const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv: nonce }, kek, raw));
  return toB64(concat(nonce, ct));
}
```

セットアップ（有効化時）：DEKを生成し、**パスフレーズとリカバリキーで二重ラップ**して `bundle` を返す。`recoveryKey` は**一度だけ表示**して保存させます。

```js
export async function setupEncryption(passphrase) {
  const dek = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt','decrypt']);
  const salt = rand(16);
  const wrappedDEK = await wrapDEK(dek, await deriveKEK(passphrase, salt));

  const recoveryKey = generateRecoveryKey();        // 例: A1B2C-3D4E5-... 約140bit
  const recoverySalt = rand(16);
  const recoveryWrappedDEK = await wrapDEK(dek, await deriveKEK(recoveryKey, recoverySalt));

  return { dek, recoveryKey, bundle: {
    v: 1, kdf: 'PBKDF2-SHA256', cipher: 'AES-256-GCM', iterations: PBKDF2_ITERATIONS,
    salt: toB64(salt), wrappedDEK, recoverySalt: toB64(recoverySalt), recoveryWrappedDEK,
  }};
}
```

解錠・リカバリーは「ラップを解く」だけ。**鍵が違えば AES-GCM の復号が例外になる**ので、パスフレーズ照合のための別データは不要です。

```js
export async function unlock(passphrase, bundle) {
  return unwrapDEK(bundle.wrappedDEK, await deriveKEK(passphrase, fromB64(bundle.salt)));
}
export async function recover(recoveryKey, bundle) {
  return unwrapDEK(bundle.recoveryWrappedDEK, await deriveKEK(recoveryKey, fromB64(bundle.recoverySalt)));
}
```

データ本体の封緘/開封は DEK で：

```js
export async function seal(dek, obj) {          // JSON → b64(nonce|ct)
  const nonce = rand(NONCE_LEN);
  const ct = new Uint8Array(await subtle.encrypt({ name:'AES-GCM', iv:nonce }, dek,
    new TextEncoder().encode(JSON.stringify(obj))));
  return toB64(concat(nonce, ct));
}
```

## 設計上の“おいしい”ところ：パスフレーズ変更がほぼ無料

データはDEKで暗号化していて、**パスフレーズはDEKをラップしているだけ**。なので**パス変更＝DEKを新パスで再ラップするだけ**。データの再暗号化は不要です（数百件あろうと一瞬）。

```js
// 既存dekを新パスで再ラップ。データはそのまま
export async function changePassphrase(dek, newPassphrase, bundle) {
  const salt = rand(16);
  const wrappedDEK = await wrapDEK(dek, await deriveKEK(newPassphrase, salt));
  return { ...bundle, salt: toB64(salt), wrappedDEK };
}
```

リカバリキーの再発行も同じ理屈（新リカバリキーでDEKを再ラップ）。

## UX：ゼロ知識でも「毎回パス入力」にしない

ゼロ知識を貫くと「開くたびにパス入力」になりがちで体験が悪い。そこで：

- 解錠した **DEK（CryptoKey）を端末の IndexedDB に保持**し、再オープン時は**自動解錠**（パス不要）。鍵は**端末内だけに置き、サーバーには絶対に送らない**。
- 別端末・ブラウザデータ消去・鍵不一致のときだけ解錠画面へ。
- **リカバリキーは必須保存**（紛失＝復元不可なので、発行時にダウンロード/コピーを促し、未保存なら警告）。

## サーバー側：ただの“暗号文ストア”にする

サーバーは暗号文 `ct` と鍵 `bundle` を保存するだけ（`GET/POST /api/encdata`）。**平文の勘定データは持ちません**。暗号化を有効化したタイミングで、**それまでの平文データはサーバーから削除**します。借方・貸方の整合チェックのような“中身を見る処理”は、当然**クライアント側に移します**（サーバーは中身を見られないので）。

## 注意点・割り切り

- **リカバリキー紛失＝復元不可**。これはゼロ知識の宿命。UIで強く保存を促す。
- 既存ユーザーを壊さないよう **オプトイン**（デフォルトOFF）。有効化した人だけE2E。
- KDFは将来 Argon2id に上げられるよう関数を分離（`deriveKEK` 差し替えで移行可能に）。

## まとめ

Web Crypto だけで、依存ゼロ・サーバーに鍵を渡さない**ゼロ知識E2E**は十分実装できます。キモは **エンベロープ暗号（DEKをKEKでラップ）** で、これが「パス変更が激安」「リカバリキー併用」を素直に実現します。

---

## 作ったもの：kurofukubo（黒福簿）

この記事のE2Eは、自作の家計簿アプリ **kurofukubo** に実装したものです。「銀行連携しない・運営者にも中身が見えない」を売りにしたかった、というのが動機でした。

![一行入力→自動で複式仕訳→純資産に反映](https://kurofukubo.com/op.gif)

- 預金・証券・NISA/iDeCo・ローンまで含めた **純資産** を1画面で把握
- 「食費 1200 現金」と一行打つだけ → 裏で **複式簿記** の仕訳に自動変換
- **銀行連携なし**／**運営者にも中身が読めないE2E暗号化**に対応
- **完全無料・登録不要**（ゲストでそのまま試せる）

👉 登録なしで試す： https://app.kurofukubo.com/?guest&utm_source=qiita&utm_medium=article
