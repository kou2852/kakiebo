// iOSアプリが本当に App Store で公開されているか（ダウンロードできるか）を判定する。
//
// なぜ要るか:
//   公開後の告知（「公開しました」・App Storeのダウンロードバッジ）は、公開前に出すと
//   嘘になる。公開の瞬間を人間の記憶に頼らず機械で判定する。
//
// 判定:
//   iTunes Lookup API が resultCount=1 を返し、かつ製品ページが 200 を返すこと。
//   実測（2026-09-09、審査待ちの時点）では未公開は resultCount=0 / ページ 404。
//
// 使い方:
//   node scripts/check-ios-live.mjs          … 公開なら exit 0、未公開なら exit 1
const APP_ID = '6806592989';
const COUNTRY = 'jp';
// ⚠ アプリ名入りのURLで確かめる。予約注文を公開した直後は、短い /app/id… だけ数分 404 だった（2026-09-14）。
// ⚠ 予約注文の受付中は、製品ページが 200 でも Lookup は resultCount=0 を返した（同日、公開の5分後も 0）。
//    だから「Lookup が 1 件」を先に見るこの判定は、予約中を公開済みと取り違えない。
//    公開日以降に Lookup が 1 件になるかは、9/25 に実物で確かめること。
const PAGE = `https://apps.apple.com/${COUNTRY}/app/kurofukubo-%E8%A4%87%E5%BC%8F%E7%B0%BF%E8%A8%98%E3%81%AE%E5%AE%B6%E8%A8%88%E7%B0%BF/id${APP_ID}`;

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
      + '  予約注文の受付中もここで止まります。「公開しました」の告知は公開日を待ってから出してください。');
  }

  const app = data.results[0];
  const page = await fetch(PAGE, { redirect: 'follow' }).catch(() => null);
  if (!page || page.status !== 200) return fail(`製品ページが開けません（status=${page ? page.status : 'なし'}）`);

  console.log('✓ 公開を確認しました');
  console.log(`  名前     : ${app.trackName}`);
  console.log(`  バージョン: ${app.version}`);
  console.log(`  公開日   : ${(app.currentVersionReleaseDate || '').slice(0, 10)}`);
  console.log(`  URL      : ${PAGE}`);
  return 0;
}

process.exitCode = await main();
