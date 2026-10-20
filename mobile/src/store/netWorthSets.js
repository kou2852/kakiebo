// 純資産に入れる科目の組み合わせを端末に保存する（utils/netWorthSets.js の形）。アカウントでは共有しない。
// ホームと設定の画面で同じ状態を見る（store/homeLayout.js と同じ作り）。
import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { normalizeSets } from '../utils/netWorthSets';

const KEY = 'networth.sets';
let current = normalizeSets(null);
let loaded = false;
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn());

async function load() {
  if (loaded) return;
  loaded = true;
  try {
    const v = await AsyncStorage.getItem(KEY);
    current = normalizeSets(v ? JSON.parse(v) : null);
  } catch { current = normalizeSets(null); }
  emit();
}

export function setNetWorthSets(next) {
  current = normalizeSets(next);
  emit();
  AsyncStorage.setItem(KEY, JSON.stringify(current)).catch(() => { /* 保存できなくても、この起動中は効く */ });
}

const subscribe = (fn) => {
  listeners.add(fn);
  load();
  return () => { listeners.delete(fn); };
};

export function useNetWorthSets() {
  return useSyncExternalStore(subscribe, () => current);
}
