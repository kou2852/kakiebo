// CSV 取込の金額まわりの検証。node src/utils/csv.check.mjs
// 取込で「借方と貸方の金額がずれた仕訳」が作られないことを確かめる。
//   ・金額の読み方（pAm）と、1行の取込金額（csvAmount）
//   ・書き方をばらした入力を大量に作って、取込金額が必ず「両側が一致している金額」になること
//   ・マネーフォワード / Zaim を取り込む形（normalizeForeignCsv）が、必ず両側同額の行を作ること
// 同じ内容を mobile/src/utils/csv.check.mjs にも置いてある（csv.js の写しも検証する）。
import { CC, csvAmount, detectCsvFormat, normalizeForeignCsv, pAm, parseCT } from './csv.js';

let ng = 0;
const ok = (cond, name) => {
  if (cond) console.log(`  ok   ${name}`);
  else { ng++; console.log(`  NG   ${name}`); }
};
const row = (dm, cm) => ['2026-10-10', '食費', dm, '現金', cm, 'テスト'];

console.log('金額の読み方');
ok(pAm('1000') === 1000 && pAm('1,000') === 1000 && pAm('¥1,000') === 1000 && pAm(' 1 000 ') === 1000, '半角・桁区切り・円記号・空白');
ok(pAm('１，０００') === 1000 && pAm('￥１０００') === 1000 && pAm('１０００．５') === 1000.5, '全角の数字・「，」「￥」「．」');
ok(pAm('-1,000') === 1000 && pAm('▲1000') === 1000 && pAm('(1,000)') === 1000, 'マイナス・▲・括弧（絶対値）');
ok(pAm('1000円') === 1000 && pAm('1,000.50') === 1000.5, '「円」・小数');
ok(pAm('') === 0 && pAm('  ') === 0 && pAm(undefined) === 0 && pAm('-') === 0 && pAm('N/A') === 0, '空・読めないものは 0');

console.log('1行の取込金額');
ok(csvAmount(row('1000', '1000')).amount === 1000 && !csvAmount(row('1000', '1000')).mismatch, '両側が同じ');
ok(csvAmount(row('1000', '900')).mismatch, '違えば不一致');
ok(csvAmount(row('1000', '')).amount === 1000 && !csvAmount(row('1000', '')).mismatch, '貸方が空なら借方の金額');
ok(csvAmount(row('', '700')).amount === 700 && !csvAmount(row('', '700')).mismatch, '借方が空なら貸方の金額');
ok(csvAmount(row('', '')).amount === 0, '両方空は金額なし');
ok(!csvAmount(row('1,000', '１０００')).mismatch, '桁区切りと全角が混ざっても、同額なら一致');
ok(csvAmount(row('１０００', '900')).mismatch, '全角で書かれた借方が、貸方と違えば不一致（以前は借方が 0 に読まれて通っていた）');
ok(csvAmount(row('1000', 'N/A')).mismatch && csvAmount(row('N/A', '1000')).mismatch, '読めない文字がある側があり、反対側に金額があれば不一致');
ok(!csvAmount(row('1000', '-')).mismatch && !csvAmount(row('-', '1000')).mismatch, '「-」だけのセルは空欄と同じ');
ok(!csvAmount(row('1000.10', '1000.1')).mismatch, '小数は数値として比べる');
ok(csvAmount(row('0', '0')).amount === 0, '0円は金額なし');

console.log('書き方をばらした入力（無作為・各50,000組）');
{
  // 乱数は固定（結果が毎回同じになるように）
  let seed = 20261010;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const toFull = (s) => s.replace(/[0-9,.\-¥]/g, (c) => ({ ',': '，', '.': '．', '-': '－', '¥': '￥' }[c] || String.fromCharCode(c.charCodeAt(0) + 0xFEE0)));
  const styles = [
    (n) => String(n), (n) => n.toLocaleString('en-US'), (n) => `¥${n.toLocaleString('en-US')}`, (n) => `${n}円`,
    (n) => toFull(String(n)), (n) => toFull(`¥${n.toLocaleString('en-US')}`), (n) => `-${n}`, (n) => `▲${n}`, (n) => `(${n})`,
    (n) => `${n}.00`, (n) => ` ${n} `, (n) => `${n.toLocaleString('en-US')}.50`.replace(/\.50$/, ''),
  ];
  const values = () => pick([1, 9, 10, 99, 100, 580, 999, 1000, 1234, 52800, 99999, 123456, 1000000, Math.floor(rnd() * 5000000) + 1]);
  let wrongSame = 0, wrongDiff = 0, falseAlarm = 0, checked = 0;
  for (let i = 0; i < 50000; i++) {
    const a = values();
    // 半分は同額、半分は違う額（1円違いも含める）
    const same = rnd() < 0.5;
    const b = same ? a : (rnd() < 0.3 ? a + (a > 1 ? pick([-1, 1]) : 1) : values()); // 0 円は「金額なし」なので、1円違いは 0 にならないようにする
    if (!same && b === a) continue;
    const r = row(pick(styles)(a), pick(styles)(b));
    const out = csvAmount(r);
    checked++;
    if (same) {
      if (out.mismatch) falseAlarm++;                 // 同額なのに不一致と言った
      if (out.amount !== a) wrongSame++;              // 取り込む金額が違う
    } else if (!out.mismatch) wrongDiff++;            // 違う額なのに通した（金額ずれ）
  }
  ok(checked > 40000, `${checked.toLocaleString()} 組を検証した`);
  ok(wrongDiff === 0, `違う額を通した組: ${wrongDiff}（0 であること）`);
  ok(wrongSame === 0, `同額なのに取込金額が違った組: ${wrongSame}（0 であること）`);
  ok(falseAlarm === 0, `同額なのに不一致と判定した組: ${falseAlarm}（0 であること）`);
}

console.log('片側だけに金額がある行');
{
  let bad = 0;
  for (let n = 1; n <= 5000; n += 7) {
    if (csvAmount(row(String(n), '')).amount !== n || csvAmount(row('', `¥${n.toLocaleString('en-US')}`)).amount !== n) bad++;
    if (csvAmount(row(String(n), '')).mismatch || csvAmount(row('', String(n))).mismatch) bad++;
  }
  ok(bad === 0, '借方だけ・貸方だけの行は、その金額で取り込める');
}

console.log('マネーフォワード / Zaim の形（両側が同額の行を作ること）');
{
  const mf = [
    '計算対象,日付,内容,金額（円）,保有金融機関,大項目,中項目,メモ,振替,ID',
    '1,2026/10/03,コンビニ,"-1,280",現金,食費,食料品,,0,a1',
    '1,2026/10/04,給与,"280,000",普通預金,収入,給与,,0,a2',
    '1,2026/10/05,スーパー,"-9,999.5",カード,食費,食料品,,0,a3',
    '0,2026/10/06,集計対象外,"-500",現金,食費,食料品,,0,a4',
  ].join('\n');
  ok(detectCsvFormat(mf) === 'mf', 'マネーフォワードと判定');
  const rows = normalizeForeignCsv(mf, 'mf');
  ok(rows.length === 3, '集計対象外の行は取り込まない（3件）');
  ok(rows.every((r) => !csvAmount(r).mismatch && pAm(r[CC.dm]) === pAm(r[CC.cm]) && pAm(r[CC.dm]) > 0), '全行、借方と貸方が同額');
  const zaim = [
    '日付,方法,カテゴリ,カテゴリの内訳,支払元,入金先,品目,メモ,お店,金額',
    '2026-10-03,payment,食費,食料品,現金,-,弁当,,店,"1,000"',
    '2026-10-04,income,収入,給与,-,普通預金,給与,,,"300,000"',
    '2026-10-05,transfer,-,-,普通預金,現金,引き出し,,,"20,000"',
  ].join('\n');
  const zrows = normalizeForeignCsv(zaim, detectCsvFormat(zaim));
  ok(zrows.length >= 3, 'Zaim の3行が読める');
  ok(zrows.every((r) => !csvAmount(r).mismatch && pAm(r[CC.dm]) === pAm(r[CC.cm])), '全行、借方と貸方が同額');
}

console.log('取込の全体（CSV の文字列から金額まで）');
{
  const text = [
    '日付,借方科目,借方金額,貸方科目,貸方金額,摘要',
    '2026-10-01,食費,"1,000",現金,"1,000",一致',
    '2026-10-02,食費,1000,現金,900,不一致（借方が大きい）',
    '2026-10-03,食費,900,現金,1000,不一致（貸方が大きい）',
    '2026-10-04,食費,１０００,現金,900,全角の借方が違う',
    '2026-10-05,食費,1000,現金,,貸方が空',
    '2026-10-06,食費,,現金,700,借方が空',
    '2026-10-07,食費,0,現金,0,金額なし',
  ].join('\r\n');
  const rows = parseCT(text, true);
  const res = rows.map((r) => csvAmount(r));
  ok(rows.length === 7, '7行読めた');
  ok(JSON.stringify(res.map((x) => x.mismatch)) === JSON.stringify([false, true, true, true, false, false, false]), '不一致の行だけが検出される');
  ok(JSON.stringify(res.map((x) => x.amount)) === JSON.stringify([1000, 1000, 900, 1000, 1000, 700, 0]), '取込金額（不一致の行は取り込まないので、数字は参考）');
}

if (ng) { console.log(`\n${ng} 件 NG`); process.exit(1); }
console.log('\nすべて ok');
