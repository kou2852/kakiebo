// 記帳の件数に応じて全画面広告を出す間隔。画面や広告 SDK に依存しない部分だけを置く。
// 検証: node src/utils/adPacing.check.mjs

// ゲストの新しい記帳が、この件数に達するたびに1回出す
export const EVERY = 5;

// 記帳を1件数える。ログイン中は数えない
export const bump = (count, guest) => (guest ? count + 1 : count);

// 出す番か。読み込みが間に合わず出せなかった回は、件数を戻さずに次の記帳へ持ち越す
export const isDue = (count) => count >= EVERY;

// 出す番の1件前から先に読み込んでおく。OK を押した瞬間に読み込みを始めても間に合わない
export const shouldPreload = (count) => count >= EVERY - 1;
