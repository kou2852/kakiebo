// 端末内 OCR。ネイティブモジュールが無いビルド（旧バージョン等）でも
// アプリ全体が落ちないよう、読み込み失敗は null にして呼び出し側で判定する。
import { requireNativeModule } from 'expo-modules-core';

let native = null;
try {
  native = requireNativeModule('TextRecognition');
} catch {
  native = null;
}

export const isAvailable = () => native !== null;

/** 画像URI から認識できた行の配列を返す。 */
export function recognize(uri) {
  if (!native) throw new Error('この端末では文字認識が使えません（アプリの更新が必要です）');
  return native.recognize(uri);
}
