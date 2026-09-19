// onboardingPlan.js の検証。node src/store/onboardingPlan.check.mjs
//
// 見たいのは3つ。
//   ・A-3 に出す純資産が、入れた数字の合計と必ず一致すること
//   ・途中でやめた人の端末に何も残らないこと（意図が0件）
//   ・積む順序が 科目 → 仕訳 → 口座 → 定期取引 から崩れないこと
//     （崩れると参照先の無い仕訳ができるが、画面には出ないので気づけない）
import { DEFAULT_ACCOUNTS, emptyDataset } from '../db/defaults.js';
import { EQUITY_ID } from '../utils/accountCode.js';
import { buildPlan, hasUserData, nextMonthlyDate, summarize, yen } from './onboardingPlan.js';

let ng = 0;
const ok = (cond, name) => {
  if (cond) console.log(`  ok   ${name}`);
  else { ng++; console.log(`  NG   ${name}`); }
};

// id を固定して比べられるようにする
const idGen = () => { let n = 0; return () => `n${++n}`; };
const TODAY = '2026-09-19';
const ACC = DEFAULT_ACCOUNTS;

const typesOf = (intents) => intents.map((i) => i.c);
const only = (intents, c) => intents.filter((i) => i.c === c).map((i) => i.item);

console.log('金額の読み取り');
ok(yen('¥12,000') === 12000, '「¥12,000」を 12000 と読む');
ok(yen('') === 0, '空欄は0');
ok(yen('あ') === 0, '数字でないものは0');

console.log('\n合計');
{
  const draft = { picks: ['cash', 'bank', 'card'], balances: { cash: '12000', bank: '350,000', card: '¥48000' } };
  const s = summarize(draft);
  ok(s.assets === 362000, '資産は 12,000 + 350,000 = 362,000');
  ok(s.liabilities === 48000, '負債は 48,000');
  ok(s.netWorth === 314000, '純資産は 362,000 − 48,000 = 314,000');
}
{
  const s = summarize({ picks: ['cash'], balances: {} });
  ok(s.netWorth === 0, '何も入れなければ純資産は0');
}
{
  // 選んでいないものは合計に入れない（前の画面で外したのに残る、を防ぐ）
  const s = summarize({ picks: ['cash'], balances: { cash: '1000', bank: '999999' } });
  ok(s.netWorth === 1000, '選んでいない口座の数字は合計に入れない');
}

console.log('\n何もしなかったとき');
{
  const intents = buildPlan({ picks: [], balances: {}, monthly: [] }, ACC, TODAY, idGen());
  ok(intents.length === 0, '何も選ばなければ意図は0件（端末に何も残らない）');
}
{
  const intents = buildPlan({ picks: ['cash'], balances: {}, monthly: [] }, ACC, TODAY, idGen());
  ok(only(intents, 'journals').length === 0, '残高0なら開始残高の仕訳は作らない');
  ok(only(intents, 'wallets').length === 1, '残高0でも口座は作る');
}

console.log('\n積む順序');
{
  const draft = {
    picks: ['cash', 'emoney'],
    balances: { cash: '1000', emoney: '2000' },
    monthly: [{ name: '家賃', dir: 'out', day: 27, amount: '80000', accountId: 'e09' }],
  };
  const intents = buildPlan(draft, ACC, TODAY, idGen());
  const order = typesOf(intents);
  const rank = { accounts: 0, journals: 1, wallets: 2, recurring: 3 };
  ok(order.every((c, i) => i === 0 || rank[order[i - 1]] <= rank[c]),
    '科目 → 仕訳 → 口座 → 定期取引 の順に積む');
  ok(order[0] === 'accounts', '科目がいちばん先');
}

console.log('\n勘定科目');
{
  const intents = buildPlan({ picks: ['cash', 'bank', 'card'], balances: {}, monthly: [] }, ACC, TODAY, idGen());
  ok(only(intents, 'accounts').length === 0, '既定科目があるときは科目を作らない');
  const w = only(intents, 'wallets');
  ok(w.find((x) => x.name === '現金').accountId === 'a01', '現金の口座は既定科目 a01 に繋ぐ');
  ok(w.find((x) => x.name === 'クレジットカード').accountId === 'b03', 'カードの口座は既定科目 b03 に繋ぐ');
}
{
  const intents = buildPlan({ picks: ['emoney'], balances: {}, monthly: [] }, ACC, TODAY, idGen());
  const made = only(intents, 'accounts');
  ok(made.length === 1 && made[0].name === '電子マネー', '既定に無い電子マネーは科目を作る');
  ok(!ACC.some((a) => a.code === made[0].code), '作った科目のコードは既存と重ならない');
  ok(made[0].type === 'asset', '電子マネーは資産');
}
{
  // 利用者が既定科目を消していた端末
  const stripped = ACC.filter((a) => a.id !== 'a01');
  const intents = buildPlan({ picks: ['cash'], balances: { cash: '500' }, monthly: [] }, stripped, TODAY, idGen());
  const made = only(intents, 'accounts');
  ok(made.length === 1, '既定科目が消されていれば作り直す');
  ok(only(intents, 'journals')[0].lines.some((l) => l.accountId === made[0].id),
    '開始残高は作り直した科目を指す');
}
{
  const noEquity = ACC.filter((a) => a.id !== EQUITY_ID);
  const intents = buildPlan({ picks: ['cash'], balances: { cash: '500' }, monthly: [] }, noEquity, TODAY, idGen());
  ok(only(intents, 'journals').length === 0, '元入金が無ければ開始残高を記帳しない');
  ok(only(intents, 'wallets').length === 1, '元入金が無くても口座は作る');
}

console.log('\n開始残高の仕訳');
{
  const draft = { picks: ['bank', 'card'], balances: { bank: '350000', card: '48000' }, monthly: [] };
  const js = only(buildPlan(draft, ACC, TODAY, idGen()), 'journals');
  const bank = js.find((j) => j.desc.includes('銀行口座'));
  const card = js.find((j) => j.desc.includes('クレジットカード'));
  const sum = (j, side) => j.lines.filter((l) => l.side === side).reduce((s, l) => s + l.amount, 0);
  ok(js.every((j) => sum(j, 'dr') === sum(j, 'cr')), '借方と貸方が一致する');
  ok(bank.lines.find((l) => l.side === 'dr').accountId === 'a02', '資産は借方が本人');
  ok(bank.lines.find((l) => l.side === 'cr').accountId === EQUITY_ID, '資産の相手は元入金');
  ok(card.lines.find((l) => l.side === 'cr').accountId === 'b03', '負債は貸方が本人');
  ok(card.lines.find((l) => l.side === 'dr').accountId === EQUITY_ID, '負債の相手は元入金');
  ok(js.every((j) => j.date === TODAY), '日付は今日');
}
{
  // 入れた数字の合計と、仕訳から出る純資産が一致するか
  const draft = { picks: ['cash', 'bank', 'card'], balances: { cash: '12000', bank: '350000', card: '48000' }, monthly: [] };
  const js = only(buildPlan(draft, ACC, TODAY, idGen()), 'journals');
  const type = (id) => ACC.find((a) => a.id === id)?.type;
  let net = 0;
  for (const j of js) {
    for (const l of j.lines) {
      if (type(l.accountId) === 'asset') net += l.side === 'dr' ? l.amount : -l.amount;
      if (type(l.accountId) === 'liability') net -= l.side === 'cr' ? l.amount : -l.amount;
    }
  }
  ok(net === summarize(draft).netWorth, '仕訳から出る純資産が A-3 の表示と一致する');
}

console.log('\n口座');
{
  const intents = buildPlan({ picks: ['invest', 'loan'], balances: {}, monthly: [] }, ACC, TODAY, idGen());
  ok(only(intents, 'wallets').length === 0, '証券とローンは口座（支払い手段）を作らない');
}

console.log('\n定期取引');
{
  const draft = {
    picks: ['bank'],
    balances: {},
    monthly: [
      { name: '給料', dir: 'in', day: 25, amount: '250000', accountId: 'd01' },
      { name: '家賃', dir: 'out', day: 27, amount: '80000', accountId: 'e09' },
    ],
  };
  const rs = only(buildPlan(draft, ACC, TODAY, idGen()), 'recurring');
  const pay = rs.find((r) => r.name === '給料');
  const rent = rs.find((r) => r.name === '家賃');
  ok(rs.length === 2, '2件とも作る');
  ok(pay.lines.find((l) => l.side === 'dr').accountId === 'a02', '給料は借方が銀行口座');
  ok(pay.lines.find((l) => l.side === 'cr').accountId === 'd01', '給料は貸方が給与収入');
  ok(rent.lines.find((l) => l.side === 'dr').accountId === 'e09', '家賃は借方が住居費');
  ok(rent.lines.find((l) => l.side === 'cr').accountId === 'a02', '家賃は貸方が銀行口座');
  ok(rs.every((r) => r.frequency === 'monthly'), '毎月');
}
{
  // 支払元になる口座を1つも選んでいない
  const draft = { picks: ['invest'], balances: {}, monthly: [{ name: '家賃', dir: 'out', day: 27, amount: '80000', accountId: 'e09' }] };
  ok(only(buildPlan(draft, ACC, TODAY, idGen()), 'recurring').length === 0,
    '現金も銀行口座も選んでいなければ定期取引は作らない');
}
{
  const stripped = ACC.filter((a) => a.id !== 'e09');
  const draft = { picks: ['bank'], balances: {}, monthly: [{ name: '家賃', dir: 'out', day: 27, amount: '80000', accountId: 'e09' }] };
  ok(only(buildPlan(draft, stripped, TODAY, idGen()), 'recurring').length === 0,
    '相手科目が消されていれば作らない（壊れた仕訳を作らない）');
}
{
  const draft = { picks: ['bank'], balances: {}, monthly: [{ name: '', dir: 'out', day: 1, amount: '1000' }] };
  ok(only(buildPlan(draft, ACC, TODAY, idGen()), 'recurring').length === 0, '名前が空なら作らない');
}
{
  const draft = { picks: ['bank'], balances: {}, monthly: [{ name: 'サブスク', dir: 'out', day: 1, amount: '' }] };
  ok(only(buildPlan(draft, ACC, TODAY, idGen()), 'recurring').length === 0, '金額が空なら作らない');
}

console.log('\n次回の予定日');
ok(nextMonthlyDate(25, '2026-09-19') === '2026-09-25', '今日より後の日は今月');
ok(nextMonthlyDate(19, '2026-09-19') === '2026-09-19', '今日と同じ日は今日');
ok(nextMonthlyDate(5, '2026-09-19') === '2026-10-05', '今日より前の日は翌月');
ok(nextMonthlyDate(5, '2026-12-19') === '2027-01-05', '年をまたぐ');
ok(nextMonthlyDate(31, '2026-02-01') === '2026-02-28', '月末を超える指定は末日に丸める');
ok(nextMonthlyDate(31, '2026-01-31') === '2026-01-31', '31日は1月ならそのまま');

console.log('\n参照の健全性');
{
  const draft = {
    picks: ['cash', 'bank', 'card', 'emoney', 'invest', 'loan'],
    balances: { cash: '1', bank: '2', card: '3', emoney: '4', invest: '5', loan: '6' },
    monthly: [{ name: '給料', dir: 'in', day: 25, amount: '250000', accountId: 'd01' }],
  };
  const intents = buildPlan(draft, ACC, TODAY, idGen());
  const ids = new Set([...ACC.map((a) => a.id), ...only(intents, 'accounts').map((a) => a.id)]);
  const refs = [];
  for (const i of intents) {
    if (i.c === 'journals' || i.c === 'recurring') i.item.lines.forEach((l) => refs.push(l.accountId));
    if (i.c === 'wallets') refs.push(i.item.accountId);
  }
  ok(refs.length > 0 && refs.every((id) => ids.has(id)), '仕訳・口座・定期取引が指す科目はすべて存在する');
  const idsOut = intents.map((i) => i.item.id);
  ok(new Set(idsOut).size === idsOut.length, '作る id が重複しない');
}

console.log('\nオンボーディングを出すかの判定（hasUserData）');
{
  const base = emptyDataset();
  ok(!hasUserData(base), '初期状態の端末は「帳簿なし」');
  ok(!hasUserData({ ...base, accounts: [...base.accounts, { id: 'x1', code: '5013', name: '趣味', type: 'expense' }] }),
    '勘定科目が初期データと違っても「帳簿なし」（初期データのずれで飛ばさない）');
  ok(!hasUserData({ ...base, presets: [] }), 'プリセットが無くても「帳簿なし」');
  const seedFailed = { accounts: [], journals: [], tags: [], allocs: [], wallets: [], presets: [], budgets: [], recurring: [], rules: [] };
  ok(!hasUserData(seedFailed), '初期データ投入に失敗した空のアカウントも「帳簿なし」');
  ok(!hasUserData(null), '読めなかったときは「帳簿なし」');
  ok(hasUserData({ ...base, journals: [{ id: 'j1' }] }), '仕訳が1件でもあれば「帳簿あり」');
  ok(hasUserData({ ...base, wallets: [{ id: 'w1' }] }), '口座が1件でもあれば「帳簿あり」');
  ok(hasUserData({ ...base, recurring: [{ id: 'r1' }] }), '定期取引があれば「帳簿あり」');
  ok(hasUserData({ ...base, budgets: [{ accountId: 'e01', amount: 1 }] }), '予算があれば「帳簿あり」');
  // オンボーディングを終えた直後の端末は「帳簿あり」になる（次の起動で出さない）
  const after = buildPlan({ picks: ['cash'], balances: { cash: '100' }, monthly: [] }, base.accounts, TODAY, idGen());
  ok(after.some((i) => i.c === 'wallets'), 'オンボーディングを終えると口座ができる＝次からは出ない');
}

console.log(ng ? `\n${ng} 件 失敗` : '\nすべて通過');
process.exitCode = ng ? 1 : 0;
