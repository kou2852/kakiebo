// 仕訳帳の一覧に挟むバナー広告の位置（2026-10-21 復活。2026-10-11 に一度取りやめた案）。
// 検証: node src/utils/listAd.check.mjs
//
// ・先頭3件のあとに1つ（＝一覧の4行目）。3件以下のときは、最後の行のあとに付ける（1件でも付ける）
// ・仕訳が1件も無いときは出さない（2026-10-21 指示）
// ・広告は仕訳ではない。差し込んだ行は { __ad: true } で見分ける（keyExtractor・行の描画・まとめて選ぶ対象から外す）

export const AD_AFTER = 3;

/** 広告を挟む位置（rows の何番目の前か）。出さないときは null */
export function adSlot(count) {
  if (count < 1) return null;
  return Math.min(count, AD_AFTER);
}

/** rows に広告の行を1つ差し込んだ配列。show が偽、または出さない件数なら rows をそのまま返す */
export function withAd(rows, show) {
  const at = show ? adSlot(rows.length) : null;
  if (at === null) return rows;
  return [...rows.slice(0, at), { __ad: true, id: '__ad' }, ...rows.slice(at)];
}
