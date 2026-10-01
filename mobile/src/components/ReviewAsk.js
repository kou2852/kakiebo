// ストアの評価をお願いする。iOS は Apple 標準の評価ダイアログ、Android は Google Play の
// アプリ内レビュー。Apple はこの仕組み以外で評価を求めることを禁じているので、他の手は無い。
//
// ⚠ 出せたかどうか、星が付いたかどうかは分からない。Apple が返さない。
//   iOS では365日に3回までしか実際には出ない（超えると何も起きない）。
// ⚠ TestFlight 版では isAvailableAsync() が false を返す。確認できるのは Android と、
//   App Store から入れた本番のアプリだけ。
import AsyncStorage from '@react-native-async-storage/async-storage';
import { installTime, shouldAsk } from '../utils/reviewPrompt';

let StoreReview = null;
try { StoreReview = require('expo-store-review'); } catch { StoreReview = null; }

// 1.0.1 までは「最初に記帳を保存した時刻」を記録していた。1.0.2 からは更新せず、
// インストール時刻が無い人の代わりの値として一度だけ読む。
const FIRST_USE_KEY = 'review.firstUse';
const INSTALLED_KEY = 'review.installedAt';
const LAST_ASKED_KEY = 'review.lastAsked';

const num = async (key) => Number(await AsyncStorage.getItem(key));

// インストール時刻（初回起動）を記録する。起動のたびに呼んでよい（記録済みなら何もしない）。
// 記帳の保存時に記録するのでは遅い。「インストールから3日」は記帳していない日も数える。
export async function recordInstall() {
  try {
    const saved = await num(INSTALLED_KEY);
    if (saved) return saved;
    const at = installTime({ legacyFirstUse: await num(FIRST_USE_KEY), now: Date.now() });
    await AsyncStorage.setItem(INSTALLED_KEY, String(at));
    return at;
  } catch { return NaN; /* 記録できなくても起動は止めない */ }
}

// 記帳を保存して確認を閉じた直後に呼ぶ。adShown は、その回に全画面広告を出したか。
export async function maybeAskReview({ journals, adShown }) {
  if (!StoreReview) return;
  try {
    const now = Date.now();
    // 起動時に記録しているはずだが、取りこぼしていてもここで決める
    const installedAt = await recordInstall();

    if (!shouldAsk({ journals, installedAt, lastAskedAt: await num(LAST_ASKED_KEY), now, adShown })) return;
    if (!(await StoreReview.isAvailableAsync())) return;

    // 聞いた記録は、実際に出せたかに関わらず残す。出せたかは分からないので、
    // 分からないものを条件にすると毎回呼びに行くことになる。
    await AsyncStorage.setItem(LAST_ASKED_KEY, String(now));
    await StoreReview.requestReview();
  } catch { /* 評価を聞けなくても、記帳の操作は止めない */ }
}
