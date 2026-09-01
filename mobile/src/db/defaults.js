// 新規ユーザーの初期データ。backend/src/handlers/postConfirm.js と同一内容にしておくこと
// （オフライン初回起動でも同じ科目で始まり、後からサーバーと突き合わせても食い違わない）。

export const DEFAULT_ACCOUNTS = [
  { id: 'a01', code: '1001', name: '現金', type: 'asset', sys: 1 },
  { id: 'a02', code: '1002', name: '普通預金', type: 'asset', sys: 1 },
  { id: 'a03', code: '1003', name: '定期預金', type: 'asset', sys: 1 },
  { id: 'a04', code: '1101', name: '売掛金', type: 'asset', sys: 1 },
  { id: 'a05', code: '1201', name: '有価証券', type: 'asset', sys: 1 },
  { id: 'a06', code: '1301', name: '固定資産', type: 'asset', sys: 1 },
  { id: 'b01', code: '2001', name: '買掛金', type: 'liability', sys: 1 },
  { id: 'b02', code: '2002', name: '未払金', type: 'liability', sys: 1 },
  { id: 'b03', code: '2101', name: 'クレジットカード', type: 'liability', sys: 1 },
  { id: 'b04', code: '2201', name: '借入金', type: 'liability', sys: 1 },
  { id: 'c01', code: '3001', name: '元入金', type: 'equity', sys: 1 },
  { id: 'c02', code: '3101', name: '繰越利益', type: 'equity', sys: 1 },
  { id: 'd01', code: '4001', name: '給与収入', type: 'income', sys: 1 },
  { id: 'd02', code: '4002', name: '副業収入', type: 'income', sys: 1 },
  { id: 'd03', code: '4003', name: '利子収入', type: 'income', sys: 1 },
  { id: 'd04', code: '4004', name: '雑収入', type: 'income', sys: 1 },
  { id: 'd05', code: '4005', name: '評価損益', type: 'income', sys: 1 },
  { id: 'e01', code: '5001', name: '食費', type: 'expense', sys: 1 },
  { id: 'e02', code: '5002', name: '日用品費', type: 'expense', sys: 1 },
  { id: 'e03', code: '5003', name: '光熱費', type: 'expense', sys: 1 },
  { id: 'e04', code: '5004', name: '通信費', type: 'expense', sys: 1 },
  { id: 'e05', code: '5005', name: '交通費', type: 'expense', sys: 1 },
  { id: 'e06', code: '5006', name: '医療費', type: 'expense', sys: 1 },
  { id: 'e07', code: '5007', name: '娯楽費', type: 'expense', sys: 1 },
  { id: 'e08', code: '5008', name: '衣服費', type: 'expense', sys: 1 },
  { id: 'e09', code: '5009', name: '住居費', type: 'expense', sys: 1 },
  { id: 'e10', code: '5010', name: '保険料', type: 'expense', sys: 1 },
  { id: 'e11', code: '5011', name: '教育費', type: 'expense', sys: 1 },
  { id: 'e12', code: '5012', name: '雑費', type: 'expense', sys: 1 },
];

export const DEFAULT_PRESETS = [
  { id: 'pd1', walletId: '', type: 'out', name: '食費（カード払い）', desc: '', lines: [{ accountId: 'e01', side: 'dr', amount: 0, tagId: '' }, { accountId: 'b03', side: 'cr', amount: 0, tagId: '' }] },
  { id: 'pd2', walletId: '', type: 'in', name: '給与（入金）', desc: '', lines: [{ accountId: 'a02', side: 'dr', amount: 0, tagId: '' }, { accountId: 'd01', side: 'cr', amount: 0, tagId: '' }] },
  { id: 'pd3', walletId: '', type: 'out', name: '現金引き出し', desc: '', lines: [{ accountId: 'a01', side: 'dr', amount: 0, tagId: '' }, { accountId: 'a02', side: 'cr', amount: 0, tagId: '' }] },
];

export const emptyDataset = () => ({
  accounts: DEFAULT_ACCOUNTS,
  journals: [],
  tags: [],
  allocs: [],
  wallets: [],
  presets: DEFAULT_PRESETS,
  budgets: [],
  recurring: [],
  rules: [],
});
