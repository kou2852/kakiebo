// AdMob の初期化。アプリ起動時に一度だけ呼ぶ。
//
// 暗黙初期化に任せると初回のバナー表示が遅れるので、明示的に走らせる。
// 起動をブロックしないよう、待たずに投げっぱなしにする。
import { ADS_ENABLED, adsAvailable } from './components/Ad';

let Ads = null;
try { Ads = require('react-native-google-mobile-ads'); } catch { Ads = null; }

// ⚠ 本番の広告ユニットに切り替えたら、自分の端末をここに登録すること。
// 登録せずに自分で操作すると「自分の広告をクリックした」と記録され、
// AdMob アカウントが停止される可能性がある。
//
// 端末IDの調べ方: 本番IDでアプリを起動し、Xcode か端末ログに出る
//   <Google> To get test ads on this device, set: GADMobileAds...testDeviceIdentifiers = @[ @"..." ]
// の文字列をここに足す。
// ⚠ 同じ iPhone でも、TestFlight から入れたときと App Store から入れたときで ID が変わる
//   （入れ直しでも変わる）。2026-09-25 に App Store 版だけテスト広告にならず判明した。
const TEST_DEVICES = [
  '38cca2af0109f5c8f92f1cb8feda037b', // 開発者の iPhone・TestFlight 版（2026-09-20 取得）
  '1e023bf96be8d515e074c63b22e5824c', // 開発者の iPhone・App Store 版（2026-09-25 取得）
];

let started = false;

export function initAds() {
  if (!ADS_ENABLED || !adsAvailable() || started) return;
  started = true;

  const mobileAds = Ads.default;
  const { MaxAdContentRating } = Ads;

  mobileAds()
    .setRequestConfiguration({
      // 家計簿アプリなので、成人向け等が混ざらないよう上限を設ける。
      maxAdContentRating: MaxAdContentRating.G,
      tagForChildDirectedTreatment: false,
      tagForUnderAgeOfConsent: false,
      testDeviceIdentifiers: TEST_DEVICES,
    })
    .then(() => mobileAds().initialize())
    .catch(() => { /* 広告が出ないだけ。アプリの動作は止めない */ });
}
