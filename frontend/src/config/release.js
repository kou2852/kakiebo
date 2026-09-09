// iOSアプリの公開状態。アプリ内の告知はすべてここを見る。
//
// live が false のあいだは「審査中」の案内、true にすると「公開しました」の案内に
// 切り替わる。告知を2種類そのまま置いておくのではなく、ここ1か所で切り替える。
//
// ⚠ live を true にしてよいのは、公開を確認したあとだけ。目視で判断しない。
//    node scripts/check-ios-live.mjs が通ってから変える。
//    App Store のページは公開するまで存在せず、未公開IDは 404 を返す
//    （実測 2026-09-09 審査待ち時点: iTunes Lookup が resultCount=0）。
//
// ⚠ date は実際に公開した日。これが更新情報の id になり、既読管理
//    （localStorage の kk_update_seen）のキーになる。あとから書き換えると、
//    既に読んだ人全員に未読の赤ドットが戻る。
export const IOS_APP = {
  live: false,
  date: '', // 公開した日。例: '2026-09-12'
  url: 'https://apps.apple.com/jp/app/id6806592989',

  // 審査に提出した日。公開前の案内で使う（この日付は事実として確認済み）。
  submittedOn: '2026-09-09',
};
