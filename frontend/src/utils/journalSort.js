// 仕訳帳の並べ替え（取引日・記帳日・更新日）。画面やネイティブに依存しない部分だけを置く。
// 検証: node src/utils/journalSort.check.mjs
//
// ・取引日 … 仕訳の日付（j.date。利用日・支払日など、取引があった日）
// ・記帳日 … レコードを作った日時（j.createdAt）。無い仕訳は取引日で代用する
// ・更新日 … レコードを最後に変えた日時（j.updatedAt）。無ければ記帳日、それも無ければ取引日で代用する
//
// 同じ値の中は、記帳日 → id の順で並べる（サーバーの id はランダムなので、そのままだと順がばらばらになる）。
// 日時は ISO 文字列（'2026-11-03T08:30:00.000Z'）。文字列のまま比べても時刻の順になる。
export const SORT_KEYS = [
  { id: 'date', label: '取引日' },
  { id: 'created', label: '記帳日' },
  { id: 'updated', label: '更新日' },
];

export const DEFAULT_SORT = { key: 'date', dir: 'desc' };

const created = (j) => j.createdAt || j.date || '';
const stampOf = (j, key) => {
  if (key === 'created') return created(j);
  if (key === 'updated') return j.updatedAt || created(j);
  return j.date || '';
};

/** 並べ替えた新しい配列を返す（元の配列は変えない）。dir: 'desc'（新しい順）| 'asc'（古い順） */
export function sortJournals(list, { key, dir } = DEFAULT_SORT) {
  const sign = dir === 'asc' ? 1 : -1;
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  return [...list].sort((a, b) => {
    const primary = cmp(stampOf(a, key), stampOf(b, key));
    if (primary) return sign * primary;
    const second = cmp(created(a), created(b));
    if (second) return sign * second;
    return sign * cmp(String(a.id || ''), String(b.id || ''));
  });
}

/**
 * 並びに対応する日時の表示（右寄せで出す小さな文字）。取引日の並びのときは出さない（日付は既に行に出ている）。
 * 例: 記帳日 → '記帳 11/03 09:30'、更新日 → '更新 11/03 09:30'。日時が無い古い仕訳は '' を返す。
 * 端末の時刻で表す（サーバーの値は UTC の ISO 文字列）。
 */
export function stampLabel(j, { key } = DEFAULT_SORT) {
  if (key === 'date') return '';
  const iso = key === 'updated' ? (j.updatedAt || j.createdAt) : j.createdAt;
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${key === 'updated' ? '更新' : '記帳'} ${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 保存してあった値が壊れていても、使える形に直す */
export function normalizeSort(v) {
  const key = SORT_KEYS.some((k) => k.id === v?.key) ? v.key : DEFAULT_SORT.key;
  const dir = v?.dir === 'asc' ? 'asc' : 'desc';
  return { key, dir };
}
