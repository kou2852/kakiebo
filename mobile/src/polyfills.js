// Expo Go(Hermes) には globalThis.crypto が無い。Cognito の SRP 認証など、
// これを前提にしたライブラリが黙って壊れるので、起動時に一度だけ埋める。
// 乱数の実体は expo-crypto（iOS の SecRandomCopyBytes）。
import { getRandomBytes } from 'expo-crypto';

function getRandomValues(view) {
  const bytes = getRandomBytes(view.byteLength);
  new Uint8Array(view.buffer, view.byteOffset, view.byteLength).set(bytes);
  return view;
}

if (!globalThis.crypto || typeof globalThis.crypto.getRandomValues !== 'function') {
  try {
    if (!globalThis.crypto) globalThis.crypto = {};
    globalThis.crypto.getRandomValues = getRandomValues;
  } catch {
    // crypto が読み取り専用の環境向け
    Object.defineProperty(globalThis, 'crypto', { value: { getRandomValues }, configurable: true });
  }
}
