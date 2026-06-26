# データモデル設計書

## エンティティ一覧

### Account（勘定科目）
| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| id | string | ○ | UID |
| code | string | | 科目コード（例: "1001"） |
| name | string | ○ | 科目名（例: "現金"） |
| type | enum | ○ | "asset" / "liability" / "equity" / "income" / "expense" |
| sys | number | | 1=システム科目（削除不可） |
| note | string | | 備考 |
| ccClose | number | | CC締め日（負債科目のみ） |
| ccDay | number | | CC引落日 |
| ccDelay | number | | CC引落月ずれ（1=翌月, 2=翌々月） |
| ccFrom | string | | CC引落元の資産科目ID |

### Journal（仕訳）
| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| id | string | ○ | UID |
| date | string | ○ | "YYYY-MM-DD" |
| desc | string | | 摘要 |
| lines | Line[] | ○ | 仕訳行（最低2行、借方合計=貸方合計） |

### Line（仕訳行）
| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| accountId | string | ○ | 勘定科目ID |
| side | enum | ○ | "dr"（借方）/ "cr"（貸方） |
| amount | number | ○ | 金額（正の整数） |
| taxRate | number | | 消費税率（0, 8, 10） |
| splits | Split[] | | タグ配分 |

### Split（タグ配分）
| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| tagId | string | ○ | タグID |
| amount | number | ○ | 配分額 |

### Tag
| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| id | string | ○ | UID |
| name | string | ○ | タグ名 |
| color | string | ○ | HEXカラー |
| note | string | | 備考 |

### Wallet（口座）
| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| id | string | ○ | UID |
| name | string | ○ | 口座名 |
| accountId | string | ○ | 紐づく勘定科目ID |
| defaultTagName | string | | デフォルトタグ名 |
| defaultTagColor | string | | デフォルトタグ色 |
| note | string | | 備考 |

### Budget（月間予算）
| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| accountId | string | ○ | 費用科目ID |
| amount | number | ○ | 月額予算 |

### Preset（仕訳プリセット）
| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| id | string | ○ | UID |
| walletId | string | ○ | 所属口座ID |
| type | enum | ○ | "in" / "out" |
| name | string | ○ | プリセット名 |
| desc | string | | 摘要テンプレート |
| lines | PresetLine[] | ○ | 仕訳行テンプレート |

### Recurring（定期取引）
| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| id | string | ○ | UID |
| name | string | ○ | 取引名 |
| frequency | enum | ○ | "monthly" / "weekly" / "yearly" |
| day | number | ○ | 実行日 |
| desc | string | | 摘要 |
| lines | RecLine[] | ○ | 仕訳行テンプレート |
| nextDate | string | ○ | 次回生成日 "YYYY-MM-DD" |

### Rule（自動分類ルール）
| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| id | string | ○ | UID |
| keyword | string | ○ | 摘要の部分一致キーワード |
| drAccountId | string | ○ | 借方科目ID |
| crAccountId | string | ○ | 貸方科目ID |
| tagId | string | | タグID |

### Alloc（手動タグ配分）
| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| accountId | string | ○ | 対象勘定科目ID |
| tagId | string | ○ | タグID |
| amount | number | ○ | 配分額 |

## 複式簿記のルール

### 勘定科目の区分と残高計算
| 区分 | 残高の計算 | 増加する側 |
|---|---|---|
| 資産 (asset) | 借方 - 貸方 | 借方 |
| 負債 (liability) | 貸方 - 借方 | 貸方 |
| 純資産 (equity) | 貸方 - 借方 | 貸方 |
| 収益 (income) | 貸方 - 借方 | 貸方 |
| 費用 (expense) | 借方 - 貸方 | 借方 |

### 仕訳の制約
- 1仕訳に最低2行（借方1行+貸方1行）
- 借方合計 = 貸方合計（貸借一致の原則）
- 金額は正の整数

### 財務諸表
- **貸借対照表（BS）**: 資産 = 負債 + 純資産（全期間の累計残高）
- **損益計算書（PL）**: 収益 - 費用 = 当期純利益（期間内の残高）
- **キャッシュフロー計算書（CF）**: 未実装。Step 2で実装予定

## DynamoDB テーブル設計

### キースキーマ
| PK | SK | 用途 |
|---|---|---|
| USER#\<userId\> | JOURNAL#\<id\> | 仕訳 |
| USER#\<userId\> | ACCOUNT#\<id\> | 勘定科目 |
| USER#\<userId\> | TAG#\<id\> | タグ |
| USER#\<userId\> | WALLET#\<id\> | 口座 |
| USER#\<userId\> | PRESET#\<id\> | プリセット |
| USER#\<userId\> | BUDGET#\<accountId\> | 予算 |
| USER#\<userId\> | RECURRING#\<id\> | 定期取引 |
| USER#\<userId\> | RULE#\<id\> | 自動分類ルール |
| USER#\<userId\> | ALLOC#\<acctId\>#\<tagId\> | タグ配分 |
| USER#\<userId\> | PROFILE | ユーザー設定 |

### GSI1（日付検索用）
| PK | GSI1SK | 用途 |
|---|---|---|
| USER#\<userId\> | \<date\> | 仕訳の期間検索 |
