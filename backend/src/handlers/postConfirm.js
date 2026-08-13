import { batchPut, putItem, getItem } from '../lib/db.js';

/** デフォルト勘定科目 (既存HTMLから移植) */
const DEFAULT_ACCOUNTS = [
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
  // 投資資産の評価替え用。評価損の月はマイナスの収益になる（費用側に置くと支出内訳の円グラフに混ざるため収益に置く）
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

/** デフォルトプリセット（手動作成と同じ扱い・特別フラグなし。口座未登録のため walletId は空） */
const DEFAULT_PRESETS = [
  { id: 'pd1', walletId: '', type: 'out', name: '食費（カード払い）', desc: '', lines: [{ accountId: 'e01', side: 'dr', amount: 0, tagId: '' }, { accountId: 'b03', side: 'cr', amount: 0, tagId: '' }] },
  { id: 'pd2', walletId: '', type: 'in', name: '給与（入金）', desc: '', lines: [{ accountId: 'a02', side: 'dr', amount: 0, tagId: '' }, { accountId: 'd01', side: 'cr', amount: 0, tagId: '' }] },
  { id: 'pd3', walletId: '', type: 'out', name: '現金引き出し', desc: '', lines: [{ accountId: 'a01', side: 'dr', amount: 0, tagId: '' }, { accountId: 'a02', side: 'cr', amount: 0, tagId: '' }] },
];

/** デフォルト勘定科目＋PROFILE を投入する（新規ユーザー初期化）。 */
export async function seedDefaults(userId, email) {
  const items = [
    ...DEFAULT_ACCOUNTS.map((a) => ({ SK: `ACCOUNT#${a.id}`, ...a })),
    ...DEFAULT_PRESETS.map((p) => ({ SK: `PRESET#${p.id}`, ...p })),
  ];
  await batchPut(userId, items);

  await putItem(userId, 'PROFILE', {
    email: email || '',
    createdAt: new Date().toISOString(),
    theme: 'light',
  });
}

/**
 * Cognito PostConfirmation トリガー。
 * 新規ユーザー確認完了時にデフォルト勘定科目を投入する。
 * 注: 外部IdP(Google)経由のユーザーでは発火しないため postAuth 側でも初期化する。
 *
 * このトリガーは新規登録の確認だけでなく、パスワード再設定の完了でも発火する
 * (triggerSource = PostConfirmation_ConfirmForgotPassword)。区別せずに投入すると
 * 既存利用者の科目が固定IDのまま上書きされ、変更した名称・コード・カード設定が失われる。
 * 実際に 2026-08 に別経路(ゲストデータの取り込み)で同じ壊れ方をした事故があり、
 * こちらは同じ結果を招く未発火の経路として塞ぐ。
 */
export async function handler(event) {
  if (event.triggerSource !== 'PostConfirmation_ConfirmSignUp') return event;

  const userId = event.request.userAttributes.sub;
  // 初期化済みなら何もしない。確認コードの再送→再確認などで二重に走っても壊さない。
  // 判定は postAuth と同じく PROFILE の有無で行う。
  if (await getItem(userId, 'PROFILE')) return event;

  await seedDefaults(userId, event.request.userAttributes.email);
  return event;
}
