// 設定ページの一番上に出す、横にスライドして送る帯（2026-11-03 指示）。
// 灰色の地に白いカードを置くのではなく、画面の幅いっぱいの白い地に、絵と一言を載せる（TimeTree の「その他」と同じ形）。
// いまはレビューのお願い（iOS・Android。常に出す）。今後ほかのお知らせも同じ場所に足せるように、帯の定義を並べる形にしてある。
//
// 帯を足すには:
//   1. useXxxCard() を書く。出さないときは null、出すときは { id, node } を返す（node は帯1枚の中身。カードで囲まない）。
//   2. 下の SettingsCards の中の cards に並べる（先に書いたものが左）。
// 帯は2通りの作りにできる。
//   ・地と同じ白のまま、絵と一言だけを載せる（いまのレビューのお願い）
//   ・色を付けた角丸のカードを、帯の中に完全に作って置く（例: 緑の地に絵と見出し）
// 点（ページの位置）は、1枚だけでも出す（将来の追加を見越して。2026-11-03 指示）。0枚のときは何も出さない。
//
// レビューのお願いの出し方は reviewAsk.js（ホームに重ねるカードと同じ記録）。
// 気分を聞いて振り分けない。星の数を指定しない（Google は評価カードの前の質問を禁じている）。
import { useEffect, useRef, useState } from 'react';
import { Animated, Image, Pressable, Text, View } from 'react-native';
import { useTheme, useThemeMode } from '../theme';
import PageDots from './PageDots';
import { reviewWrite } from '../reviewAsk';

// Screen の内側の余白（ui.jsx の Screen の padding と同じ値）。帯を画面の端まで広げるために打ち消す
const SCREEN_PAD = 13;

// ── 帯の定義 ─────────────────────────────────────────────

// 設定ページのレビューの帯は、常に出す（常設の入口）。ホームに重ねるカードで「あとで」を押しても、押したことがあっても消えない。
// （以前は同じ記録を見ていたので、ホームで閉じると設定の帯まで90日消えた）
function useReviewCard() {
  const t = useTheme();
  const { resolved } = useThemeMode();
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);

  if (!ready) return null;
  return {
    id: 'review',
    node: (
      // ボタンは置かない。絵と一言だけで、タップするとレビュー画面へ飛ぶ（押したら二度と出さない）
      <Pressable onPress={() => { reviewWrite({ keepCard: true }); }} accessibilityRole="button"
        accessibilityLabel="みなさまのレビューが kurofukubo を育てます。タップでレビュー画面を開く"
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 18, opacity: pressed ? 0.7 : 1 })}>
        <Image
          source={resolved === 'dark' ? require('../../assets/splash-icon-dark.png') : require('../../assets/splash-icon.png')}
          style={{ width: 96, height: 96 }} resizeMode="contain" accessibilityIgnoresInvertColors />
        <Text style={{ color: t.tx, fontSize: 19, fontWeight: '800', lineHeight: 28, flex: 1 }}>
          {'みなさまのレビューが\nkurofukubo を育てます。'}
        </Text>
      </Pressable>
    ),
  };
}

// ── 横にスライドする並び ──────────────────────────────────

export default function SettingsCards() {
  const t = useTheme();
  const review = useReviewCard();
  const cards = [review].filter(Boolean);
  const [width, setWidth] = useState(0);
  const x = useRef(new Animated.Value(0)).current;
  // 出す帯の顔ぶれが変わったら先頭に戻す（「あとで」で2枚目が消えたとき、スクロール位置だけが残って空白に見えないように）
  const ids = cards.map((c) => c.id).join(',');
  useEffect(() => { x.setValue(0); }, [ids, x]);

  if (!cards.length) return null;
  return (
    // 画面の幅いっぱいの白い地。上と左右は Screen の余白を打ち消して端まで広げる
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{
        marginHorizontal: -SCREEN_PAD, marginTop: -SCREEN_PAD,
        backgroundColor: t.bg1, paddingTop: 14, paddingBottom: 12, gap: 8,
        borderBottomWidth: 1, borderBottomColor: t.bd,
      }}
    >
      {width ? (
        <Animated.ScrollView
          key={ids}
          horizontal pagingEnabled showsHorizontalScrollIndicator={false}
          // 1枚だけのときも、指で横に引くと反応する（iOS は弾み、Android は端の光）。2枚以上になれば、そのまま切り替わる
          bounces alwaysBounceHorizontal overScrollMode="always"
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { x } } }], { useNativeDriver: false })}
          scrollEventThrottle={16}
        >
          {cards.map((c) => (
            <View key={c.id} style={{ width, paddingHorizontal: 24 }}>{c.node}</View>
          ))}
        </Animated.ScrollView>
      ) : null}
      <PageDots count={cards.length} x={x} step={width || 1} minCount={1} />
    </View>
  );
}
