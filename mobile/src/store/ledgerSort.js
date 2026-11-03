// 仕訳帳の並べ方（取引日・記帳日・更新日と、新しい順・古い順）を、この端末に覚えておく。
// 端末ごとに保存する（同期しない。ホームの表示や一覧の並び替えと同じ扱い）。
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_SORT, normalizeSort } from '../utils/journalSort';

const KEY = 'ledger.sort';

export async function loadLedgerSort() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? normalizeSort(JSON.parse(raw)) : DEFAULT_SORT;
  } catch { return DEFAULT_SORT; /* 読めなければ初期値。仕訳帳は普通に開ける */ }
}

export function saveLedgerSort(sort) {
  AsyncStorage.setItem(KEY, JSON.stringify(normalizeSort(sort))).catch(() => {});
}
