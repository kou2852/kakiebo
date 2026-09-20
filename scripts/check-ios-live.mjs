// iOSアプリが本当に App Store で公開されているか（ダウンロードできるか）を判定する。
//
// なぜ要るか:
//   公開後の告知（「公開しました」・App Storeのダウンロードバッジ）は、公開前に出すと
//   嘘になる。公開の瞬間を人間の記憶に頼らず機械で判定する。
//
// 判定:
//   ① Lookup API が resultCount=1 を返す（審査中・未登録なら0件）
//   ② 製品ページが 200 を返し、アプリ名が載っている
//   ③ 製品ページに「予約注文」の印が無い
//
//   ③ の印は `"expectedReleaseDate":"..."`。予約受付中のページにだけ値が入る。
//   実測（2026-09-21）: 当アプリ（予約中）= "2026年9月25日 リリース予定" が入る。
//   公開済みの Facebook(284882215)・Netflix(363590051) のページには値が無い。
//
// ⚠ Lookup の releaseDate を公開時刻として使ってはいけない（2026-09-21 に判明）。
//   あれは日付だけの値で、時刻は米国太平洋時間の0時に揃えられている。
//     当アプリ  2026-09-25T07:00:00Z（夏時間 UTC-7 の0時）
//     Facebook 2019-02-05T08:00:00Z（冬時間 UTC-8 の0時）
//   App Store Connect の設定（このアプリは「2026年9月25日 6:00 JST 以降に自動リリース」）とは
//   別物で、10時間ずれる。以前はこの値で「公開済みか」を判定していたため、実際に公開された後も
//   16:00 JST まで「未公開」と答えるところだった。
//
// 使い方:
//   node scripts/check-ios-live.mjs          … 公開なら exit 0、未公開なら exit 1
//   IOS_APP_ID=284882215 node scripts/check-ios-live.mjs   … 判定そのものを検証するとき
const APP_ID = process.env.IOS_APP_ID || '6806592989';
const COUNTRY = 'jp';
// ⚠ アプリ名入りのURLで確かめる。予約注文を公開した直後は、短い /app/id… だけ数分 404 だった（2026-09-14）。
const DEFAULT_PAGE = `https://apps.apple.com/${COUNTRY}/app/kurofukubo-%E8%A4%87%E5%BC%8F%E7%B0%BF%E8%A8%98%E3%81%AE%E5%AE%B6%E8%A8%88%E7%B0%BF/id${APP_ID}`;
const PAGE = process.env.IOS_APP_ID ? `https://apps.apple.com/${COUNTRY}/app/id${APP_ID}` : DEFAULT_PAGE;

// ⚠ process.exit() は使わない。Windows の Node では fetch の接続が残っているうちに呼ぶと
//    「Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)」で落ち、終了コードが 127 になる
//    （2026-09-14 に発生）。exitCode を立てて自然に終わらせる。
async function main() {
  const fail = (msg) => { console.error('✗ ' + msg); return 1; };

  const lookup = await fetch(
    `https://itunes.apple.com/lookup?id=${APP_ID}&country=${COUNTRY}`
  ).catch(() => null);
  if (!lookup || !lookup.ok) return fail('Lookup API に到達できません（ネットワークを確認してください）');

  const data = await lookup.json().catch(() => null);
  if (!data) return fail('Lookup API の応答を解釈できません');

  if (data.resultCount !== 1) {
    return fail(`まだ公開されていません（resultCount=${data.resultCount}）。\n`
      + '  「公開しました」の告知は公開日を待ってから出してください。');
  }

  const app = data.results[0];

  const page = await fetch(PAGE, { redirect: 'follow' }).catch(() => null);
  if (!page || page.status !== 200) return fail(`製品ページが開けません（status=${page ? page.status : 'なし'}）`);
  const html = await page.text().catch(() => '');

  // ページを読めたことの裏取り。読めていないのに「印が無い＝公開済み」と答えないため。
  if (!app.trackName || !html.includes(app.trackName)) {
    return fail('製品ページにアプリ名が見つかりません。ページの作りが変わった可能性があるので、判定せずに止めます');
  }

  const preorder = html.match(/"expectedReleaseDate"\s*:\s*"([^"]+)"/);
  if (preorder) {
    return fail(`まだ予約注文の受付中です（ページの表示: ${preorder[1]}）。`);
  }

  console.log('✓ 公開を確認しました');
  console.log(`  名前     : ${app.trackName}`);
  console.log(`  バージョン: ${app.version}`);
  console.log(`  公開日   : ${(app.currentVersionReleaseDate || '').slice(0, 10)}`);
  console.log(`  URL      : ${PAGE}`);
  return 0;
}

process.exitCode = await main();
