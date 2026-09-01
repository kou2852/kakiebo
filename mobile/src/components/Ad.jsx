// AdMob のアンカーバナー。タブバーの直上に固定で出す。
//
// 置き場所をコンテンツ内のインラインではなく固定にしている理由:
//   ・スクロールしても常に見えるので表示機会が安定する
//   ・帳簿の数字の間に広告が挟まらない。金額の並びに割り込むと誤読を招く
//   ・AdSense と違い AdMob はアンカー配置が想定内で、ポリシー上も素直
//
// タブバーの直上に置くため、実体は app/(tabs)/_layout.jsx の tabBar から描画している。
// 誤タップを避けるため、タブバーとの間に区切り線を入れて領域を分けている。
//
// ⚠ リリース前にやること
//   1. AdMob で iOS 用の「アンカーアダプティブバナー」ユニットを作り UNIT_ID を差し替える
//   2. app.json の react-native-google-mobile-ads プラグインの iosAppId を本番IDに差し替える
//   どちらもネイティブ設定に関わるため、差し替え後は再ビルドが必要。
import { useState } from 'react';
import { View } from 'react-native';
// ネイティブモジュールが無い環境（Expo Go・広告を含まないビルド）では読み込みに失敗する。
// アプリ全体を落とさず、広告だけ出さない形で切り離す。
let Ads = null;
try {
  Ads = require('react-native-google-mobile-ads');
} catch {
  Ads = null;
}
export const adsAvailable = () => Ads !== null;
import { useTheme } from '../theme';

// リリース直前にここを true のまま本番IDへ差し替える。false にすれば広告は一切描画されない。
export const ADS_ENABLED = true;

// いまは Google のテスト用ユニット。実際の広告は配信されず、収益も発生しない。
const UNIT_ID = Ads ? Ads.TestIds.ADAPTIVE_BANNER : '';

// ティア別の表示可否。Web 版 config/tiers.js の AD_CONFIG と同じ考え方。
// 課金が未実装なので実ログインユーザーは全員 free 扱い。
export const AD_TIERS = { guest: true, free: true, pro: false, family: false };

export default function AnchoredAd({ tier = 'free' }) {
  const t = useTheme();
  // 読み込みに失敗したら枠ごと畳む。空白が残るとタブバーが浮いて見える。
  const [failed, setFailed] = useState(false);

  if (!Ads || !ADS_ENABLED || !AD_TIERS[tier] || failed) return null;
  const { BannerAd, BannerAdSize } = Ads;

  return (
    <View style={{
      backgroundColor: t.bg1,
      alignItems: 'center',
      borderTopWidth: 1,
      borderTopColor: t.bd,
    }}>
      <BannerAd
        unitId={UNIT_ID}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        // 非パーソナライズに固定する。IDFA を使わないので ATT の許可ダイアログが不要になり、
        // 「家計データを外部に出さない」という訴求と矛盾しない。単価は下がるが意図した選択。
        requestOptions={{ requestNonPersonalizedAdsOnly: true }}
        onAdFailedToLoad={() => setFailed(true)}
      />
    </View>
  );
}
