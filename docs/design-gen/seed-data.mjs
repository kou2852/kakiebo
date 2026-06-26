export function buildDataset() {
  let n = 0;
  const uid = () => `j${(++n).toString().padStart(3, '0')}`;
  const J = (date, desc, lines, tagId) => ({ id: uid(), date, desc, lines: lines.map((l) => ({ ...l, taxRate: 0 })), ...(tagId ? { tagId } : {}) });
  const dr = (accountId, amount) => ({ accountId, side: 'dr', amount });
  const cr = (accountId, amount) => ({ accountId, side: 'cr', amount });
  const journals = [];

  // 期首残高（2026-04-01）
  journals.push(J('2026-04-01', '期首残高', [
    dr('a01', 80000), dr('a02', 1800000), dr('a03', 1000000),
    dr('a05', 1200000), dr('a06', 1500000),
    cr('b04', 800000), cr('c01', 4780000),
  ]));

  const months = ['2026-04', '2026-05', '2026-06'];
  let cardBalance = 0; // 前月クレカ利用残高（翌月引落）
  months.forEach((ym, mi) => {
    const isCurrent = mi === months.length - 1; // 6月は途中まで
    const d = (day) => `${ym}-${String(day).padStart(2, '0')}`;
    // 給与
    journals.push(J(d(25), '給与', [dr('a02', 285000), cr('d01', 285000)]));
    // 固定費
    journals.push(J(d(27), '家賃', [dr('e09', 92000), cr('a02', 92000)], 't3'));
    journals.push(J(d(10), '電気・ガス・水道', [dr('e03', 14500), cr('a02', 14500)], 't3'));
    journals.push(J(d(10), '携帯・通信', [dr('e04', 8900), cr('a02', 8900)], 't3'));
    journals.push(J(d(27), '生命保険', [dr('e10', 12000), cr('a02', 12000)], 't3'));
    // ATM 出金（振替）
    journals.push(J(d(5), 'ATM 引き出し', [dr('a01', 50000), cr('a02', 50000)]));
    // 食費（現金）
    journals.push(J(d(3), 'スーパー', [dr('e01', 4280), cr('a01', 4280)], 't1'));
    journals.push(J(d(8), '青果店', [dr('e01', 1860), cr('a01', 1860)], 't1'));
    journals.push(J(d(15), 'コンビニ', [dr('e01', 720), cr('a01', 720)], 't1'));
    // 交通費（現金）
    journals.push(J(d(6), '電車・バス', [dr('e05', 3200), cr('a01', 3200)], 't1'));
    // クレカ利用
    const cardUses = [
      J(d(4), 'ネットスーパー', [dr('e01', 6800), cr('b03', 6800)], 't1'),
      J(d(7), 'ドラッグストア', [dr('e02', 3540), cr('b03', 3540)], 't1'),
      J(d(12), '書店・映画', [dr('e07', 4200), cr('b03', 4200)], 't2'),
      J(d(18), '衣料品', [dr('e08', 7900), cr('b03', 7900)], 't2'),
    ];
    journals.push(...cardUses);
    const thisCardTotal = cardUses.reduce((s, j) => s + j.lines[0].amount, 0);
    // 医療費（時々）
    if (mi === 1) journals.push(J(d(14), '通院', [dr('e06', 2200), cr('a01', 2200)], 't1'));
    // 副業（5月）
    if (mi === 1) journals.push(J(d(20), '副業 報酬', [dr('a02', 40000), cr('d02', 40000)]));
    // 前月クレカの引落（10日）
    if (cardBalance > 0) journals.push(J(d(10), 'クレジット引き落とし', [dr('b03', cardBalance), cr('a02', cardBalance)]));
    cardBalance = isCurrent ? cardBalance : thisCardTotal;
  });

  return {
    accounts: [
      { id: 'a01', code: '1001', name: '現金', type: 'asset', sys: 1 }, { id: 'a02', code: '1002', name: '普通預金', type: 'asset', sys: 1 }, { id: 'a03', code: '1003', name: '定期預金', type: 'asset', sys: 1 }, { id: 'a04', code: '1101', name: '売掛金', type: 'asset', sys: 1 }, { id: 'a05', code: '1201', name: '有価証券', type: 'asset', sys: 1 }, { id: 'a06', code: '1301', name: '固定資産', type: 'asset', sys: 1 },
      { id: 'b01', code: '2001', name: '買掛金', type: 'liability', sys: 1 }, { id: 'b02', code: '2002', name: '未払金', type: 'liability', sys: 1 }, { id: 'b03', code: '2101', name: 'クレジットカード', type: 'liability', sys: 1, ccClose: 15, ccDay: 27, ccDelay: 1, ccFrom: 'a02' }, { id: 'b04', code: '2201', name: '借入金', type: 'liability', sys: 1 },
      { id: 'c01', code: '3001', name: '元入金', type: 'equity', sys: 1 }, { id: 'c02', code: '3101', name: '繰越利益', type: 'equity', sys: 1 },
      { id: 'd01', code: '4001', name: '給与収入', type: 'income', sys: 1 }, { id: 'd02', code: '4002', name: '副業収入', type: 'income', sys: 1 }, { id: 'd03', code: '4003', name: '利子収入', type: 'income', sys: 1 }, { id: 'd04', code: '4004', name: '雑収入', type: 'income', sys: 1 },
      { id: 'e01', code: '5001', name: '食費', type: 'expense', sys: 1 }, { id: 'e02', code: '5002', name: '日用品費', type: 'expense', sys: 1 }, { id: 'e03', code: '5003', name: '光熱費', type: 'expense', sys: 1 }, { id: 'e04', code: '5004', name: '通信費', type: 'expense', sys: 1 }, { id: 'e05', code: '5005', name: '交通費', type: 'expense', sys: 1 }, { id: 'e06', code: '5006', name: '医療費', type: 'expense', sys: 1 }, { id: 'e07', code: '5007', name: '娯楽費', type: 'expense', sys: 1 }, { id: 'e08', code: '5008', name: '衣服費', type: 'expense', sys: 1 }, { id: 'e09', code: '5009', name: '住居費', type: 'expense', sys: 1 }, { id: 'e10', code: '5010', name: '保険料', type: 'expense', sys: 1 }, { id: 'e11', code: '5011', name: '教育費', type: 'expense', sys: 1 }, { id: 'e12', code: '5012', name: '雑費', type: 'expense', sys: 1 },
    ],
    journals,
    tags: [
      { id: 't1', name: '生活費', color: '#6090d8' },
      { id: 't2', name: '趣味・娯楽', color: '#d08030' },
      { id: 't3', name: '固定費', color: '#5cb87a' },
      { id: 't4', name: '投資', color: '#a070c0' },
    ],
    allocs: [
      { accountId: 'a02', tagId: 't1', amount: 300000 },
      { accountId: 'a02', tagId: 't3', amount: 200000 },
      { accountId: 'a05', tagId: 't4', amount: 1200000 },
    ],
    wallets: [
      { id: 'w1', name: '日常口座', accountId: 'a02' },
      { id: 'w2', name: '財布', accountId: 'a01' },
      { id: 'w3', name: 'メインカード', accountId: 'b03' },
    ],
    presets: [
      { id: 'p1', walletId: 'w2', type: 'out', name: '食費(現金)', lines: [{ accountId: 'e01', side: 'dr', amount: 0 }, { accountId: 'a01', side: 'cr', amount: 0 }] },
      { id: 'p2', walletId: 'w3', type: 'out', name: '日用品(カード)', lines: [{ accountId: 'e02', side: 'dr', amount: 0 }, { accountId: 'b03', side: 'cr', amount: 0 }] },
    ],
    budgets: [
      { accountId: 'e01', amount: 60000 },
      { accountId: 'e07', amount: 20000 },
      { accountId: 'e03', amount: 16000 },
      { accountId: 'e04', amount: 9000 },
      { accountId: 'e09', amount: 92000 },
    ],
    recurring: [
      { id: 'r1', name: '家賃', frequency: 'monthly', day: 27, nextDate: '2026-07-27', lines: [{ accountId: 'e09', side: 'dr', amount: 92000 }, { accountId: 'a02', side: 'cr', amount: 92000 }] },
      { id: 'r2', name: 'サブスク', frequency: 'monthly', day: 5, nextDate: '2026-07-05', lines: [{ accountId: 'e07', side: 'dr', amount: 1980 }, { accountId: 'b03', side: 'cr', amount: 1980 }] },
      { id: 'r3', name: '給与', frequency: 'monthly', day: 25, nextDate: '2026-07-25', lines: [{ accountId: 'a02', side: 'dr', amount: 285000 }, { accountId: 'd01', side: 'cr', amount: 285000 }] },
    ],
    rules: [
      { id: 'rl1', keyword: 'スーパー', drAccountId: 'e01', crAccountId: 'a01' },
      { id: 'rl2', keyword: 'コンビニ', drAccountId: 'e01', crAccountId: 'a01' },
    ],
  };
}
