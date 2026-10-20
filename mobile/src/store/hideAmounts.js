// ホームの金額を隠す（2026-10-17 追加）。純資産のカードの目のボタンで切り替え、端末ごとに保存する。
// 人前でアプリを開くときに、残高や収支を見られないようにするため。隠すのはホームの金額だけで、
// 記帳・仕訳帳・レポートなど自分で開く画面は隠さない（そこで隠すと入力や確認ができない）。
import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fa as faRaw, faBal as faBalRaw, fas as fasRaw } from '../utils/format';

const KEY = 'home.hideAmounts';
/** 隠したときに金額の代わりに出す文字 */
export const MASK = '¥•••••';

let current = false;
let loaded = false;
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn());

async function load() {
  if (loaded) return;
  loaded = true;
  try { current = (await AsyncStorage.getItem(KEY)) === '1'; } catch { current = false; }
  emit();
}

export function setHideAmounts(on) {
  current = !!on;
  emit();
  AsyncStorage.setItem(KEY, current ? '1' : '0').catch(() => { /* 保存できなくても、この起動中は効く */ });
}

const subscribe = (fn) => {
  listeners.add(fn);
  load();
  return () => { listeners.delete(fn); };
};

export function useHideAmounts() {
  return useSyncExternalStore(subscribe, () => current);
}

/** ホームで使う金額の書き方。隠しているときはどれも MASK を返す */
export function useMoney() {
  const hidden = useHideAmounts();
  const m = (fn) => (hidden ? () => MASK : fn);
  return { hidden, fa: m(faRaw), faBal: m(faBalRaw), fas: m(fasRaw) };
}
