// 仕訳を削除するときの確認を、次回から出さない設定。端末ごとに持つ（同期しない）。
//
// ⚠ 確認なしだと押し間違いが取り返せない。出さない設定にしたあとも、
//   設定画面から必ず元に戻せるようにしておく（settings.jsx の「仕訳の削除時に確認」）。
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'skipJournalDeleteConfirm';

export async function getSkipDeleteConfirm() {
  try { return (await AsyncStorage.getItem(KEY)) === '1'; } catch { return false; }
}

export async function setSkipDeleteConfirm(skip) {
  try {
    if (skip) await AsyncStorage.setItem(KEY, '1');
    else await AsyncStorage.removeItem(KEY);
  } catch { /* 保存できなくても、確認を出し続けるだけで安全側に倒れる */ }
}
