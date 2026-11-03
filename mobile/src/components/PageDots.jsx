// 横スライドのページ位置を示す点。今のページだけ細長くし、その幅と色を指の動きに合わせて変える（2026-10-17 追加）。
// 以前はページが変わった瞬間に丸と楕円が切り替わっていた。
//
//   const x = useRef(new Animated.Value(0)).current;
//   <Animated.ScrollView onScroll={Animated.event([{ nativeEvent: { contentOffset: { x } } }], { useNativeDriver: false })} scrollEventThrottle={16}>
//   <PageDots count={n} x={x} step={1ページの横幅} />
//
// 幅と色は描画のたびに計算するので useNativeDriver は使えない（false にする）。
import { Animated, View } from 'react-native';
import { useTheme } from '../theme';

// minCount: この枚数未満なら点を出さない（既定は2。1枚でも出したいときは1にする）
export default function PageDots({ count, x, step, size = 6, active = 18, gap = 6, minCount = 2, style }) {
  const t = useTheme();
  if (count < minCount) return null;
  return (
    <View style={[{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap }, style]}>
      {Array.from({ length: count }, (_, i) => {
        // このページを中心に、前後1ページ分の移動で細長い形から丸へ戻る
        const inputRange = [(i - 1) * step, i * step, (i + 1) * step];
        const width = x.interpolate({ inputRange, outputRange: [size, active, size], extrapolate: 'clamp' });
        const backgroundColor = x.interpolate({ inputRange, outputRange: [t.bd2, t.ac, t.bd2], extrapolate: 'clamp' });
        return <Animated.View key={i} style={{ width, height: size, borderRadius: size / 2, backgroundColor }} />;
      })}
    </View>
  );
}
