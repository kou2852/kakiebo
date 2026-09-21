// ストアの評価を聞くかどうかの判定。画面やネイティブに依存しない部分だけを置く。
// 検証: node src/utils/reviewPrompt.check.mjs

const DAY = 24 * 60 * 60 * 1000;

// 続けて使っている人にだけ聞く
export const MIN_JOURNALS = 20;
// 使い始めて3日。初日に20件入れた人（最初の登録中）には聞かない
export const MIN_DAYS_SINCE_FIRST_USE = 3;
// 自分で間隔を空ける。iOS 側も365日に3回までしか出さないが、そこに頼らない
export const MIN_DAYS_BETWEEN_ASKS = 90;

export function shouldAsk({ journals, firstUseAt, lastAskedAt, now, adShown }) {
  // 全画面広告を出した直後には重ねない
  if (adShown) return false;
  if (!Number.isFinite(firstUseAt)) return false;
  if (journals < MIN_JOURNALS) return false;
  if (now - firstUseAt < MIN_DAYS_SINCE_FIRST_USE * DAY) return false;
  if (Number.isFinite(lastAskedAt) && now - lastAskedAt < MIN_DAYS_BETWEEN_ASKS * DAY) return false;
  return true;
}
