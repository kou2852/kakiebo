// 動画（リワード）広告。ユーザーが自分で押したときだけ出し、最後まで見たらその日の広告を消す（src/adFree.js）。
//
// 出すのは「広告を消す」を押したときだけ。勝手に出さない。非パーソナライズに固定する（ATT の許可を求めない）。
// ユニットID（下の PROD_UNIT）が空のときは、開発中とクローズドテスト中のテスト広告でだけ動き、
// ストア配布ビルドではこの機能自体を出さない（rewardedReady が偽）。
import { Platform } from 'react-native';
import { ADS_ENABLED, USE_TEST_ADS, adsAvailable } from './Ad';
import { grantAdFree } from '../adFree';

let Ads = null;
try { Ads = require('react-native-google-mobile-ads'); } catch { Ads = null; }

// 本番のユニットID（AdMob「動画を見て今日は広告を消す（リワード）」。2026-10-11 に iOS・Android を同時に作成）。
// iOS と Android は機能を合わせるため、必ず両方を入れる（片方だけ null にしない）。
const PROD_UNIT = {
  ios: 'ca-app-pub-1494837719359912/1351873942',
  android: 'ca-app-pub-1494837719359912/2126823002',
};

const LOAD_TIMEOUT_MS = 20 * 1000;
const unitFor = () => PROD_UNIT[Platform.OS === 'android' ? 'android' : 'ios'];

/** この端末でこの機能を出してよいか */
export function rewardedReady() {
  if (!Ads || !adsAvailable() || !ADS_ENABLED) return false;
  return USE_TEST_ADS || !!unitFor();
}

/**
 * 動画を出す。'earned'（最後まで見た＝広告を消した）／'dismissed'（途中で閉じた）／'failed'（読み込めない）。
 */
export function watchRewarded() {
  return new Promise((resolve) => {
    if (!rewardedReady()) { resolve('failed'); return; }
    const { RewardedAd, RewardedAdEventType, AdEventType, TestIds } = Ads;
    const ad = RewardedAd.createForAdRequest(USE_TEST_ADS ? TestIds.REWARDED : unitFor(), {
      requestNonPersonalizedAdsOnly: true,
    });
    let earned = false;
    let done = false;
    let timer = null;
    const finish = (result) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      ad.removeAllListeners();
      resolve(result);
    };
    timer = setTimeout(() => finish('failed'), LOAD_TIMEOUT_MS);
    // 読み込みの待ち時間だけを測る。動画を見ている間に打ち切ると、見終えても報酬を渡せなくなる。
    ad.addAdEventListener(RewardedAdEventType.LOADED, () => { clearTimeout(timer); ad.show().catch(() => finish('failed')); });
    ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => { earned = true; });
    ad.addAdEventListener(AdEventType.CLOSED, async () => {
      if (earned) await grantAdFree();
      finish(earned ? 'earned' : 'dismissed');
    });
    ad.addAdEventListener(AdEventType.ERROR, (e) => {
      console.warn(`[動画広告] 読み込み失敗 code=${e?.code ?? '?'} ${e?.message ?? ''}`);
      finish('failed');
    });
    ad.load();
  });
}
