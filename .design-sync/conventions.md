## kurofukubo UI — 使い方の規約

家計簿SaaS「kurofukubo」のアプリ内で実際に使われている実コンポーネントです（`window.KurofukuboUI`）。いずれもプレゼンテーション系の小さな部品で、Reactのプロバイダ（Context）は不要です。

### テーマ（必須の前提）
配色・文字色はCSSカスタムプロパティ（トークン）で表現されます。トークンは2系統あり、**既定（`:root`）はダークテーマ**です。アプリの通常表示は**ライトテーマ**なので、ライトで見せたいときは祖先要素に `data-theme="light"` を付けてください（CSS変数はDOMの親から継承されるので、`Modal` のような `position:fixed` 要素にも効きます）。

```jsx
<div data-theme="light">
  <Modal open title="…" onClose={fn} footer={…}>…</Modal>
</div>
```

未指定だとダーク（明るい文字）になり、白背景では文字が見えません。

### スタイルの流儀
2層あります。**Tailwind等の独自クラスを新設しないでください。** この系のクラス／トークンだけを使います。

- **共通クラス（ボタン等）**: `btn` を基底に、`btn-p`（プライマリ=teal） / `btn-g`（ゴースト） / `btn-d`（危険=red） / `btn-s`（小）。例: `<button className="btn btn-p">保存</button>`
- **トークン（インラインstyleや独自レイアウトで使用）**:
  - 背景: `--bg0`〜`--bg4`（`--bg0`=アプリ地、`--bg1`/`--bg2`=カード面）
  - 文字: `--tx`（主） / `--tx2`（副） / `--tx3`（補助）
  - 罫線: `--bd` / `--bd2`
  - アクセント: `--ac`（teal） / `--ac2`、状態色 `--red` / `--grn` / `--blu` / `--pur`

  例: `<div style={{ color: 'var(--tx2)', border: '1px solid var(--bd)' }}>`

レイアウト調整は上記トークンを使ったインラインstyleで行い、新しいCSSクラスは増やさないでください。

### 真実のありか
- スタイル実体: `_ds_bundle.css`（`styles.css` から `@import`）。クラス名・トークン定義はここが最短。
- 各部品の使い方: `components/common/<Name>/<Name>.prompt.md`
- 型: `<Name>.d.ts`。ただし**このDSの型は緩い**（`props: [key: string]: unknown`）。実プロップ名は各 prompt.md と下の例を参照：
  - `Modal`: `open` / `onClose` / `title` / `wide` / `children` / `footer`
  - `EmptyState`: `icon` / `title` / `desc` / `action` / `media`
  - `InfoTip`: `text`（`?` にホバー/フォーカスで吹き出し）

### 最小の組み立て例
```jsx
<div data-theme="light" style={{ background: 'var(--bg1)' }}>
  <EmptyState
    icon="📝"
    title="まだ仕訳がありません"
    desc="最初の取引を記帳すると、ここに表示されます。"
    action={<button className="btn btn-p">記帳する</button>}
  />
</div>
```
