// 取得結果を一定時間とっておく。タブを切り替えるたびに AWS を読み直さないためのもの。
// 同じキーの取得が走っている間に来た要求は、新しく取りに行かず同じ結果を待つ。
// 失敗した結果はとっておかない（次の要求でやり直す）。

const store = new Map(); // key -> { at, value }
const inflight = new Map(); // key -> Promise

/**
 * @param {string} key
 * @param {number} ttlMs とっておく時間
 * @param {() => Promise<any>} fn
 * @param {boolean} fresh true ならとっておいた結果を使わず取り直す
 * @returns {Promise<{value: any, fetchedAt: number, cached: boolean}>}
 */
export async function cached(key, ttlMs, fn, fresh = false) {
  const hit = store.get(key);
  if (!fresh && hit && Date.now() - hit.at < ttlMs) return { value: hit.value, fetchedAt: hit.at, cached: true };
  if (inflight.has(key)) return inflight.get(key);
  const p = (async () => {
    try {
      const value = await fn();
      const at = Date.now();
      store.set(key, { at, value });
      return { value, fetchedAt: at, cached: false };
    } finally { inflight.delete(key); }
  })();
  inflight.set(key, p);
  return p;
}

/** 前方一致でとっておいた結果を捨てる（返信を送ったあとに問い合わせだけ取り直すなど） */
export function invalidate(prefix) {
  for (const k of [...store.keys()]) if (k.startsWith(prefix)) store.delete(k);
}

/** 画面に見せる取得時刻（日本時間） */
export const jstStamp = (ms) => new Date(ms + 9 * 3600000).toISOString().replace('T', ' ').slice(0, 19);
