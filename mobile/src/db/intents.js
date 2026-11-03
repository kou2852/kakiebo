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

/**
 * 仕訳の保存に、記帳日（createdAt・最初の一度だけ）と更新日（updatedAt・保存のたび）を付ける。
 * 仕訳帳の並べ替え（取引日・記帳日・更新日）が使う。ほかの意図はそのまま返す。
 * サーバーも同じ項目を持つので、同期のあとはサーバーの値に置き換わる。
 */
export function stamp(intent, now = new Date().toISOString()) {
  if (intent?.t !== 'upsert' || intent.c !== 'journals' || !intent.item) return intent;
  return { ...intent, item: { ...intent.item, createdAt: intent.item.createdAt || now, updatedAt: now } };
}

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
