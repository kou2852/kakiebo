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
// テスト広告に切り替わるのは開発中（__DEV__）だけで、切り替える手段は他に無い。
import { useEffect, useState } from 'react';
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

// 広告そのものを止める手段は置かない。
//
// ⚠ ここにフラグを作らないこと。別アプリ（SUKIMA QUEST）で、広告の挙動を
// ビルドごとに切り替え、同一バージョンへ挙動の異なるバイナリを並べたところ、
// 2026-08-26 に Guideline 5.6（Developer Code of Conduct）で却下された。
// 指摘は「審査中に意図的に隠されたと見える機能がある」。開発者アカウント自体に
// 関わる重い条項で、善意でも審査を欺いたと読まれる。
//
// 審査に出すバイナリと、自分が試すバイナリを同じに保つ。
// スクリーンショットも出荷ビルドで撮る。広告が写り込むこと自体は問題ない。
export const ADS_ENABLED = true;

// 置き場所ごとの本番ユニットID（AdMob: kurofukubo iOS）と大きさ。
// 置き場所ごとに分けているのは、どちらがどれだけ稼いでいるかを AdMob のレポートで見分けるため。
//
// テスト広告は開発中だけ。ストア配布ビルドでは __DEV__ が偽になるので、
// 常に本番ユニットを使う。ビルド時にも実行時にもこれを変える手段は無い。
//
// ⚠ 自分の端末で本番広告を踏まないための対策は、ビルドを分けることではなく
// src/ads.js の TEST_DEVICES に自分の端末を登録すること。登録せずに自分で
// タップすると無効なトラフィックと判定され、AdMob のアカウントが停止されうる。
export const PLACEMENTS = {
  // タブバーの直上に固定する帯
  anchored: { unit: 'ca-app-pub-1494837719359912/3915570524', size: 'ANCHORED_ADAPTIVE_BANNER', test: 'ADAPTIVE_BANNER' },
  // ホームの一番下（中サイズの四角）
  homeBottom: { unit: 'ca-app-pub-1494837719359912/9747424628', size: 'MEDIUM_RECTANGLE', test: 'BANNER' },
};

// ティア別の表示可否。Web 版 config/tiers.js の AD_CONFIG と同じ考え方。
// 課金が未実装なので実ログインユーザーは全員 free 扱い。
export const AD_TIERS = { guest: true, free: true, pro: false, family: false };

// 読み込みに失敗したときの取り直し。
// ⚠ 以前は一度失敗すると、アプリを開き直すまで広告が戻らなかった。AdMob の審査中や
//   在庫切れで一時的に広告が無いだけでも、その日はずっと空になる。
const RETRY_MS = 60 * 1000;
const MAX_RETRY = 5;

export default function AnchoredAd({ tier = 'free', placement = 'anchored' }) {
  const t = useTheme();
  // 読み込みに失敗したら枠ごと畳む。空白が残るとタブバーが浮いて見える。
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!failed || attempt >= MAX_RETRY) return undefined;
    const timer = setTimeout(() => { setAttempt((a) => a + 1); setFailed(false); }, RETRY_MS);
    return () => clearTimeout(timer);
  }, [failed, attempt]);

  if (!Ads || !ADS_ENABLED || !AD_TIERS[tier] || failed) return null;
  const { BannerAd, BannerAdSize } = Ads;
  const p = PLACEMENTS[placement];

  return (
    <View style={{
      // ホームの一番下はカードにせず、区切り線だけ引いて地の上に置く。
      // 白い箱に入れると帳簿のカードと同じ見た目になり、アプリの一部と紛らわしい。
      backgroundColor: placement === 'anchored' ? t.bg1 : 'transparent',
      alignItems: 'center',
      borderTopWidth: 1,
      borderTopColor: t.bd,
      // 一番下の枠は、下にある固定の帯と続いて見えないよう離す。
      // 広告どうしがくっついて見えると誤タップを招く。
      paddingTop: placement === 'anchored' ? 0 : 12,
      marginBottom: placement === 'anchored' ? 0 : 12,
    }}>
      <BannerAd
        // 取り直すたびに新しい要求として出し直す
        key={attempt}
        unitId={__DEV__ ? Ads.TestIds[p.test] : p.unit}
        size={BannerAdSize[p.size]}
        // 非パーソナライズに固定する。IDFA を使わないので ATT の許可ダイアログが不要になり、
        // 「家計データを外部に出さない」という訴求と矛盾しない。単価は下がるが意図した選択。
        requestOptions={{ requestNonPersonalizedAdsOnly: true }}
        // ⚠ 理由を捨てない。「在庫が無い」のか「設定が誤っている」のかは、ここでしか分からない。
        //   画面には出さず端末のログに残す（TEST_DEVICES の ID と同じ手段で読める）。
        onAdFailedToLoad={(e) => {
          console.warn(`[広告] 読み込み失敗 code=${e?.code ?? '?'} ${e?.message ?? ''}（${attempt + 1}回目）`);
          setFailed(true);
        }}
      />
    </View>
  );
}
