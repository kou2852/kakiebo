// オンボーディングが作ったものの id を覚えておく場所。
//
// なぜ独立したファイルか: 読むのは DataProvider（自動同期の抑止）と connect.jsx（ログイン時の判定）、
// 書くのは OnboardingProvider。OnboardingProvider は DataProvider を使うので、
// 同じ場所に置くと循環参照になる。
//
// ⚠ 印がある間は未送信キューを送らない。既にアカウントを持っている人がオンボーディングを
//   終えてからログインすると、ログイン成立と同時に自動同期が走り、「現金・銀行口座・
//   クレジットカード」がその人の帳簿へ入っていた（2026-09-19 に運営者のアカウントで発生）。
// ⚠ 印を消すのは、ログイン時の判定が済んだときだけ（捨てる・送る・3択のいずれでも消す）。
//   消し忘れると、その端末は二度と同期しなくなる。
import AsyncStorage from '@react-native-async-storage/async-storage';

export const CREATED_IDS_KEY = 'onboarding.createdIds';

export async function rememberOnboardingIds(ids) {
  try { await AsyncStorage.setItem(CREATED_IDS_KEY, JSON.stringify(ids || [])); } catch { /* 覚えられなくても保存は続ける */ }
}

export async function readOnboardingIds() {
  try {
    const raw = await AsyncStorage.getItem(CREATED_IDS_KEY);
    const ids = raw ? JSON.parse(raw) : [];
    return Array.isArray(ids) ? ids : [];
  } catch { return []; }
}

export const forgetOnboardingIds = () => AsyncStorage.removeItem(CREATED_IDS_KEY).catch(() => {});
