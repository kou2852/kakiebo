// openingBalance.js の検証。node src/utils/openingBalance.check.mjs
//
// 見たいのは: あとから「いまの残高」を入れたとき、今日の残高がその額に合い、すでにある開始残高は二重にしないこと。
import { adjustJournal, hasOpening, openingJournal, redatedCardOpening } from './openingBalance.js';
import { accountBalance, calcBalances } from './bookkeeping.js';

let ng = 0;
const ok = (cond, name) => {
  if (cond) console.log(`  ok   ${name}`);
  else { ng++; console.log(`  NG   ${name}`); }
};

const accounts = [
  { id: 'a02', name: '普通預金', type: 'asset' },
  { id: 'b03', name: 'クレジットカード', type: 'liability' },
  { id: 'b04', name: 'ローン', type: 'liability' },
  { id: 'c01', name: '元入金', type: 'equity' },
  { id: 'e01', name: '食費', type: 'expense' },
];
const card = { id: 'b09', name: 'Aカード', type: 'liability', ccClose: 15, ccDay: 10, ccFrom: 'a02' };
const TODAY = '2026-10-15';
let n = 0;
const newId = () => `j${++n}`;
const pay = (date, amount, from = 'a02') => ({ id: `p${date}`, date, lines: [
  { accountId: 'e01', side: 'dr', amount }, { accountId: from, side: 'cr', amount },
] });
const balNow = (journals, id, accts = accounts) => accountBalance(id, accts, calcBalances(journals, accts));

console.log('資産（いまの残高）');
{
  const j = openingJournal({ account: accounts[0], input: '300,000', journals: [], accounts, todayStr: TODAY, newId });
  ok(j && j.date === TODAY && j.lines[0].accountId === 'a02' && j.lines[0].side === 'dr' && j.lines[0].amount === 300000,
    '記帳が無ければ、今日の日付で入れた額のまま');
  ok(j.desc === '開始残高（普通預金）', '摘要は開始残高（科目名）');

  // 先に預金から5,000円払っていた（帳簿は −5,000）。いまの残高 300,000 を入れる
  const before = [pay('2026-10-03', 3000), pay('2026-10-10', 2000)];
  const j2 = openingJournal({ account: accounts[0], input: 300000, journals: before, accounts, todayStr: TODAY, newId });
  ok(j2.lines[0].amount === 305000, '帳簿の残高との差（305,000）を入れる');
  ok(j2.date === '2026-10-02', '最初の記帳（10/3）の前日に置く');
  ok(balNow([...before, j2], 'a02') === 300000, '入れたあと、今日の残高が入れた額（300,000）に合う');

  // 帳簿の方が多い（収入を先に入れていた）→ 減らす向き
  const inc = [{ id: 'i1', date: '2026-10-05', lines: [{ accountId: 'a02', side: 'dr', amount: 500000 }, { accountId: 'c01', side: 'cr', amount: 1 }, { accountId: 'e01', side: 'cr', amount: 499999 }] }];
  const j3 = openingJournal({ account: accounts[0], input: 450000, journals: inc, accounts, todayStr: TODAY, newId });
  ok(j3.lines[1].accountId === 'a02' && j3.lines[1].side === 'cr' && j3.lines[1].amount === 50000, '帳簿の方が多ければ、差の分を減らす');

  ok(openingJournal({ account: accounts[0], input: 0, journals: [], accounts, todayStr: TODAY, newId }) === null, '0なら作らない');
  ok(openingJournal({ account: accounts[0], input: 5000, journals: [pay('2026-10-03', -5000)], accounts, todayStr: TODAY, newId }) === null,
    '帳簿と同じ額なら作らない');
  ok(openingJournal({ account: accounts[4], input: 5000, journals: [], accounts, todayStr: TODAY, newId }) === null, '費用の科目には作らない');
  ok(openingJournal({ account: accounts[0], input: 5000, journals: [], accounts: accounts.filter((a) => a.id !== 'c01'), todayStr: TODAY, newId }) === null,
    '元入金が無い端末では作らない');
  const future = [pay('2026-11-20', 1000)];
  ok(openingJournal({ account: accounts[0], input: 1000, journals: future, accounts, todayStr: TODAY, newId }).date === TODAY,
    '記帳が先日付だけなら、今日より後には置かない');
}

console.log('\n負債（次の引落額・借りている額）');
{
  const accts = [...accounts, card];
  const now = new Date(2026, 9, 15); // 10/15
  const j = openingJournal({ account: card, input: 48000, journals: [pay('2026-10-12', 3000, 'b09')], accounts: accts, todayStr: TODAY, newId, now });
  ok(j.lines[1].accountId === 'b09' && j.lines[1].side === 'cr' && j.lines[1].amount === 48000, 'カードは入れた額のまま、負債を増やす向き');
  ok(j.date === '2026-09-15', 'カード（締め日15日）は直前の締め日に置く（締め日の当日はまだ締め前なので9/15）');
  const loan = openingJournal({ account: accounts[2], input: 1200000, journals: [], accounts, todayStr: TODAY, newId });
  ok(loan.date === TODAY && loan.lines[0].accountId === 'c01', 'ローンは今日、(借)元入金/(貸)ローン');
}

console.log('\n開始残高があるか');
{
  const op = { id: 'o', date: '2026-10-01', lines: [{ accountId: 'a02', side: 'dr', amount: 1 }, { accountId: 'c01', side: 'cr', amount: 1 }] };
  ok(hasOpening('a02', [op]), '相手が元入金だけの仕訳があれば、ある');
  ok(!hasOpening('a02', [pay('2026-10-03', 100)]), 'ふつうの記帳だけなら、無い');
  ok(!hasOpening('b03', [op]), '別の科目の開始残高は数えない');
}

console.log('\nカードに締め日を入れたとき（オンボーディングのカードの額）');
{
  const now = new Date(2026, 9, 20); // 10/20。直前の締め日は 10/15
  const op = { id: 'o', date: '2026-10-18', desc: '開始残高（カード）', lines: [{ accountId: 'c01', side: 'dr', amount: 30000 }, { accountId: 'b09', side: 'cr', amount: 30000 }] };
  const r = redatedCardOpening(card, [op], now);
  ok(r && r.date === '2026-10-15' && r.id === 'o', '締め日より後にある開始残高を、直前の締め日へ移す');
  ok(redatedCardOpening(card, [{ ...op, date: '2026-10-10' }], now) === null, 'すでに締め済みのサイクルにあれば動かさない');
  ok(redatedCardOpening({ ...card, ccClose: 0 }, [op], now) === null, '締め日が無ければ動かさない');
  ok(redatedCardOpening(card, [pay('2026-10-18', 100, 'b09')], now) === null, '開始残高でない記帳は動かさない');
}

console.log('\n入れ済みの残高を直す');
{
  const opened = [openingJournal({ account: accounts[0], input: '300000', journals: [], accounts, todayStr: TODAY, newId })];
  const js = [...opened, pay('2026-10-10', 2000)]; // 帳簿は 298,000
  const down = adjustJournal({ account: accounts[0], input: '280,000', journals: js, accounts, todayStr: TODAY, newId });
  ok(down && down.date === TODAY && balNow([...js, down], 'a02') === 280000, '少なく直すと今日の残高が入れた額になる');
  ok(down.lines.some((l) => l.accountId === 'c01' && l.side === 'dr'), '減らすときは元入金の借方（費用にしない）');
  const up = adjustJournal({ account: accounts[0], input: '310000', journals: js, accounts, todayStr: TODAY, newId });
  ok(up && balNow([...js, up], 'a02') === 310000, '多く直すと今日の残高が入れた額になる');
  ok(adjustJournal({ account: accounts[0], input: '298000', journals: js, accounts, todayStr: TODAY, newId }) === null, '帳簿と同じ額なら何もしない');
  ok(adjustJournal({ account: accounts[0], input: '', journals: js, accounts, todayStr: TODAY, newId }) === null, '空欄なら何もしない');
  const zero = adjustJournal({ account: accounts[0], input: '0', journals: js, accounts, todayStr: TODAY, newId });
  ok(zero && balNow([...js, zero], 'a02') === 0, '0 と入れたら 0 に合わせる（空欄とは別）');
  ok(adjustJournal({ account: accounts[1], input: '5000', journals: js, accounts, todayStr: TODAY, newId }) === null, '負債は対象外');
  const future = [...js, pay('2026-10-20', 1000)];
  const f = adjustJournal({ account: accounts[0], input: '280000', journals: future, accounts, todayStr: TODAY, newId });
  ok(f && balNow([...js, f], 'a02') === 280000, '今日より先の記帳は差に入れない');
}

console.log(ng ? `\n${ng} 件 NG` : '\nすべて ok');
process.exit(ng ? 1 : 0);
