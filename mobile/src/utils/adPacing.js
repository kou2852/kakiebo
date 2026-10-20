// 記帳の件数に応じて全画面広告を出す間隔。画面や広告 SDK に依存しない部分だけを置く。
// 検証: node src/utils/adPacing.check.mjs

// ゲストの新しい記帳が、この件数に達するたびに1回出す
// 2026-09-30 に 5 → 8 へ（ロードマップの判断。全画面広告はもともとゲストのみ）
export const EVERY = 8;

// 記帳を1件数える。ログイン中は数えない
export const bump = (count, guest) => (guest ? count + 1 : count);

// 出す番か。読み込めず出せなかった回は、件数を戻さずに次の記帳へ持ち越す（出す番になってから読み込む）
export const isDue = (count) => count >= EVERY;

// あと何件の記帳で出るか（保存の確認に出す。2026-10-17 追加）。出す番なら 0
export const left = (count) => Math.max(0, EVERY - count);
