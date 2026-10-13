// ホームに出す項目の並びを端末に保存する（utils/homeLayout.js の形）。アカウントでは共有しない。
// ホームと編集画面で同じ状態を見る。どちらかで変わったら両方を描き直す。
import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_LAYOUT, normalizeLayout } from '../utils/homeLayout';

const KEY = 'home.layout';
let current = DEFAULT_LAYOUT;
let loaded = false;
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn());

async function load() {
  if (loaded) return;
  loaded = true;
  try {
    const v = await AsyncStorage.getItem(KEY);
    current = normalizeLayout(v ? JSON.parse(v) : null);
  } catch { current = normalizeLayout(null); }
  emit();
}

export function setHomeLayout(next) {
  current = normalizeLayout(next);
  emit();
  AsyncStorage.setItem(KEY, JSON.stringify(current)).catch(() => { /* 保存できなくても、この起動中は効く */ });
}

const subscribe = (fn) => {
  listeners.add(fn);
  load();
  return () => { listeners.delete(fn); };
};

export function useHomeLayout() {
  return useSyncExternalStore(subscribe, () => current);
}
