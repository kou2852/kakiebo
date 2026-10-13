// アップデートのポップアップを出すかどうか。画面や端末の保存から切り離した純関数（検証は updatePrompt.check.mjs）。
//
// 出すのは、ストアの最新版がいまのアプリより新しいときだけ。
// 「あとで」を押した版は、SNOOZE_DAYS のあいだ出さない（毎回の起動で出すとしつこい）。
// それより新しい版が出たら、待たずに出す。

export const SNOOZE_DAYS = 7;
const DAY = 24 * 60 * 60 * 1000;

/** '1.0.10' と '1.0.2' を数として比べる。a が b より古ければ true */
export function olderVersion(a, b) {
  const x = String(a).split('.').map(Number); const y = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0);
  }
  return false;
}

/**
 * current: いま動いているアプリの版／latest: ストアの最新版の情報 { version, url }（無ければ null）
 * snooze: 「あとで」を押した記録 { version, at }（無ければ null）／now: 現在時刻（ms）
 */
export function shouldPromptUpdate({ current, latest, snooze, now }) {
  if (!current || !latest?.version || !latest?.url) return false;
  if (!/^https:\/\//.test(latest.url)) return false; // 取ってきた値は信用しない。https のページだけ開く
  if (!olderVersion(current, latest.version)) return false;
  if (snooze?.version === latest.version && now - Number(snooze.at || 0) < SNOOZE_DAYS * DAY) return false;
  return true;
}
