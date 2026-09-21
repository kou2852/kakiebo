// 記帳5件ごとの全画面広告（ゲストのみ）。
//
// 出すのは保存の確認で「OK」を押した直後だけ。入力の途中に割り込むと
// AdMob のポリシー（予期しないタイミングの全画面広告）に反する。
// ログインしたユーザーには出さない。登録してくれた人の使い勝手は落とさない。
//
// 数えるのは、記帳タブ・ショートカット・レシート撮影から新しく保存した記帳だけ。
// 編集・CSV 取り込み・定期取引の自動記帳・開始残高は、自分で1件ずつ付けた記帳ではないので数えない。
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ADS_ENABLED } from './Ad';
import { useAuth } from '../store/AuthProvider';
import { useData } from '../store/DataProvider';
import { bump, isDue, shouldPreload } from '../utils/adPacing';
import { maybeAskReview } from './ReviewAsk';

let Ads = null;
try { Ads = require('react-native-google-mobile-ads'); } catch { Ads = null; }

// 本番のユニットID（AdMob: kurofukubo iOS / 記帳5回ごと全画面（ゲスト））。
// 静止画と動画の両方、1人1時間2回までは AdMob 側で設定している。
const PROD_UNIT_ID = 'ca-app-pub-1494837719359912/5602407892';
const COUNT_KEY = 'ads.entryCount';

let ad = null;

function preload() {
  if (!Ads || !ADS_ENABLED || ad) return;
  const { InterstitialAd, AdEventType, TestIds } = Ads;
  const a = InterstitialAd.createForAdRequest(__DEV__ ? TestIds.INTERSTITIAL : PROD_UNIT_ID, {
    // バナーと同じく非パーソナライズに固定する（ATT の許可ダイアログを出さない）
    requestNonPersonalizedAdsOnly: true,
  });
  const drop = () => { a.removeAllListeners(); if (ad === a) ad = null; };
  a.addAdEventListener(AdEventType.ERROR, (e) => {
    console.warn(`[全画面広告] 読み込み失敗 code=${e?.code ?? '?'} ${e?.message ?? ''}`);
    drop();
  });
  a.addAdEventListener(AdEventType.CLOSED, drop);
  ad = a;
  a.load();
}

const readCount = async () => Number(await AsyncStorage.getItem(COUNT_KEY)) || 0;

async function countEntry(guest) {
  if (!guest) return;
  try {
    const n = bump(await readCount(), guest);
    await AsyncStorage.setItem(COUNT_KEY, String(n));
    if (shouldPreload(n)) preload();
  } catch { /* 数えられなくても記帳は済んでいる */ }
}

// 出せたら true。呼び出し側は、この回に評価を聞くかどうかの判断に使う。
async function showIfDue(guest) {
  if (!guest || !ad?.loaded) return false;
  try {
    if (!isDue(await readCount())) return false;
    await AsyncStorage.setItem(COUNT_KEY, '0');
    await ad.show();
    return true;
  } catch { return false; /* 出せなければ出さない。記帳の操作は止めない */ }
}

// 記帳を保存したら counted()、保存の確認を閉じたら closed() を呼ぶ。
// closed() では広告と評価のお願いを続けて扱う。両方を同じ瞬間に出さないため、
// 呼び出し側で順番を気にしなくて済むようにここでまとめる。
export function useEntryAd() {
  const guest = !useAuth()?.signedIn;
  const { journals } = useData();
  return {
    counted: () => { countEntry(guest); },
    closed: () => {
      showIfDue(guest).then((adShown) => maybeAskReview({ journals: journals?.length || 0, adShown }));
    },
  };
}
