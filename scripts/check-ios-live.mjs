// iOSアプリが本当に App Store で公開されているかを判定する。
//
// なぜ要るか:
//   LP とアプリの告知は「もう公開されている」前提で書いてある。公開前に出すと
//   死んだリンク（未公開IDは 404）を全ユーザーに見せることになる。手動リリース
//   なので公開の瞬間は人間が決めるが、その記憶に頼らず機械で止める。
//
// 判定:
//   iTunes Lookup API が resultCount=1 を返し、かつ製品ページが 200 を返すこと。
//   実測（2026-09-09、審査待ちの時点）では未公開は resultCount=0 / ページ 404。
//
// 使い方:
//   node scripts/check-ios-live.mjs          … 公開なら exit 0、未公開なら exit 1
//   デプロイスクリプトの先頭で呼ぶこと。
const APP_ID = '6806592989';
const COUNTRY = 'jp';
const PAGE = `https://apps.apple.com/${COUNTRY}/app/id${APP_ID}`;

const fail = (msg) => { console.error('✗ ' + msg); process.exit(1); };

const lookup = await fetch(
  `https://itunes.apple.com/lookup?id=${APP_ID}&country=${COUNTRY}`
).catch(() => null);
if (!lookup || !lookup.ok) fail(`Lookup API に到達できません（ネットワークを確認してください）`);

const data = await lookup.json().catch(() => null);
if (!data) fail('Lookup API の応答を解釈できません');

if (data.resultCount !== 1) {
  fail(`まだ公開されていません（resultCount=${data.resultCount}）。デプロイを中止します。\n'
    + '  告知はすべて「公開済み」前提で書かれています。公開を待ってください。`.replace(/\n\s*\+ '/g, '\n'));
}

const app = data.results[0];
const page = await fetch(PAGE, { redirect: 'follow' }).catch(() => null);
if (!page || page.status !== 200) fail(`製品ページが開けません（status=${page ? page.status : 'なし'}）`);

console.log('✓ 公開を確認しました');
console.log(`  名前     : ${app.trackName}`);
console.log(`  バージョン: ${app.version}`);
console.log(`  公開日   : ${(app.currentVersionReleaseDate || '').slice(0, 10)}`);
console.log(`  URL      : ${PAGE}`);
