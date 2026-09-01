// 構成比の表示。Web 版は円グラフ（PieChart）だが、こちらは積み上げ帯にしている。
//
// 円グラフにするには react-native-svg が要り、ネイティブ依存が増えて既存ビルドへ
// OTA が届かなくなる。帯なら素の View だけで組め、しかも横並びの項目名が読みやすい。
// 画面が縦に細いモバイルでは、面積で比べるより長さで比べる方が実用的でもある。
import { Text, View } from 'react-native';
import { useTheme, PIE_COLORS } from '../theme';
import { fa } from '../utils/format';
import { Empty } from './ui';

/**
 * @param items [{ label, value, color? }] 金額の降順で渡す想定（この中でも並べ替える）
 * @param max   一覧に出す件数。超えた分は「その他」にまとめる
 */
export default function Breakdown({ items, max = 6, emptyText = 'データがありません' }) {
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

  const colorOf = (x, i) => x.color || PIE_COLORS[i % PIE_COLORS.length];

  return (
    <View style={{ gap: 9 }}>
      <View style={{ flexDirection: 'row', height: 9, borderRadius: 5, overflow: 'hidden', backgroundColor: t.bg3 }}>
        {shown.map((x, i) => (
          <View key={x.label} style={{ flex: x.value, backgroundColor: colorOf(x, i) }} />
        ))}
      </View>

      <View style={{ gap: 5 }}>
        {shown.map((x, i) => (
          <View key={x.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colorOf(x, i) }} />
            <Text style={{ color: t.tx2, fontSize: 13, flex: 1 }} numberOfLines={1}>{x.label}</Text>
            <Text style={{ color: t.tx, fontSize: 13, fontWeight: '600' }}>{fa(x.value)}</Text>
            <Text style={{ color: t.tx3, fontSize: 12, width: 44, textAlign: 'right' }}>
              {((x.value / total) * 100).toFixed(1)}%
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
