// ストアの評価を聞くかどうかの判定。画面やネイティブに依存しない部分だけを置く。
// 検証: node src/utils/reviewPrompt.check.mjs
//
// 2026-10-01 に条件を変えた（1.0.2）: 「20件以上 かつ 使い始めから3日」→「20件以上 または インストールから3日」。
// 両方そろうのを待つと、ほとんどの人に一度も聞けなかった。
// ⚠ 3日の起点はインストールした時点（初回起動）。最初の記帳からではない。

const DAY = 24 * 60 * 60 * 1000;

// どちらか一方を満たせば聞く
export const MIN_JOURNALS = 20;
export const MIN_DAYS_SINCE_INSTALL = 3;
// 自分で間隔を空ける。iOS 側も365日に3回までしか出さないが、そこに頼らない
export const MIN_DAYS_BETWEEN_ASKS = 90;

export function shouldAsk({ journals, installedAt, lastAskedAt, now, adShown }) {
  // 全画面広告を出した直後には重ねない
  if (adShown) return false;
  if (Number.isFinite(lastAskedAt) && now - lastAskedAt < MIN_DAYS_BETWEEN_ASKS * DAY) return false;
  if (journals >= MIN_JOURNALS) return true;
  return Number.isFinite(installedAt) && now - installedAt >= MIN_DAYS_SINCE_INSTALL * DAY;
}

// インストールした時刻として記録する値。初回起動のときに一度だけ決める。
// 1.0.1 以前から入れている人はインストール時刻が残っていないので、記録のある中で一番古い
// 「最初に記帳を保存した時刻」（review.firstUse）を使う。それも無ければ今（1.0.2 の初回起動）。
export function installTime({ legacyFirstUse, now }) {
  return Number.isFinite(legacyFirstUse) && legacyFirstUse > 0 && legacyFirstUse <= now ? legacyFirstUse : now;
}
