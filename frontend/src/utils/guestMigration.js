// ゲスト（お試し利用）のデータを、本登録したアカウントへ引き継ぐための判定。
//
// 2026-08 の障害への対応でここに切り出した。それまでは DataContext の初期ロード内に
// 直書きされており、既存アカウントへゲストの既定データを流し込んで、利用者が変更した
// 科目名・コードを既定値に戻してしまっていた（実被害2件）。
// 判定を単体で検証できるようにするため、副作用のない関数として独立させている。

// デフォルト勘定科目。backend/src/handlers/postConfirm.js の DEFAULT_ACCOUNTS と同一に保つこと。
// 片方だけ変更すると、既定科目が「改名済み」と誤判定される（移行が止まる側なので安全側に倒れる）。
export const DEFAULT_ACCOUNTS = [
  {id:'a01',code:'1001',name:'現金',type:'asset',sys:1},{id:'a02',code:'1002',name:'普通預金',type:'asset',sys:1},{id:'a03',code:'1003',name:'定期預金',type:'asset',sys:1},{id:'a04',code:'1101',name:'売掛金',type:'asset',sys:1},{id:'a05',code:'1201',name:'有価証券',type:'asset',sys:1},{id:'a06',code:'1301',name:'固定資産',type:'asset',sys:1},
  {id:'b01',code:'2001',name:'買掛金',type:'liability',sys:1},{id:'b02',code:'2002',name:'未払金',type:'liability',sys:1},{id:'b03',code:'2101',name:'クレジットカード',type:'liability',sys:1},{id:'b04',code:'2201',name:'借入金',type:'liability',sys:1},
  {id:'c01',code:'3001',name:'元入金',type:'equity',sys:1},{id:'c02',code:'3101',name:'繰越利益',type:'equity',sys:1},
  {id:'d01',code:'4001',name:'給与収入',type:'income',sys:1},{id:'d02',code:'4002',name:'副業収入',type:'income',sys:1},{id:'d03',code:'4003',name:'利子収入',type:'income',sys:1},{id:'d04',code:'4004',name:'雑収入',type:'income',sys:1},{id:'d05',code:'4005',name:'評価損益',type:'income',sys:1},
  {id:'e01',code:'5001',name:'食費',type:'expense',sys:1},{id:'e02',code:'5002',name:'日用品費',type:'expense',sys:1},{id:'e03',code:'5003',name:'光熱費',type:'expense',sys:1},{id:'e04',code:'5004',name:'通信費',type:'expense',sys:1},{id:'e05',code:'5005',name:'交通費',type:'expense',sys:1},{id:'e06',code:'5006',name:'医療費',type:'expense',sys:1},{id:'e07',code:'5007',name:'娯楽費',type:'expense',sys:1},{id:'e08',code:'5008',name:'衣服費',type:'expense',sys:1},{id:'e09',code:'5009',name:'住居費',type:'expense',sys:1},{id:'e10',code:'5010',name:'保険料',type:'expense',sys:1},{id:'e11',code:'5011',name:'教育費',type:'expense',sys:1},{id:'e12',code:'5012',name:'雑費',type:'expense',sys:1},
];

// デフォルトプリセット（手動作成と同じ扱い・特別フラグなし。口座未登録のため walletId は空）
export const DEFAULT_PRESETS = [
  { id: 'pd1', walletId: '', type: 'out', name: '食費（カード払い）', desc: '', lines: [{ accountId: 'e01', side: 'dr', amount: 0, tagId: '' }, { accountId: 'b03', side: 'cr', amount: 0, tagId: '' }] },
  { id: 'pd2', walletId: '', type: 'in', name: '給与（入金）', desc: '', lines: [{ accountId: 'a02', side: 'dr', amount: 0, tagId: '' }, { accountId: 'd01', side: 'cr', amount: 0, tagId: '' }] },
  { id: 'pd3', walletId: '', type: 'out', name: '現金引き出し', desc: '', lines: [{ accountId: 'a01', side: 'dr', amount: 0, tagId: '' }, { accountId: 'a02', side: 'cr', amount: 0, tagId: '' }] },
];

// 既定データは固定IDで、サーバー側にも同じIDで存在する（seedDefaults が投入）。
// ゲスト側から送るとIDごと上書きになり、利用者が変更した科目名・コードが失われる。
const DEFAULT_ACCOUNT_IDS = new Set(DEFAULT_ACCOUNTS.map((a) => a.id));
const DEFAULT_PRESET_IDS = new Set(DEFAULT_PRESETS.map((p) => p.id));

/** ゲストデータから固定IDの既定分を除く。残るのは uid() 採番でサーバーと衝突しないものだけ。 */
export function stripSeedDefaults(g) {
  return {
    ...g,
    accounts: (g.accounts || []).filter((a) => !DEFAULT_ACCOUNT_IDS.has(a.id)),
    presets: (g.presets || []).filter((p) => !DEFAULT_PRESET_IDS.has(p.id)),
  };
}

/** 移行する中身が残っているか。既定分を除いたあとで判定する。 */
export function hasGuestContent(g) {
  return !!(g.journals?.length || g.accounts?.length || g.tags?.length || g.wallets?.length
    || g.budgets?.length || g.recurring?.length || g.rules?.length || g.allocs?.length
    || g.presets?.length);
}

/**
 * 既に使われているアカウントか。ゲストデータの移行は「ゲスト→新規登録」の初回にしか成立しない。
 * 新規登録時点で科目29件・プリセット3件・PROFILE がシードされるため、レコードの有無では判定できない。
 * シードで作られないもの、または既定科目に手が入っている場合を「既存」とみなす。
 */
export function isExistingAccount(d) {
  if (!d) return false;
  if (d.journals?.length || d.tags?.length || d.wallets?.length || d.budgets?.length
    || d.recurring?.length || d.rules?.length || d.allocs?.length) return true;
  if (d.accounts?.some((a) => !a.sys)) return true; // 利用者が追加した科目
  // 既定科目の改名・コード変更・削除。名前だけ変えて未記帳の利用者はここでしか拾えない
  const cur = new Map((d.accounts || []).map((a) => [a.id, a]));
  for (const def of DEFAULT_ACCOUNTS) {
    const a = cur.get(def.id);
    if (!a) return true;
    if (a.name !== def.name || a.code !== def.code) return true;
  }
  return false;
}

/**
 * 移行するかどうかを決める。副作用は持たず、判断と送信内容だけを返す。
 *
 * @param guest       ブラウザに残っていたゲストデータ（無ければ null）
 * @param encBundle   サーバーのE2E鍵バンドル。あればE2E利用者＝既存とみなす
 * @param fetchServer サーバーの内容を取る関数。判定に必要なときだけ呼ぶ
 * @returns { migrate, payload, served }
 *          served は判定のために取得した内容。移行しない場合はそのまま初期表示に使える。
 *          移行する場合は取り込みで内容が変わるため null を返し、呼び出し側に読み直させる。
 */
export async function planGuestMigration({ guest, encBundle, fetchServer }) {
  if (!guest) return { migrate: false, payload: null, served: null };
  // E2E利用者は平文レコードを消しているため中身が空に見える。判定できないので移行しない
  if (encBundle) return { migrate: false, payload: null, served: null };

  const served = await fetchServer();
  if (isExistingAccount(served)) return { migrate: false, payload: null, served };

  const payload = stripSeedDefaults(guest);
  if (!hasGuestContent(payload)) return { migrate: false, payload: null, served };
  return { migrate: true, payload, served: null };
}
