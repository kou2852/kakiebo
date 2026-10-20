// 一覧の並びを端末に保存する（utils/listOrder.js の形）。アカウントでは共有しない。
// 画面とデータの入口（DataProvider）が同じ状態を見る。どちらかで変わったら両方を描き直す。
import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { mergeOrder, normalizeOrder } from '../utils/listOrder';

const KEY = 'list.order';
let current = normalizeOrder(null);
let loaded = false;
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn());

async function load() {
  if (loaded) return;
  loaded = true;
  try {
    const v = await AsyncStorage.getItem(KEY);
    current = normalizeOrder(v ? JSON.parse(v) : null);
  } catch { current = normalizeOrder(null); }
  emit();
}

/** 見えている一覧（ids）の並びを保存する。見えていない項目の位置は動かさない */
export function setListOrder(key, ids) {
  current = normalizeOrder({ ...current, [key]: mergeOrder(current[key], ids) });
  emit();
  AsyncStorage.setItem(KEY, JSON.stringify(current)).catch(() => { /* 保存できなくても、この起動中は効く */ });
}

const subscribe = (fn) => {
  listeners.add(fn);
  load();
  return () => { listeners.delete(fn); };
};

export function useListOrder() {
  return useSyncExternalStore(subscribe, () => current);
}
