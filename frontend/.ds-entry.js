// design-sync 用の最小ライブラリエントリ。
// このアプリにはライブラリ出力(main/module/exports)が無いため、
// 同期対象の部品だけを「名前付き」で再エクスポートし、window.<global> に載せる。
export { default as Modal } from './src/components/Common/Modal.jsx';
export { default as InfoTip } from './src/components/Common/InfoTip.jsx';
export { default as EmptyState } from './src/components/Common/EmptyState.jsx';
