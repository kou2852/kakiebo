# API仕様書 — 複式家計簿 SaaS（kurofukubo）

最終更新: 2026-06-11

## 1. 共通仕様

| 項目 | 内容 |
|---|---|
| プロトコル | HTTPS（REST / JSON） |
| ベースURL(prod) | `https://ecbjdndcbe.execute-api.ap-northeast-1.amazonaws.com/prod` |
| ベースURL(dev) | `https://9be6dndzzi.execute-api.ap-northeast-1.amazonaws.com/dev` |
| 認証 | Cognito IDトークン（JWT）を `Authorization: Bearer <idToken>` で送付 |
| Content-Type | `application/json` |
| 文字コード | UTF-8 |

### 認証・認可
- すべての業務エンドポイントは Cognito Authorizer による JWT 検証が必須。
- サーバーは JWT の `sub` を `userId` として扱い、`PK=USER#<userId>` のデータのみ操作（テナント分離）。
- `OPTIONS`（プリフライト）は認証不要（`Authorizer: NONE`）。

### CORS
- レスポンスに以下を付与:
  - `Access-Control-Allow-Origin: <ALLOWED_ORIGIN>`（prod = `https://app.kurofukubo.com`）
  - `Access-Control-Allow-Headers: Content-Type,Authorization`
  - `Access-Control-Allow-Methods: GET,POST,PUT,DELETE,OPTIONS`
- プリフライト `OPTIONS` は `204 No Content` を返す。

### ステータスコード
| コード | 意味 |
|---|---|
| 200 | 取得・更新成功 |
| 201 | 作成成功 |
| 204 | 本文なし成功（削除・プリフライト） |
| 400 | バリデーションエラー |
| 401 | 未認証 |
| 404 | 対象なし |
| 500 | サーバーエラー |

### エラー形式
```json
{ "error": "エラーメッセージ" }
```

---

## 2. エンドポイント一覧

| メソッド | パス | 説明 | 認証 |
|---|---|---|---|
| GET | /api/journals | 仕訳一覧（期間指定可） | 要 |
| POST | /api/journals | 仕訳作成 | 要 |
| PUT | /api/journals/{id} | 仕訳更新 | 要 |
| DELETE | /api/journals/{id} | 仕訳削除 | 要 |
| GET | /api/accounts | 勘定科目一覧 | 要 |
| POST | /api/accounts | 科目作成 | 要 |
| PUT | /api/accounts/{id} | 科目更新 | 要 |
| DELETE | /api/accounts/{id} | 科目削除（sys=1不可） | 要 |
| GET | /api/tags | タグ一覧 | 要 |
| POST | /api/tags | タグ一括保存 | 要 |
| GET | /api/wallets | 口座一覧 | 要 |
| POST | /api/wallets | 口座一括保存 | 要 |
| GET | /api/budgets | 予算一覧 | 要 |
| POST | /api/budgets | 予算一括保存（全置換） | 要 |
| GET | /api/export | 全データ取得 | 要 |
| POST | /api/import | 全データ取込 | 要 |
| OPTIONS | （全パス） | CORSプリフライト | 不要 |

---

## 3. 仕訳 Journals

### GET /api/journals
クエリ: `start`, `end`（任意, `YYYY-MM-DD`）。両方指定時は GSI1 で日付範囲検索。

レスポンス 200:
```json
[
  {
    "id": "k3p9a1",
    "date": "2026-01-15",
    "desc": "コンビニ",
    "lines": [
      { "accountId": "e01", "side": "dr", "amount": 580, "taxRate": 10 },
      { "accountId": "a01", "side": "cr", "amount": 580, "taxRate": 0 }
    ]
  }
]
```

### POST /api/journals
リクエスト:
```json
{
  "date": "2026-01-15",
  "desc": "コンビニ",
  "lines": [
    { "accountId": "e01", "side": "dr", "amount": 580 },
    { "accountId": "a01", "side": "cr", "amount": 580 }
  ]
}
```
バリデーション（`validateLines`）:
- `lines` は2行以上。
- 各行に `accountId` 必須、`side ∈ {dr, cr}`、`amount` は正の数値。
- 借方合計 = 貸方合計（誤差0.01以内）。

レスポンス 201: 作成された仕訳（`id` 付与）。エラー 400: `{ "error": "借方(...)と貸方(...)が一致しません" }` 等。

### PUT /api/journals/{id}
リクエストは POST と同形。レスポンス 200: 更新後の仕訳。対象なし 404。

### DELETE /api/journals/{id}
レスポンス 204。

---

## 4. 勘定科目 Accounts

### GET /api/accounts
レスポンス 200:
```json
[ { "id": "a01", "code": "1001", "name": "現金", "type": "asset", "sys": 1 } ]
```

### POST /api/accounts
リクエスト:
```json
{ "name": "電子マネー", "type": "asset", "code": "1004", "note": "" }
```
- `type ∈ {asset, liability, equity, income, expense}`。
- 作成科目は `sys=0`。レスポンス 201。

### PUT /api/accounts/{id}
- 更新可能フィールドのみ反映: `name, type, code, note, ccClose, ccDay, ccDelay, ccFrom`（`sys` 等の特権フィールドは変更不可）。
- レスポンス 200。対象なし 404。

### DELETE /api/accounts/{id}
- `sys=1`（システム科目）は削除不可 → 400。
- レスポンス 204。

---

## 5. タグ / 口座 / 予算（一括保存系）

POST は配列で一括保存（単体オブジェクトも可）。

### GET/POST /api/tags
保存リクエスト:
```json
[ { "id": "t1", "name": "生活費", "color": "#6090d8", "note": "" } ]
```
レスポンス 201: 保存済みタグ配列。

### GET/POST /api/wallets
保存リクエスト:
```json
[ { "id": "w1", "name": "日常口座", "accountId": "a02", "defaultTagName": "", "defaultTagColor": "#888" } ]
```

### GET/POST /api/budgets
- 既存予算を全削除してから登録（全置換）。`amount > 0` のみ保存。`SK=BUDGET#<accountId>`。
```json
[ { "accountId": "e01", "amount": 50000 } ]
```

---

## 6. エクスポート / インポート

### GET /api/export
全エンティティをまとめて取得。
```json
{
  "accounts": [], "journals": [], "tags": [], "wallets": [],
  "budgets": [], "presets": [], "recurring": [], "rules": [], "allocs": [],
  "exportedAt": "2026-06-11T03:00:00.000Z"
}
```

### POST /api/import
- リクエストは export と同形（最低 `accounts` 配列が必須、無ければ 400）。
- クライアント由来の `PK/SK/GSI1SK` は破棄し、サーバーが `id`/`accountId`/`tagId` から権威的に再付与。
- 同一IDは上書き、新規は追加（マージ）。
- 上限 **10,000 件**超で 400。
- レスポンス 201: `{ "imported": <件数> }`。

---

## 7. データ型

各エンティティのフィールド定義（型・必須・説明）は `DATA_MODEL.md` を参照。
主要型: `Account`, `Journal`(+`Line`,`Split`), `Tag`, `Wallet`, `Budget`, `Preset`, `Recurring`, `Rule`, `Alloc`。
