// ストアの評価をお願いする。iOS は Apple 標準の評価ダイアログ、Android は Google Play の
// アプリ内レビュー。Apple はこの仕組み以外で評価を求めることを禁じているので、他の手は無い。
//
// ⚠ 出せたかどうか、星が付いたかどうかは分からない。Apple が返さない。
//   iOS では365日に3回までしか実際には出ない（超えると何も起きない）。
// ⚠ TestFlight 版では isAvailableAsync() が false を返す。確認できるのは Android と、
//   App Store から入れた本番のアプリだけ。
import AsyncStorage from '@react-native-async-storage/async-storage';
import { shouldAsk } from '../utils/reviewPrompt';

let StoreReview = null;
try { StoreReview = require('expo-store-review'); } catch { StoreReview = null; }

const FIRST_USE_KEY = 'review.firstUse';
const LAST_ASKED_KEY = 'review.lastAsked';

const num = async (key) => Number(await AsyncStorage.getItem(key));

// 記帳を保存して確認を閉じた直後に呼ぶ。adShown は、その回に全画面広告を出したか。
export async function maybeAskReview({ journals, adShown }) {
  if (!StoreReview) return;
  try {
    const now = Date.now();

    // 使い始めた日は、最初にここへ来たときに記録する。
    // 既存ユーザーも「今日が使い始め」になるが、3日待つだけなので害がない。
    let firstUseAt = await num(FIRST_USE_KEY);
    if (!firstUseAt) {
      firstUseAt = now;
      await AsyncStorage.setItem(FIRST_USE_KEY, String(now));
    }

    if (!shouldAsk({ journals, firstUseAt, lastAskedAt: await num(LAST_ASKED_KEY), now, adShown })) return;
    if (!(await StoreReview.isAvailableAsync())) return;

    // 聞いた記録は、実際に出せたかに関わらず残す。出せたかは分からないので、
    // 分からないものを条件にすると毎回呼びに行くことになる。
    await AsyncStorage.setItem(LAST_ASKED_KEY, String(now));
    await StoreReview.requestReview();
  } catch { /* 評価を聞けなくても、記帳の操作は止めない */ }
}
