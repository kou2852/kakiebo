// MF/Zaim CSV 取込の変換ロジック検証（純粋関数のみ。ブラウザAPI不要）
import { detectCsvFormat, normalizeForeignCsv, normD, pAm } from '../../frontend/src/utils/csv.js';

let ng = 0;
const eq = (label, got, exp) => {
  const g = JSON.stringify(got), e = JSON.stringify(exp);
  const ok = g === e;
  if (!ok) ng++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `\n   got=${g}\n   exp=${e}`}`);
};

// ── マネーフォワード（全角括弧・Shift-JIS想定の列。ここはUTF-8文字列でロジックのみ検証） ──
const mf = [
  '"計算対象","日付","内容","金額（円）","保有金融機関","大項目","中項目","メモ","振替","ID"',
  '"1","2026/06/01","スーパーマルエツ","-1200","三井住友銀行","食費","食料品","","0","a1"',
  '"1","2026/06/25","6月給与","250000","三井住友銀行","収入","給与","","0","a2"',
  '"0","2026/06/02","集計対象外","-500","現金","食費","","","0","a3"',
].join('\r\n');

eq('MF: detectCsvFormat', detectCsvFormat(mf), 'mf');
const mfRows = normalizeForeignCsv(mf, 'mf');
eq('MF: 行数（計算対象0を除外）', mfRows.length, 2);
eq('MF: 支出行 借方=費目/貸方=口座', mfRows[0], ['2026/06/01', '食費', '1200', '三井住友銀行', '1200', 'スーパーマルエツ']);
eq('MF: 収入行 借方=口座/貸方=費目', mfRows[1], ['2026/06/25', '三井住友銀行', '250000', '収入', '250000', '6月給与']);
eq('MF: 日付は後段normDで正規化可', normD(mfRows[0][0]), '2026-06-01');
eq('MF: 金額は後段pAmで数値化可', pAm(mfRows[0][2]), 1200);

// ── Zaim（UTF-8・ハイフン日付・金額は正） ──
const zaim = [
  '"日付","方法","カテゴリ","カテゴリの内訳","金額","通貨","残高調整","支出元","入金先","品目","メモ","お店"',
  '"2026-06-01","payment","食費","食料品","1200","JPY","0","現金","","卵","","スーパー"',
  '"2026-06-25","income","給与","給料","250000","JPY","0","","給与口座","6月給与","",""',
  '"2026-06-10","transfer","振替","","30000","JPY","0","銀行","財布","","",""',
].join('\r\n');

eq('Zaim: detectCsvFormat', detectCsvFormat(zaim), 'zaim');
const zRows = normalizeForeignCsv(zaim, 'zaim');
eq('Zaim: 行数', zRows.length, 3);
eq('Zaim: 支出 借方=費目/貸方=支出元', zRows[0], ['2026-06-01', '食費', '1200', '現金', '1200', '卵']);
eq('Zaim: 収入 借方=入金先/貸方=費目', zRows[1], ['2026-06-25', '給与口座', '250000', '給与', '250000', '6月給与']);
eq('Zaim: 振替 借方=入金先/貸方=支出元', zRows[2], ['2026-06-10', '財布', '30000', '銀行', '30000', '振替']);
eq('Zaim: 日付は後段normDで正規化可', normD(zRows[0][0]), '2026-06-01');

// ── ネイティブ形式は誤判定しない ──
const native = ['日付,借方科目,借方金額,貸方科目,貸方金額,摘要', '2026/06/01,食費,1200,現金,1200,コンビニ'].join('\r\n');
eq('native: detectCsvFormat=native', detectCsvFormat(native), 'native');

console.log(ng === 0 ? '\n✅ ALL PASS' : `\n❌ ${ng} FAIL`);
process.exit(ng === 0 ? 0 : 1);
