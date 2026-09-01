// 端末のロック（Face ID / Touch ID / パスコード）でアプリを保護する。
// 家計データは端末内 SQLite に平文で持つため、端末を他人に触られたときの最後の砦になる。
// 有効・無効の設定は AsyncStorage（秘密ではないため SecureStore を使う必要がない）。
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';

const KEY = 'kk_biometric_lock';

/** この端末で生体認証（またはパスコード）が使えるか */
export async function isAvailable() {
  const hardware = await LocalAuthentication.hasHardwareAsync();
  if (!hardware) return false;
  // 生体が未登録でもパスコードにフォールバックできるので、登録有無だけでは判定しない。
  return (await LocalAuthentication.isEnrolledAsync()) || (await LocalAuthentication.getEnrolledLevelAsync()) > 0;
}

export const isEnabled = async () => (await AsyncStorage.getItem(KEY)) === '1';
export const setEnabled = (on) => AsyncStorage.setItem(KEY, on ? '1' : '0');

/** 認証を求める。成功なら true。 */
export async function authenticate(reason = '家計簿を開きます') {
  const r = await LocalAuthentication.authenticateAsync({
    promptMessage: reason,
    cancelLabel: 'キャンセル',
    // パスコードへのフォールバックを許す。生体が使えない場面で締め出さないため。
    disableDeviceFallback: false,
  });
  return r.success;
}
