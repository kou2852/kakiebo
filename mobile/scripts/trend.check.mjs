// 純資産の推移が「期間の終端」を基準にしているかの確認。
// ここが今日固定だったため、期間を先月に変えても前月比が動かなかった。
import { netWorthTrend, monthlyTrend } from '../src/utils/bookkeeping.js';

const accounts = [
  { id: 'a1', code: '1001', name: '現金', type: 'asset' },
  { id: 'l1', code: '2001', name: '借入金', type: 'liability' },
  { id: 'i1', code: '4001', name: '給与', type: 'income' },
  { id: 'e1', code: '5001', name: '食費', type: 'expense' },
];
const j = (date, amount, dr, cr) => ({
  id: date + dr, date, desc: '',
  lines: [{ accountId: dr, side: 'dr', amount }, { accountId: cr, side: 'cr', amount }],
});
// 6月+10万、7月+20万、8月+5万（すべて給与で現金が増える）
const journals = [
  j('2026-06-10', 100000, 'a1', 'i1'),
  j('2026-07-10', 200000, 'a1', 'i1'),
  j('2026-08-10', 50000, 'a1', 'i1'),
  j('2026-08-20', 30000, 'e1', 'a1'),
];

const show = (label, asOf) => {
  const w = netWorthTrend(journals, accounts, 4, asOf);
  const last = w[w.length - 1].net;
  const prev = w[w.length - 2].net;
  console.log(label.padEnd(22), w.map((x) => `${x.label}:${x.net}`).join(' '), '→ 前月比', last - prev);
  return last - prev;
};

const aug = show('期間末 2026-08-31', '2026-08-31');
const jul = show('期間末 2026-07-31', '2026-07-31');
const jun = show('期間末 2026-06-30', '2026-06-30');

let ng = 0;
const eq = (name, got, want) => { if (got !== want) { console.log('  NG', name, got, '≠', want); ng++; } };
// 8月末: 現金 320000 - 借入 0 = 320000。7月末 300000 → 前月比 +20000
eq('8月の前月比', aug, 20000);
// 7月末: 300000。6月末 100000 → +200000
eq('7月の前月比', jul, 200000);
// 6月末: 100000。5月末 0 → +100000
eq('6月の前月比', jun, 100000);
// 期間を変えれば必ず値が変わる（これが今回の不具合）
if (aug === jul) { console.log('  NG 期間を変えても前月比が同じ'); ng++; }

// 月次推移も期間末で切れているか。8/15 を終端にすると 8月の支出は 0 になるはず
const m = monthlyTrend(journals, accounts, 3, '2026-08-15');
eq('8/15 時点の当月支出', m[m.length - 1].expense, 0);
const m2 = monthlyTrend(journals, accounts, 3, '2026-08-31');
eq('8/31 時点の当月支出', m2[m2.length - 1].expense, 30000);

console.log(ng ? `\n${ng} 件 失敗` : '\nすべて成功');
process.exit(ng ? 1 : 0);
