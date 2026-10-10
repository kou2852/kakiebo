// 「動画広告を最後まで見たら、その日は広告を消す」の判定。純関数。保存と画面は src/adFree.js。
//
// 「1日」は視聴から24時間ではなく、見た日の終わり（端末の現地時間の翌0時）まで。
// 朝に見ても夜に見ても「今日はもう広告なし」と分かりやすく、日をまたげば自然に戻る。
//
// 端末の時計を戻されても延びないように、見た時刻（setAt）を一緒に持つ。
//   ・いまが setAt より前なら（時計を戻した）無効にする
//   ・期限が setAt から1日（＋夏時間の余裕1時間）より先なら（改ざん）無効にする
const DAY_MS = 24 * 60 * 60 * 1000;
const SLACK_MS = 60 * 1000;
const DST_MS = 60 * 60 * 1000;

/** その日の終わり（翌日の0時）の時刻（ミリ秒） */
export function endOfDay(now = Date.now()) {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0, 0).getTime();
}

/** 動画を見終えたときに保存する値 */
export function grant(now = Date.now()) {
  return { until: endOfDay(now), setAt: now };
}

/** いま広告を消してよいか */
export function isActive(state, now = Date.now()) {
  if (!state || typeof state.until !== 'number' || typeof state.setAt !== 'number') return false;
  if (!(state.until > now)) return false;                     // 期限切れ
  if (now < state.setAt - SLACK_MS) return false;             // 時計を戻された
  if (state.until - state.setAt > DAY_MS + DST_MS) return false; // 期限が不自然に長い
  return true;
}
