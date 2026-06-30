# design-sync 引き継ぎメモ（kurofukubo UI components）

最終同期: 2026-06-30
Design プロジェクト: https://claude.ai/design/p/c7d649c3-9221-41fa-ae7a-345d37889a7e
対象コンポーネント（3）: `Modal` / `InfoTip` / `EmptyState`（いずれも `frontend/src/components/Common/`）

## このリポジトリは「アプリ」であってコンポーネントライブラリではない
`frontend/package.json` には `main`/`module`/`exports` が無く、`node_modules/<pkg>` も無い。
design-sync は本来 npm パッケージ前提なので、アプリを無理やり束ねるための“しかけ”が複数ある。
**再同期時はまずここを読むこと。** 素直に再実行すると同じ所で詰まる。

## 再同期で壊れやすい点（リスクと対処）

1. **エントリは shim 経由（`frontend/.ds-entry.js`）**
   実コンポーネントは `export default`。バンドルのグローバル（`window.KurofukuboUI`）は
   synth の `export *` が default を拾わないため、`.ds-entry.js` で
   `export { default as Modal } from '...'` のように **名前付き再export** している。
   `--entry ./frontend/.ds-entry.js` を渡すことで synthEntry=false になり実エントリがバンドルされる。
   → コンポーネントを足すときは `.ds-entry.js` にも名前付きexportを追加する。

2. **CSS は自己完結版（`frontend/.ds-styles.css`）**
   元の `global.css` は `@import './variables.css'` を含み、cssEntry をそのままコピーすると
   バンドル内 `_ds_bundle.css` に解決不能な `@import` が残る（`[CSS_IMPORT_MISSING]`）。
   対処として `.ds-styles.css` に **Google Fonts の @import + variables.css 全文 + global.css（variables の import 行を除く）** を
   インライン展開してある。`variables.css`/`global.css` を変更したら **このファイルにも反映**すること。

3. **既定テーマがダーク → プレビューは `data-theme="light"` で包む**
   トークンの既定（`:root`）はダークテーマ。白カード上にそのまま置くと文字が白で見えない。
   各プレビュー（`.design-sync/previews/*.tsx`）は祖先に `data-theme="light"` を付けている。
   新規プレビューも必ず同様に包む。

4. **Modal のオーバーレイ無効化（`overrides.Modal.cardMode:"single"` + `.mo{position:static}`）**
   Modal は `position:fixed` でビューポート中央に出るため、プレビューカード内だとタイトルが見切れる。
   コンポーネント本体は変更せず、プレビュー側で `.mo{position:static!important;align-items:flex-start}` を注入して回避。
   config の `overrides.Modal.cardMode:"single"` も合わせて維持。

5. **レンダーチェックはシステム Chrome を使用**
   chromium 未キャッシュ。`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` で playwright を入れ、
   `DS_CHROMIUM_PATH="C:/Program Files/Google/Chrome/Application/chrome.exe"` を指定して実行した。

6. **生成される `.d.ts` は緩い（`[key: string]: unknown`）**
   JSX 由来で型が拾えず、実プロップ名は型に出ない。実名は各 `*.prompt.md` と
   `.design-sync/conventions.md`（README ヘッダ）に記載。利用側はそちらを参照。

## アップロード順序（重要）
`_ds_needs_recompile`（センチネル）を立てた状態で、**`_ds_sync.json` を必ず最後に単独で write** する。
アンカーが先に上がると recompile 前に clean 判定されうる。

## 同期スコープ
今回は限定スコープ（Common の小物3点）。Layout/Journal/Dashboard など Context 依存の大物は未同期。
広げる場合は上記 1〜4 の“しかけ”を新コンポーネントぶん用意する必要がある。
