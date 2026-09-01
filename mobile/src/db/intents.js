// 操作を「意図」として記録し、同期時にサーバー最新のデータセットへ再適用する。
// オフライン中の編集を、他端末の更新を消さずに反映するための仕組み。
// Web 版 DataContext の 409 リトライ（サーバー最新に自分の操作を載せ直す）と同じ考え方で、
// スナップショットを丸ごと上書きしない。

export const COLLECTIONS = [
  'accounts', 'journals', 'tags', 'allocs', 'wallets', 'presets', 'budgets', 'recurring', 'rules',
];

export const upsert = (c, item) => ({ t: 'upsert', c, item });
export const remove = (c, id) => ({ t: 'remove', c, id });
/** id を持たないコレクション（budgets / allocs）用。全置換になる。 */
export const replace = (c, items) => ({ t: 'replace', c, items });

/** 意図を1つ適用した新しいデータセットを返す（引数は変更しない）。 */
export function applyIntent(dataset, intent) {
  const cur = dataset[intent.c] || [];
  switch (intent.t) {
    case 'upsert': {
      const i = cur.findIndex((x) => x.id === intent.item.id);
      const next = i < 0 ? [...cur, intent.item] : cur.map((x, j) => (j === i ? intent.item : x));
      return { ...dataset, [intent.c]: next };
    }
    case 'remove':
      return { ...dataset, [intent.c]: cur.filter((x) => x.id !== intent.id) };
    case 'replace':
      return { ...dataset, [intent.c]: intent.items };
    default:
      return dataset;
  }
}

export function applyIntents(dataset, intents) {
  return intents.reduce(applyIntent, dataset);
}
