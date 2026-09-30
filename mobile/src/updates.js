// 更新情報（ホーム右上のベル）。
//
// 記事はアプリに同梱せず、ウェブに置いた JSON を取りに行く（frontend/vite.config.js が
// config/updates.js の for:'app' の記事から書き出す）。同梱するとアプリの更新を出すまで届かないため。
// 取りに行くのは自前の CloudFront にある静的ファイルだけで、こちらからは何も送らない。
// 取れなかったときは前回の記事を出す（電波がないところでも読める）。
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const URL = 'https://app.kurofukubo.com/updates.json';
const CACHE_KEY = 'updates.cache';
const SEEN_KEY = 'updates.seen';

// '1.0.10' と '1.0.2' を数として比べる
const older = (a, b) => {
  const x = String(a).split('.').map(Number); const y = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0);
  }
  return false;
};

const appVersion = Constants.expoConfig?.version || '0';
// この版より新しいアプリ向けの記事（その版で入った機能の案内）は出さない
const forThisApp = (items) => (Array.isArray(items) ? items : [])
  .filter((u) => u && u.id && u.title && Array.isArray(u.items))
  .filter((u) => !u.minApp || !older(appVersion, u.minApp));

// ベルと一覧で同じ状態を見る。どちらかで変わったら両方を描き直す。
const state = { items: null, seen: null, failed: false };
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn({ ...state }));
let started = false;

async function start() {
  if (started) return;
  started = true;
  try {
    const [cache, seen] = await Promise.all([AsyncStorage.getItem(CACHE_KEY), AsyncStorage.getItem(SEEN_KEY)]);
    state.seen = seen;
    if (cache) state.items = forThisApp(JSON.parse(cache));
  } catch { /* 読めなければ取り直すだけ */ }
  emit();
  try {
    const res = await fetch(URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    const body = await res.json();
    state.items = forThisApp(body?.items);
    state.failed = false;
    AsyncStorage.setItem(CACHE_KEY, JSON.stringify(body?.items || [])).catch(() => {});
  } catch {
    state.failed = true;
  }
  emit();
}

export function useUpdates() {
  const [s, setS] = useState(() => ({ ...state }));
  useEffect(() => {
    listeners.add(setS);
    start();
    return () => { listeners.delete(setS); };
  }, []);
  const latest = s.items?.[0]?.id || null;
  return {
    items: s.items,
    failed: s.failed,
    unread: !!latest && s.seen !== latest,
    // 一覧を開いたら既読にする（Web 版と同じく、先頭の記事の id で見る）
    markSeen: () => {
      if (!latest || state.seen === latest) return;
      state.seen = latest;
      AsyncStorage.setItem(SEEN_KEY, latest).catch(() => {});
      emit();
    },
  };
}
