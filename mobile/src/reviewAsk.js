// Android のレビューのお願い（ストアのレビュー画面へ直接飛ばす）の、出すか・押した・あとで、の記録。
// ホームに重ねるカード（UpdatesOverlay）と設定の上のカード（SettingsCards）が同じ記録を見る。
// 片方で「あとで」を押せば、もう片方にも出ない。
// 出す条件・間隔は utils/reviewPrompt.js の shouldShowReviewCard（検証 reviewPrompt.check.mjs）。
// iOS は、設定ページの上のカードにだけ出す（allowIos）。Apple は独自のレビュー依頼を認めない（App Store Review Guidelines 5.6.1）が、
// 設定の画面にレビュー画面への常設リンクを置くことは案内している。画面に重ねるポップアップは iOS には出さない。
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { openStoreReview, recordInstall } from './components/ReviewAsk';
import { shouldShowReviewCard } from './utils/reviewPrompt';

const DONE_KEY = 'review.cardDone';
const DISMISSED_KEY = 'review.cardDismissed';
const SYSTEM_ASKED_KEY = 'review.lastAsked'; // ReviewAsk.maybeAskReview が記録する

const num = async (key) => Number(await AsyncStorage.getItem(key));

// いま出してよいか。iOS は allowIos を付けた呼び出し（設定のカード）だけ true になりうる
export async function reviewDue(journalCount, { allowIos = false } = {}) {
  if (Platform.OS !== 'android' && !(allowIos && Platform.OS === 'ios')) return false;
  try {
    return shouldShowReviewCard({
      journals: journalCount,
      installedAt: await recordInstall(),
      now: Date.now(),
      doneAt: await num(DONE_KEY),
      dismissedAt: await num(DISMISSED_KEY),
      systemAskedAt: await num(SYSTEM_ASKED_KEY),
    });
  } catch { return false; /* 出せなくても、画面は普通に使える */ }
}

// 「レビューを書く」。押したら、ホームに重ねるカードは二度と出さない（書いたかは分からないので、聞き直さない）。
// keepCard: 設定ページの常設の帯から押したときは記録しない（帯は常に出し続け、ホームのカードも出す条件のまま）
export async function reviewWrite({ keepCard = false } = {}) {
  if (!keepCard) await AsyncStorage.setItem(DONE_KEY, String(Date.now())).catch(() => {});
  await openStoreReview();
}

// 「あとで」・閉じる。90日出さない
export async function reviewLater() {
  await AsyncStorage.setItem(DISMISSED_KEY, String(Date.now())).catch(() => {});
}
