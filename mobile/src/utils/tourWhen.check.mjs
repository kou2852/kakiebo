// tours.js の when（予定日が来た定期取引の有無で、出す段を切り替える）の検証。node src/utils/tourWhen.check.mjs
import { TOURS, stepShown } from '../tours.js';

let ng = 0;
const ok = (cond, name) => {
  if (cond) console.log(`  ok   ${name}`);
  else { ng++; console.log(`  NG   ${name}`); }
};
const keys = (data) => TOURS.monthly.steps.filter((s) => stepShown(s, data)).map((s) => s.key);

const rec = (nextDate) => ({
  id: 'r1', name: '家賃', frequency: 'monthly', nextDate, day: Number(nextDate.slice(8, 10)),
  lines: [{ accountId: 'e1', side: 'dr', amount: 80000 }, { accountId: 'a1', side: 'cr', amount: 80000 }],
});

console.log('⑤ 毎月のお金（when）');
{
  const due = keys({ recurring: [rec('2020-01-01')], journals: [] });
  ok(due.includes('m-home') && due.includes('m-open') && due.includes('m-gen') && !due.includes('m-wait'), '予定日が来ていれば、ホーム→開く→記帳する まで出す');
  const future = keys({ recurring: [rec('2999-01-01')], journals: [] });
  ok(future.includes('m-wait') && !future.includes('m-home') && !future.includes('m-open') && !future.includes('m-gen'), '予定日が先なら、説明だけにして記帳の段は出さない');
  const none = keys({ recurring: [], journals: [] });
  ok(none.includes('m-wait') && none.at(-1) === 'm-done', '定期取引が無ければ説明だけで、最後の段は出す');
  ok(TOURS.monthly.steps.filter((s) => !s.when).every((s) => stepShown(s, {})), 'when の無い段は常に出す');
}

console.log(ng ? `\n${ng} 件 NG` : '\nすべて ok');
process.exit(ng ? 1 : 0);
