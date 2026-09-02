// 構成比の表示。円グラフ（Web 版と同じ）か積み上げ帯かを pie で選ぶ。
//
// react-native-svg は入れない。入れるとネイティブ依存が変わり、既存ビルドへ
// OTA が届かなくなる。円グラフは素の View だけで描いている（PieChart.jsx）。
// 帯は縦の場所を取らないので、シートの中など狭いところで使う。
import { Text, View } from 'react-native';
import { useTheme, PIE_COLORS } from '../theme';
import { fa } from '../utils/format';
import PieChart from './PieChart';
import { Empty } from './ui';

/**
 * @param items [{ label, value, color? }] 金額の降順で渡す想定（この中でも並べ替える）
 * @param max   一覧に出す件数。超えた分は「その他」にまとめる
 * @param pie   true なら円グラフ、false なら積み上げ帯
 */
export default function Breakdown({ items, max = 6, pie = false, centerSub, emptyText = 'データがありません' }) {
  const t = useTheme();

  const rows = [...(items || [])].filter((x) => x.value > 0).sort((a, b) => b.value - a.value);
  const total = rows.reduce((s, x) => s + x.value, 0);
  if (!total) return <Empty text={emptyText} />;

  // 件数が多いと帯も凡例も読めなくなるので、下位はまとめる。
  const head = rows.slice(0, max);
  const tail = rows.slice(max);
  const shown = tail.length
    ? [...head, { label: `その他 ${tail.length}件`, value: tail.reduce((s, x) => s + x.value, 0), color: t.tx3 }]
    : head;

  // 色は円グラフと凡例で必ず同じにする。片方だけずれると読み違える。
  const colored = shown.map((x, i) => ({ ...x, color: x.color || PIE_COLORS[i % PIE_COLORS.length] }));

  return (
    <View style={{ gap: 9 }}>
      {pie ? (
        <PieChart items={colored} center={fa(total)} centerSub={centerSub} />
      ) : (
        <View style={{ flexDirection: 'row', height: 9, borderRadius: 5, overflow: 'hidden', backgroundColor: t.bg3 }}>
          {colored.map((x) => (
            <View key={x.label} style={{ flex: x.value, backgroundColor: x.color }} />
          ))}
        </View>
      )}

      <View style={{ gap: 5 }}>
        {colored.map((x) => (
          <View key={x.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: x.color }} />
            <Text style={{ color: t.tx2, fontSize: 14, flex: 1 }} numberOfLines={1}>{x.label}</Text>
            <Text style={{ color: t.tx, fontSize: 14, fontWeight: '600' }}>{fa(x.value)}</Text>
            <Text style={{ color: t.tx3, fontSize: 13, width: 54, textAlign: 'right' }}>
              {((x.value / total) * 100).toFixed(1)}%
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
