// 端末のロック（Face ID / Touch ID / 指紋・顔認証 / パスコード）でアプリを保護する。
// 家計データは端末内 SQLite に平文で持つため、端末を他人に触られたときの最後の砦になる。
// 有効・無効の設定は AsyncStorage（秘密ではないため SecureStore を使う必要がない）。
import { Platform } from 'react-native';
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

/**
 * 画面に出す認証の呼び名。端末が持っている方法に合わせる。
 * ⚠ 以前は Android でも「Face ID」と出していた。顔認証の無い Android 端末で「Face ID でロック」を
 *   オンにした人が、指紋で開けることに気づけず「開かなくなった」と受け取った（2026-10-01）。
 */
export async function methodLabel() {
  let types = [];
  try { types = await LocalAuthentication.supportedAuthenticationTypesAsync(); } catch { /* 不明なら汎用の呼び名 */ }
  const face = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
  const finger = types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT);
  if (Platform.OS === 'ios') return face ? 'Face ID' : finger ? 'Touch ID' : 'パスコード';
  if (face && finger) return '顔認証・指紋';
  if (face) return '顔認証';
  if (finger) return '指紋';
  return '画面ロック';
}

export const isEnabled = async () => (await AsyncStorage.getItem(KEY)) === '1';
export const setEnabled = (on) => AsyncStorage.setItem(KEY, on ? '1' : '0');

// この端末ではもう認証できない（生体もパスコードも無い・外された）ことを示すエラー。
// これらで締め出すと、アプリを消すしか手がなくなる。
const CANNOT_AUTH = ['not_enrolled', 'not_available', 'passcode_not_set'];

/**
 * 認証を求める。
 * @returns {'ok' | 'cancel' | 'unavailable'} unavailable は「この端末では認証ができない」
 */
export async function authenticate(reason = '家計簿を開きます') {
  try {
    const r = await LocalAuthentication.authenticateAsync({
      promptMessage: reason,
      cancelLabel: 'キャンセル',
      // パスコード（Android は PIN・パターンなどの画面ロック）へのフォールバックを許す。生体が使えない場面で締め出さないため。
      disableDeviceFallback: false,
    });
    if (r.success) return 'ok';
    return CANNOT_AUTH.includes(r.error) ? 'unavailable' : 'cancel';
  } catch {
    return 'cancel';
  }
}
