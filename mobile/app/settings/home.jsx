// ホームに出す項目を選び、並べ替える画面。保存は端末ごと（store/homeLayout.js）。
// 並べ替えは ↑ ↓ のボタンで行う（ドラッグは新しい部品が要るので使わない）。
import { Switch, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../src/theme';
import { Button, Card, Screen, sep } from '../../src/components/ui';
import { setHomeLayout, useHomeLayout } from '../../src/store/homeLayout';
import { DEFAULT_LAYOUT, HOME_ITEMS, moveItem, toggleItem } from '../../src/utils/homeLayout';

const META = Object.fromEntries(HOME_ITEMS.map((x) => [x.id, x]));

export default function HomeLayoutSettings() {
  const t = useTheme();
  const layout = useHomeLayout();

  const arrow = (label, onPress, disabled) => (
    <TouchableOpacity onPress={onPress} disabled={disabled} accessibilityLabel={label}
      style={{ width: 40, height: 36, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.25 : 1 }}>
      <Text style={{ color: t.ac, fontSize: 18, fontWeight: '800' }}>{label === '上へ' ? '↑' : '↓'}</Text>
    </TouchableOpacity>
  );

  return (
    <Screen>
      <Text style={{ color: t.tx2, fontSize: 14, lineHeight: 21 }}>
        ホームに出す項目を選び、↑ ↓ で並べ替えます。期間の切り替えは消せませんが、場所は動かせます。広告はいつも一番下です。
      </Text>
      <Card>
        {layout.map((x, i) => {
          const m = META[x.id];
          return (
            <View key={x.id} style={[{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 8 }, i < layout.length - 1 ? sep(t) : null]}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: x.on ? t.tx : t.tx3, fontSize: 16 }}>{m.label}</Text>
                {m.locked ? <Text style={{ color: t.tx3, fontSize: 12.5 }}>常に表示</Text>
                  : m.note ? <Text style={{ color: t.tx3, fontSize: 12.5 }}>{m.note}</Text> : null}
              </View>
              {arrow('上へ', () => setHomeLayout(moveItem(layout, i, -1)), i === 0)}
              {arrow('下へ', () => setHomeLayout(moveItem(layout, i, 1)), i === layout.length - 1)}
              <Switch value={x.on} disabled={!!m.locked} onValueChange={() => setHomeLayout(toggleItem(layout, x.id))}
                trackColor={{ true: t.ac }} accessibilityLabel={`${m.label}を表示`} />
            </View>
          );
        })}
      </Card>
      <Button label="初期の並びに戻す" variant="ghost" onPress={() => setHomeLayout(DEFAULT_LAYOUT)} />
    </Screen>
  );
}
