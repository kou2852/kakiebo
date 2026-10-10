// 「動画広告を見たら、その日は広告を消す」の保存と、画面から使うフック。
// 判定そのものは utils/adFree.js（純関数）。ここは AsyncStorage と、期限が来たときの切り替え。
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { grant, isActive } from './utils/adFree';

const KEY = 'ads.free';
const listeners = new Set();

async function read() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

/** いま広告を消してよいか（広告を出す側の判定用） */
export async function isAdFreeNow() {
  return isActive(await read());
}

/** 動画を最後まで見たとき。その日の終わりまで広告を消す。 */
export async function grantAdFree() {
  const g = grant();
  await AsyncStorage.setItem(KEY, JSON.stringify(g)).catch(() => {});
  listeners.forEach((fn) => fn(g));
  return g;
}

/** { active, until } 。期限が来たら自動で false に戻る。 */
export function useAdFree() {
  const [state, setState] = useState(null);
  // 期限の時刻に再計算させるための刻み。時刻が過ぎたら isActive が偽になる。
  const [, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = () => read().then((v) => { if (alive) setState(v); });
    load();
    listeners.add(setState);
    // アプリを開き直したとき、日付をまたいでいれば切れているはず
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') load(); });
    return () => { alive = false; listeners.delete(setState); sub.remove(); };
  }, []);

  // 期限の時刻に切り替える（開いたままでも日付をまたげば広告が戻る）
  useEffect(() => {
    if (!state?.until) return undefined;
    const ms = state.until - Date.now();
    if (ms <= 0) return undefined;
    const id = setTimeout(() => setTick((n) => n + 1), Math.min(ms + 500, 2 ** 31 - 1));
    return () => clearTimeout(id);
  }, [state]);

  const active = isActive(state);
  return { active, until: active ? state.until : null };
}
