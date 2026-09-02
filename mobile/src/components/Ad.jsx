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
// アプリID（app.json）とユニットID（下記）はどちらも本番のものが入っている。
// ただし TEST_ADS が true の間はテスト広告を出すので、収益は発生しない。
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

// false にすれば広告は一切描画されない。JS だけなので OTA で止められる。
export const ADS_ENABLED = true;

// 本番のユニットID（AdMob: kurofukubo iOS / アンカーバナー）。
const PROD_UNIT_ID = 'ca-app-pub-1494837719359912/3915570524';

// ⚠ 本番の広告を出す前に、必ず src/ads.js の TEST_DEVICES へ自分の端末を登録すること。
// 登録せずに自分で操作すると「自分の広告をクリックした」と記録され、アカウントが
// 停止されうる。端末IDは本番IDで一度起動するとログに出る。
//
// それまではテスト広告のまま出す。見た目と配置の確認はこれでできて、収益は発生しない。
// ここは JS なので、切り替えは OTA で反映できる（再ビルドは要らない）。
const TEST_ADS = true;

const UNIT_ID = !Ads ? '' : TEST_ADS ? Ads.TestIds.ADAPTIVE_BANNER : PROD_UNIT_ID;

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
