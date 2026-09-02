// 貸借対照表の置き場所の確認。
// 差引純資産は「資産−負債」であり、どこに置いても値が変わってはいけない。
// マイナス残の負債（払いすぎたカード）を資産側に並べないことも確かめる。
import { balanceSheet } from '../src/utils/bookkeeping.js';

const A = (id, name, type) => ({ id, name, type, code: '' });
const accounts = [
  A('cash', '現金', 'asset'),
  A('bank', '普通預金', 'asset'),
  A('card', 'クレジットカード', 'liability'),
  A('pay', '給与', 'income'),
  A('food', '食費', 'expense'),
];
let n = 0;
const j = (date, amount, dr, cr) => ({
  id: `j${++n}`, date, desc: '',
  lines: [{ accountId: dr, side: 'dr', amount }, { accountId: cr, side: 'cr', amount }],
});

let ng = 0;
const check = (name, cond, extra = '') => { if (!cond) { console.log('  NG', name, extra); ng++; } };

const run = (label, journals, want) => {
  const bs = balanceSheet(journals, accounts, '2026-12-31');
  const names = (rows) => rows.map((r) => `${r.name}:${r.amount}`).join(' ') || '(なし)';
  console.log(`${label}\n   資産   ${names(bs.assets)} → ${bs.asset}`
    + `\n   負債   ${names(bs.liabilities)} → ${bs.liability}\n   純資産 ${bs.netWorth}`);
  check(`${label} 差引純資産`, bs.netWorth === want, `${bs.netWorth} ≠ ${want}`);
  check(`${label} 資産合計が行と一致`, bs.asset === bs.assets.reduce((s, r) => s + r.amount, 0));
  check(`${label} 負債合計が行と一致`, bs.liability === bs.liabilities.reduce((s, r) => s + r.amount, 0));
  // 円グラフはマイナスを描けない。資産側は必ず正でないと絵と合計がずれる。
  check(`${label} 資産側にマイナスなし`, bs.assets.every((r) => r.amount > 0));
  return bs;
};

// 1. ふつう: 給与20万を現金で受け取り、カードで3万使う
const base = [j('2026-01-01', 200000, 'cash', 'pay'), j('2026-01-05', 30000, 'food', 'card')];
run('ふつう', base, 170000);

// 2. カードを5万返済 → カード残高が -2万（借方残）になる。
//    現金からカードへ動いただけなので、純資産は 17万のまま変わらない。
const b = run('カードの払いすぎ', [...base, j('2026-01-20', 50000, 'card', 'cash')], 170000);
check('払いすぎたカードは資産側に出ない', !b.assets.some((r) => r.name === 'クレジットカード'),
  '資産側: ' + b.assets.map((r) => r.name).join(','));
check('払いすぎたカードは負債側にマイナスで残る',
  b.liabilities.some((r) => r.name === 'クレジットカード' && r.amount === -20000));

// 3. 口座がマイナス（引き落とし超過）→ 実質の借金なので負債へ振り替える
const c = run('口座のマイナス', [j('2026-02-01', 30000, 'food', 'bank')], -30000);
check('マイナスの口座は資産側に出ない', !c.assets.some((r) => r.name === '普通預金'));
check('マイナスの口座は負債側に振替として出る',
  c.liabilities.some((r) => r.name === '普通預金' && r.amount === 30000 && r.reclassified));

console.log(ng ? `\n${ng} 件 失敗` : '\nすべて成功');
process.exit(ng ? 1 : 0);
