// notifyPlan.js の検証。node src/utils/notifyPlan.check.mjs
import { planNotifications, DEFAULT_SETTINGS, anyOn } from './notifyPlan.js';
import { ymd } from './format.js';

let ng = 0;
const ok = (cond, name) => {
  if (cond) console.log(`  ok   ${name}`);
  else { ng++; console.log(`  NG   ${name}`); }
};

// 検証の基準は「いま」。creditCardCycles が内部で今日を使うので、日付は今日からの相対で作る。
const now = new Date();
const day = (n) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + n);
const D = (n) => ymd(day(n));
const jr = (date, lines) => ({ id: `j${date}${lines[0].amount}${lines[0].accountId}`, date, desc: '', lines });
const dr = (accountId, amount) => ({ accountId, side: 'dr', amount, taxRate: 0 });
const cr = (accountId, amount) => ({ accountId, side: 'cr', amount, taxRate: 0 });
const atH = (when, h, m = 0) => when.getHours() === h && when.getMinutes() === m;
// 金額（桁区切りの数字や「円」）が文面に入っていないこと
const noMoney = (n) => !/\d{1,3}(,\d{3})+|\d+円|¥/.test(`${n.title}${n.body}`);

const accounts = [
  { id: 'cash', code: '1001', name: '現金', type: 'asset' },
  { id: 'bank', code: '1002', name: '普通預金', type: 'asset' },
  { id: 'bank2', code: '1003', name: '給与口座', type: 'asset' },
  { id: 'eq', code: '3001', name: '元入金', type: 'equity' },
  { id: 'food', code: '5001', name: '食費', type: 'expense' },
  { id: 'sal', code: '4001', name: '給与', type: 'income' },
];
const base = [jr(D(-40), [dr('bank', 100000), cr('eq', 100000)])];
const OFF = { reminder: '', cardBefore: false, cardDay: false, cardOff: {}, recBefore: false, recDay: false, weekly: false, monthly: false };

console.log('初期値（許可が得られたとき）');
ok(DEFAULT_SETTINGS.reminder === '', '記帳のリマインダーはオフ');
ok(DEFAULT_SETTINGS.cardBefore === true && DEFAULT_SETTINGS.cardDay === false, 'カードは3日前だけオン（当日はオフ）');
ok(DEFAULT_SETTINGS.recBefore === true && DEFAULT_SETTINGS.recDay === false, '定期取引は3日前だけオン（当日はオフ）');
ok(DEFAULT_SETTINGS.monthly === true && DEFAULT_SETTINGS.weekly === false, 'レポートは月次だけオン');
ok(anyOn(DEFAULT_SETTINGS) && !anyOn(OFF), 'anyOn');
ok(planNotifications({ settings: OFF, journals: base, accounts, now }).length === 0, 'すべてオフなら何も予約しない');

console.log('記帳漏れ');
{
  const s = { ...OFF, reminder: '23:59' };
  const none = planNotifications({ settings: s, journals: base, accounts, now });
  const rec = planNotifications({ settings: s, journals: [...base, jr(D(0), [dr('food', 500), cr('cash', 500)])], accounts, now });
  ok(none.length === 14 && none[0].id.endsWith(D(0)), '記帳が無ければ今日から14日分');
  ok(rec.length === 13 && rec[0].id.endsWith(D(1)), '今日記帳済みなら今日の分は出さず、明日から');
  ok(none.every((n) => atH(n.when, 23, 59)), '時刻は設定どおり');
  ok(none[0].route === '/journal', '行き先は記帳');
  ok(planNotifications({ settings: { ...OFF, reminder: '00:00' }, journals: base, accounts, now }).length === 13, '今日の時刻を過ぎていれば今日の分は出さない');
  ok(planNotifications({ settings: { ...OFF, reminder: 'abc' }, journals: base, accounts, now }).length === 0, '読めない時刻は何もしない');
}

console.log('カードの引き落とし');
const closeDay = day(-1).getDate();
const mkCard = (id, name, settle, from = 'bank') => ({ id, code: `2${id}`, name, type: 'liability', ccClose: closeDay, ccDay: settle, ccDelay: 1, ccFrom: from });
const settleOf = (n) => day(n).getDate();
const withCards = (...cards) => [...accounts, ...cards];
const spend = (card, amount) => jr(D(-3), [dr('food', amount), cr(card, amount)]);
const cardPlan = (accs, journals, s) => planNotifications({ settings: { ...OFF, ...s }, journals, accounts: accs, now }).filter((n) => n.id.startsWith('kk_card_'));
{
  const accs = withCards(mkCard('A', 'Aカード', settleOf(12)));
  const j = [...base, spend('A', 52800)];
  const before = cardPlan(accs, j, { cardBefore: true });
  ok(before.length >= 1 && before.length <= 2, '3日前の通知（先の2サイクル分まで）');
  ok(before[0] && atH(before[0].when, 9), '朝9時');
  ok(before[0]?.body.includes('Aカードの引き落とし日') && before[0].body.endsWith('の3日前です。'), '「○○の引き落とし日（m/d）の3日前です。」');
  ok(before.every(noMoney), '文面に金額は入らない');
  ok(before[0]?.route === '/credit', '行き先はクレジット');
  const both = cardPlan(accs, j, { cardBefore: true, cardDay: true });
  ok(both.length === before.length * 2, '当日もオンにすると、3日前と当日の2通ずつ');
  const dayOnly = cardPlan(accs, j, { cardDay: true });
  ok(dayOnly.length === before.length && dayOnly[0].body.endsWith('の引き落とし日です。') && atH(dayOnly[0].when, 9), '当日は朝9時に「引き落とし日です。」');
  ok(cardPlan(accs, j, { cardBefore: true, cardOff: { A: true } }).length === 0, 'カードごとにオフにできる');
  ok(cardPlan(accounts, j, { cardBefore: true }).length === 0, '引き落としの設定が無い負債科目は対象外');
  ok(cardPlan(accs, [...base, spend('A', 150000)], { cardBefore: true }).every(noMoney), '残高を上回る引き落としでも、警告は出さず、金額も書かない');
  ok(!cardPlan(accs, [...base, spend('A', 150000)], { cardBefore: true }).some((n) => /残高/.test(n.body)), '残高の文言は入らない');
}
{
  // 同じ日に2枚 → 1通にまとめる
  const accs = withCards(mkCard('A', 'Aカード', settleOf(12)), mkCard('B', 'Bカード', settleOf(12), 'bank2'));
  const j = [...base, spend('A', 30000), spend('B', 20000)];
  const plan = cardPlan(accs, j, { cardBefore: true });
  ok(plan.length >= 1 && plan.length <= 2, '同じ日の2枚は1通（先の2サイクル分で最大2通）');
  ok(plan[0].body.includes('Aカード・Bカード'), '名前を並べる');
  ok(plan.every(noMoney), '金額なし');
  // 引き落とし日が別の2枚 → 別々
  const accs2 = withCards(mkCard('A', 'Aカード', settleOf(12)), mkCard('B', 'Bカード', settleOf(18)));
  const plan2 = cardPlan(accs2, [...base, spend('A', 30000), spend('B', 20000)], { cardBefore: true });
  const a = plan2.find((n) => n.body.includes('Aカード') && !n.body.includes('Bカード'));
  const b = plan2.find((n) => n.body.includes('Bカード') && !n.body.includes('Aカード'));
  ok(!!a && !!b && a.id !== b.id, '日が違えば別々の通知');
  // 4枚以上
  const four = withCards(...['A', 'B', 'C', 'D', 'E'].map((x) => mkCard(x, `${x}カード`, settleOf(12))));
  const p4 = cardPlan(four, [...base, ...['A', 'B', 'C', 'D', 'E'].map((x) => spend(x, 1000))], { cardBefore: true });
  ok(p4[0].body.includes('ほか2件'), '4枚以上は「ほか○件」');
}

console.log('定期取引');
{
  const rec = (id, name, nextDate, frequency = 'monthly') => ({ id, name, frequency, nextDate, lines: [dr('food', 80000), cr('bank', 80000)] });
  const plan = (recurring, journals = base, s = { recBefore: true }) =>
    planNotifications({ settings: { ...OFF, ...s }, journals, accounts, recurring, now }).filter((n) => n.id.startsWith('kk_rec_'));

  const p = plan([rec('r1', '家賃', D(5))]);
  ok(p.length === 1 && p[0].id === `kk_rec_${D(5)}_b`, '予定日の3日前の通知が1通');
  ok(atH(p[0].when, 9) && p[0].body.endsWith('の3日前です。') && p[0].body.includes('家賃の予定日'), '朝9時・「家賃の予定日（m/d）の3日前です。」');
  ok(noMoney(p[0]), '金額は入らない');
  ok(p[0].route === '/manage/recurring', '行き先は定期取引');
  const both = plan([rec('r1', '家賃', D(5))], base, { recBefore: true, recDay: true });
  ok(both.length === 2 && both.some((n) => n.id.endsWith('_d') && n.body.endsWith('の予定日です。')), '当日もオンにすると3日前と当日の2通');
  ok(plan([rec('r1', '家賃', D(2))]).length === 0, '予定日まで3日を切っていれば、3日前の通知は出ない（もう過ぎた時刻）');
  ok(plan([rec('r1', '家賃', D(2))], base, { recDay: true }).length === 1, 'その場合も当日の通知は出る');
  const same = plan([rec('r1', '家賃', D(5)), rec('r2', 'ジム', D(5)), rec('r3', '保険', D(5)), rec('r4', '配信', D(5))]);
  ok(same.length === 1 && same[0].body.includes('家賃・ジム・保険ほか1件'), '同じ日の予定は1通にまとめる（4件目以降は「ほかN件」）');
  ok(plan([rec('w', '積立', D(4), 'weekly')]).length === 3, '毎週なら先の3週間に3回（3日前の通知）');
  ok(plan([rec('r1', '家賃', D(-2))], base, { recBefore: true, recDay: true }).every((n) => !n.id.includes(D(-2))), '期日を過ぎた分は通知しない');
  ok(plan([{ ...rec('r1', '家賃', D(5)), desc: '家賃' }], [...base, { id: 'g', date: D(5), desc: '家賃', lines: [dr('food', 1), cr('bank', 1)] }]).length === 0, '記帳済みの予定日は通知しない');
  ok(plan([rec('r1', '家賃', D(5))], base, {}).length === 0, 'オフなら出さない');
  ok(plan([]).length === 0, '定期取引が無ければ出さない');
}

console.log('週次・月次');
{
  const withData = [...base, jr(D(-2), [dr('bank', 30000), cr('sal', 30000)])];
  const w = planNotifications({ settings: { ...OFF, weekly: true }, journals: withData, accounts, now }).filter((n) => n.id.startsWith('kk_week_'));
  ok(w.length >= 3 && w.length <= 4 && w.every((n) => n.when.getDay() === 0 && atH(n.when, 20)), '週次は日曜の20時から先の数週間分');
  ok(w[0].body === '今週の純資産の増減を確認できます。' && w.every(noMoney), '週次の文面に金額は入らない');
  ok(w[0].route === '/', '行き先はダッシュボード');
  const m = planNotifications({ settings: { ...OFF, monthly: true }, journals: withData, accounts, now }).filter((n) => n.id.startsWith('kk_month_'));
  ok(m.length === 3 && m.every((n) => n.when.getDate() === 1 && atH(n.when, 9)), '月次は毎月1日の朝9時から先の3か月分');
  ok(m[0].body === '先月の純資産と収支を確認できます。' && m.every(noMoney), '月次の文面に金額は入らない');
  ok(m[0].route === '/reports', '行き先はレポート');
  ok(planNotifications({ settings: { ...OFF, weekly: true, monthly: true }, journals: [], accounts, now }).length === 0, '帳簿が空なら送らない');
}

console.log('初期値のままの並びと数');
{
  const accs = withCards(mkCard('A', 'Aカード', settleOf(12)));
  const recurring = [{ id: 'r1', name: '家賃', frequency: 'monthly', nextDate: D(8), lines: [dr('food', 80000), cr('bank', 80000)] }];
  const j = [...base, spend('A', 1000)];
  const plan = planNotifications({ settings: DEFAULT_SETTINGS, journals: j, accounts: accs, recurring, now });
  ok(plan.every((n, i) => i === 0 || plan[i - 1].when <= n.when), '時刻の早い順');
  ok(!plan.some((n) => n.id.startsWith('kk_rem_') || n.id.startsWith('kk_week_')), '初期値ではリマインダーと週次は予約されない');
  ok(!plan.some((n) => n.id.endsWith('_d')), '初期値では当日の通知は予約されない');
  ok(plan.every(noMoney), 'どの通知にも金額は入らない');
  ok(new Set(plan.map((n) => n.id)).size === plan.length, 'ID が重ならない');
  const many = Array.from({ length: 40 }, (_, i) => ({ id: `r${i}`, name: `定期${i}`, frequency: 'weekly', nextDate: D(4 + (i % 7)), lines: [dr('food', 1), cr('bank', 1)] }));
  const worst = planNotifications({
    settings: { reminder: '23:59', cardBefore: true, cardDay: true, cardOff: {}, recBefore: true, recDay: true, weekly: true, monthly: true },
    journals: j, accounts: accs, recurring: many, now,
  });
  ok(worst.length <= 60, 'どれだけ多くても 60件まで（iOS の上限64件に収まる）');
}

if (ng) { console.log(`\n${ng} 件 NG`); process.exit(1); }
console.log('\nすべて ok');
