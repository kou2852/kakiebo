// App Store（日本）の検索で、当アプリが何位に出るかを語ごとに測る。
//   node scripts/aso-rank.mjs            → 既定の語の一覧を測る
//   node scripts/aso-rank.mjs 家計簿 貯金  → 指定した語だけ測る
//
// なぜ要るか:
//   App Store はキーワードの A/B ができないので、掲載文を変えた効果は前後比較でしか測れない。
//   全体の表示回数は公開直後の伸びの減衰と交じるため、語ごとの順位を主な指標にする。
//   基準値は docs/appstore/aso-1.0.3.md の6章（2026-10-10）。同じ語の一覧で測り直す。
//
// ⚠ iTunes Search API の並びは、実際のストアの検索結果と一致しない（近似）。
//   上位200件までしか返らないので、それより下は「圏外」と出る。
// ⚠ 連続で叩くと 403 になるので、1語ごとに間を空ける。

const APP_ID = 6806592989;

const DEFAULT_TERMS = [
  // 1.0.2 時点の基準値がある語
  '複式簿記 家計簿', '複式簿記家計簿', '複式簿記', '貸借対照表', '純資産', '純資産管理',
  '資産管理アプリ', '家計簿アプリ', '家計簿', '黒福簿', 'kurofukubo',
  '資産管理', '貯金', '予算管理', '口座管理', '簿記', '仕訳', '先取り貯金', '目的別貯金',
  'クレジットカード', '固定費', '支出管理', '貯蓄', '家計管理', '節約',
  // 1.0.3 でキーワード・サブタイトルに入れた語
  'くろふくぼ', '積立', 'バランスシート', '損益計算書', 'キャッシュフロー', '資産推移',
  '資産形成', '引き落とし', '収支', '目的別', '口座',
];

const terms = process.argv.length > 2 ? process.argv.slice(2) : DEFAULT_TERMS;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log(`# ${new Date().toISOString().slice(0, 10)}  語\t順位\t検索結果の件数`);
for (const term of terms) {
  const url = 'https://itunes.apple.com/search?' + new URLSearchParams({
    term, country: 'jp', entity: 'software', limit: '200', lang: 'ja_jp',
  });
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { results } = await res.json();
    const i = results.findIndex((r) => r.trackId === APP_ID);
    console.log(`${term}\t${i < 0 ? '圏外' : i + 1}\t${results.length}`);
  } catch (e) {
    console.log(`${term}\t取得失敗（${e.message}）`);
  }
  await sleep(2500);
}
