// スクロールの知らせ（2026-10-21）。広告を「画面に近づいたら読み込む」ために、スクロールのたびに
// 各広告枠へ位置の見直しを知らせる。画面（Screen・仕訳帳の一覧）が持ち、枠（LazyAd）が購読する。
import { createContext } from 'react';

export const ScrollWatch = createContext(null);

export function createScrollWatch() {
  const fns = new Set();
  return {
    subscribe: (fn) => { fns.add(fn); return () => { fns.delete(fn); }; },
    // onScroll などにそのまま渡せる（引数は使わない）
    emit: () => fns.forEach((fn) => fn()),
  };
}
