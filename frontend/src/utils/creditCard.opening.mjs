/**
 * カードの開始残高が、次回引落のサイクルに正しく乗るかの検証。
 *   node src/utils/creditCard.opening.mjs
 *
 * 開始残高＝「次回の引落額（請求確定・引落待ち）」と定義し、直前の締め日に記帳する。
 * 今日の日付で記帳すると締め前のサイクルに入り、引落が1サイクル先へずれ込む。
 */
import { creditCardCycles, lastClosingDate, todayYmd } from './creditCard.js';

const card = { id: 'b03', name: 'カード', type: 'liability', ccClose: 15, ccDay: 27, ccDelay: 1, ccFrom: 'a02' };
const accounts = [
  { id: 'a02', name: '普通預金', type: 'asset' },
  { id: 'c01', name: '元入金', type: 'equity' },
  { id: 'e01', name: '食費', type: 'expense' },
  card,
];

const openingJournal = (date, amount) => ({
  id: 'op', date, desc: '開始残高（カード）',
  lines: [{ accountId: 'c01', side: 'dr', amount }, { accountId: 'b03', side: 'cr', amount }],
});

let ng = 0;
const check = (label, cond, detail) => {
  if (!cond) ng++;
  console.log(`${cond ? '  ok  ' : '  NG  '}${label}${detail ? `  → ${detail}` : ''}`);
};

// ── lastClosingDate 単体 ──
const at = (s) => new Date(`${s}T12:00:00`);
check('締め日前（8/6・締め15）は前月の締め日', lastClosingDate(15, at('2026-08-06')) === '2026-07-15', lastClosingDate(15, at('2026-08-06')));
check('締め日後（8/20・締め15）は当月の締め日', lastClosingDate(15, at('2026-08-20')) === '2026-08-15', lastClosingDate(15, at('2026-08-20')));
check('締め日当日（8/15）はまだ締め前＝前月', lastClosingDate(15, at('2026-08-15')) === '2026-07-15', lastClosingDate(15, at('2026-08-15')));
check('年またぎ（1/6・締め15）は前年12月', lastClosingDate(15, at('2026-01-06')) === '2025-12-15', lastClosingDate(15, at('2026-01-06')));
check('月末締め31日を2月に丸める（3/1）', lastClosingDate(31, at('2026-03-01')) === '2026-02-28', lastClosingDate(31, at('2026-03-01')));

// ── サイクルへの反映（今日を基準に動く）──
const opening = openingJournal(lastClosingDate(card.ccClose), 80000);
const usage = { id: 'u1', date: todayYmd(), desc: 'スーパー',
  lines: [{ accountId: 'e01', side: 'dr', amount: 3000 }, { accountId: 'b03', side: 'cr', amount: 3000 }] };

const cycles = creditCardCycles(card, [opening, usage], accounts).sort((a, b) => a.settleDate.localeCompare(b.settleDate));
console.log('\n  サイクル一覧（開始残高 80,000 ＋ 導入後の利用 3,000）');
cycles.forEach((c) => console.log(`    引落 ${c.settleDate}  ${String(c.usage).padStart(7)} 円  [${c.status}]`));

const openCycle = cycles.find((c) => c.status === 'open');
const dueCycle = cycles.find((c) => c.status === 'unsettled');
console.log('');
check('開始残高は締め済み・未引落のサイクルに乗る', dueCycle?.usage === 80000, `${dueCycle?.settleDate} / ${dueCycle?.usage}`);
check('締め前サイクルには導入後の利用だけが乗る', openCycle?.usage === 3000, `${openCycle?.settleDate} / ${openCycle?.usage}`);
check('開始残高が締め前サイクルに混入しない', !(openCycle?.items || []).some((i) => i.desc.startsWith('開始残高')));
check('次回引落のほうが締め前サイクルより先に来る', dueCycle && openCycle && dueCycle.settleDate < openCycle.settleDate);

// 負債残高は日付に関係なく総額
const bal = [opening, usage].reduce((s, j) =>
  s + j.lines.reduce((t, l) => t + (l.accountId === card.id ? (l.side === 'cr' ? l.amount : -l.amount) : 0), 0), 0);
check('カード負債残高は 83,000', bal === 83000, String(bal));

console.log(ng ? `\n${ng} 件 NG` : '\nすべて OK');
process.exit(ng ? 1 : 0);
