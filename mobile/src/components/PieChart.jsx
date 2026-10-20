// 円グラフ（ドーナツ）。react-native-svg を入れずに素の View だけで描く。
//
// 以前「SVG が無いので帯で代用する」としたが、外部ライブラリ無しでも描ける。
// 仕組みは扇形を次の重なりで作ること:
//   1. 円の右半分だけを見せる窓（overflow: hidden）
//   2. その中で半円板を (角度 - 180)° 回す
// 半円板は本来 0〜180° を覆う。これを (θ-180)° 回すと (θ-180)〜θ° を覆うので、
// 窓との重なりがちょうど 0〜θ° になる。180° を超える扇は 180° ずつに割って足す。
//
// 扇を「開始角から円の終わりまで」と大きく描き、先頭から順に上書きしていく。
// 隣り合う扇をぴったり並べると境界に髪の毛ほどの隙間が出るが、この描き方なら出ない。
import { Text, View } from 'react-native';
import { useTheme } from '../theme';

// 窓が見せられるのは 180° まで。重ね幅の余地を残して 170° ずつに割る。
const STEP = 170;
// 分割した扇をぴったり並べると、継ぎ目に髪の毛ほどの隙間が見える（実際に出た）。
// 手前へわずかにはみ出させて埋める。同じ色なので重なっても見えない。
// 1.2 度（2026-10-18。0.7 度では 170 度の継ぎ目に白い細い線が出た）。
const OVERLAP = 1.2;
// 窓は円の外へ 2px はみ出させる。ぴったりだと円の右端・上端が窓の縁で 1px 削れて、平らに見える。
const BLEED = 2;

/** 開始角から angle 度ぶんを塗る扇形（時計回り・12時が 0°） */
function Wedge({ size, start, angle, color }) {
  const parts = [];
  for (let a = 0; a < angle; a += STEP) {
    const from = a - OVERLAP;
    parts.push([from, Math.min(a + STEP, angle) - from]);
  }

  return (
    <View style={{ position: 'absolute', width: size, height: size, transform: [{ rotate: `${start}deg` }] }}>
      {parts.map(([offset, a]) => (
        <View
          key={offset}
          style={{ position: 'absolute', width: size, height: size, transform: [{ rotate: `${offset}deg` }] }}
        >
          {/* 右半分の窓 */}
          <View style={{ position: 'absolute', left: size / 2, top: -BLEED, width: size / 2 + BLEED, height: size + BLEED * 2, overflow: 'hidden' }}>
            {/* 半円板。窓の座標系にずらしてから、円の中心を軸に回す */}
            <View
              style={{
                position: 'absolute', left: -size / 2, top: BLEED, width: size, height: size,
                transform: [{ rotate: `${a - 180}deg` }],
              }}
            >
              <View style={{
                position: 'absolute', left: size / 2, top: 0, width: size / 2, height: size,
                borderTopRightRadius: size / 2, borderBottomRightRadius: size / 2,
                backgroundColor: color,
              }} />
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * @param items [{ label, value, color }] 値の降順で渡す。色は呼び出し側が決める（凡例と揃えるため）
 * @param size  直径
 * @param center 中央に出す文字（合計など）
 */
export default function PieChart({ items, size = 152, center, centerSub }) {
  const t = useTheme();
  const rows = (items || []).filter((x) => x.value > 0);
  const total = rows.reduce((s, x) => s + x.value, 0);
  if (!total) return null;

  // 各扇は「自分の開始角から円の終わりまで」。前から順に描いて後ろを上書きする。
  const wedges = rows.map((x, i) => {
    const before = rows.slice(0, i).reduce((sum, r) => sum + r.value, 0);
    return { start: (before / total) * 360, color: x.color };
  });

  const hole = Math.round(size * 0.56);

  return (
    <View style={{ width: size, height: size, alignSelf: 'center' }}>
      {/* 土台: 先頭の扇と同じ色の円。扇の継ぎ目に出る隙間から白い地が透けないようにする */}
      <View style={{ position: 'absolute', width: size, height: size, borderRadius: size / 2, backgroundColor: wedges[0].color }} />
      {wedges.map((w) => (
        <Wedge key={w.start} size={size} start={w.start} angle={360 - w.start} color={w.color} />
      ))}
      <View style={{
        position: 'absolute', left: (size - hole) / 2, top: (size - hole) / 2,
        width: hole, height: hole, borderRadius: hole / 2, backgroundColor: t.bg1,
        alignItems: 'center', justifyContent: 'center', gap: 1,
      }}>
        {centerSub ? <Text style={{ color: t.tx3, fontSize: 12 }}>{centerSub}</Text> : null}
        {center ? (
          // 幅を穴の内側に収める。収めないと、¥1,419,553 のような長い額が穴の縁の輪にはみ出す（2026-10-18）
          <Text style={{ color: t.tx, fontSize: 16, fontWeight: '800', width: hole - 12, textAlign: 'center' }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
            {center}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
