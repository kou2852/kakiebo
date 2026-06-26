// ティア別の広告表示設定とゲスト制限。
// 課金は未実装のため、実ログインユーザーは全員 'free' 扱い。
// navEvery: ページ遷移 N 回ごとにインライン広告を1回表示（0 で無効）。
export const AD_CONFIG = {
  guest:  { sidebar: true,  dashboard: true,  ledger: true,  navEvery: 3 },
  free:   { sidebar: true,  dashboard: true,  ledger: true,  navEvery: 6 },
  pro:    { sidebar: false, dashboard: false, ledger: false, navEvery: 0 },
  family: { sidebar: false, dashboard: false, ledger: false, navEvery: 0 },
};

// ゲストの軽い上限（新規作成数）。アカウント登録で解除。
export const GUEST_LIMITS = { tags: 5, wallets: 5, accounts: 5 };
