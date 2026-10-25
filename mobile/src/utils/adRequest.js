// 広告を要求する間隔（2026-10-25）。画面や広告 SDK に依存しない部分だけを置く。
// 検証: node src/utils/adRequest.check.mjs
//
// 仕訳帳の帯（ledgerRow）は、一覧を作り直すたびに新しい要求を出していた（一覧・カレンダー・元帳の切り替え、
// 0件の月、まとめて編集、遠くまでのスクロール）。同じ人から短い間に要求が重なると、2件目からはほぼ埋まらない。
// 2026-10-25 は 83件の要求に対して埋まったのが 11件（マッチ率 13%）だった。

// 同じ置き場所は、前の要求からこれだけあける。作り直されても、この間は要求し直さない
export const COOLDOWN_MS = 60 * 1000;

// 読み込みに失敗したときの取り直し。1回目は60秒後、以後は倍にする（60・120・240・480・960秒）
export const RETRY_MS = 60 * 1000;
export const MAX_RETRY = 5;

/** あと何ミリ秒待てば要求してよいか。まだ要求していなければ 0 */
export const cooldownLeft = (last, now) => (last == null ? 0 : Math.max(0, last + COOLDOWN_MS - now));

/** attempt 回目（0 始まり）の失敗のあと、取り直すまでの時間 */
export const retryDelay = (attempt) => RETRY_MS * 2 ** attempt;
