// タブバー。プロトタイプに合わせて「4タブ＋中央の記帳ボタン」にする。
//
// 元は5タブで、そのうち「入力」と中央ボタンが同じ役割になっていた。
// 記帳は最も頻度が高い操作なので、タブに埋めずに独立した大きい的にする。
// 広告はこの上に積む（react-navigation がタブバー高さに含めて測るので画面が隠れない）。
import { Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';
import AnchoredAd from './Ad';
import { useTourTarget } from '../store/TourProvider';

// 中央ボタンで開くルート。タブとしては出さない。
const ENTRY_ROUTE = 'journal';

const ICONS = {
  index: 'grid-outline',
  ledger: 'list-outline',
  reports: 'stats-chart-outline',
  settings: 'settings-outline',
};

// 記帳ボタンが帯から上へ出る量。広告との間隔もこれに合わせる。
const FAB_RISE = 23;

export default function TabBar({ state, descriptors, navigation }) {
  const addRef = useTourTarget('add-button');
  const t = useTheme();
  const insets = useSafeAreaInsets();

  const routes = state.routes.filter((r) => r.name !== ENTRY_ROUTE);
  const entryIndex = state.routes.findIndex((r) => r.name === ENTRY_ROUTE);
  const half = Math.ceil(routes.length / 2);

  const tab = (route) => {
    const idx = state.routes.findIndex((r) => r.key === route.key);
    const focused = state.index === idx;
    const label = descriptors[route.key]?.options?.tabBarLabel ?? route.name;
    return (
      <TouchableOpacity
        key={route.key}
        accessibilityRole="button"
        accessibilityState={focused ? { selected: true } : {}}
        onPress={() => {
          const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !e.defaultPrevented) navigation.navigate(route.name);
        }}
        style={{ flex: 1, alignItems: 'center', gap: 2, paddingTop: 9, paddingBottom: 2 }}
      >
        <Ionicons name={ICONS[route.name] || 'ellipse-outline'} size={25}
          color={focused ? t.ac : t.tx3} />
        <Text style={{ fontSize: 13, color: focused ? t.ac : t.tx3, fontWeight: focused ? '700' : '500' }}>
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ backgroundColor: t.bg1 }}>
      <AnchoredAd />
      {/* 記帳ボタンは帯から上へ 23dp 出る。その分の逃げをここで作る。
          広告に重ねてはいけない。AdMob は操作要素を広告のすぐ隣へ置くことを
          誤クリックの原因として禁じており、広告が覆われた状態も不可視の
          インプレッションになる。違反すると配信を止められる。 */}
      <View style={{ height: FAB_RISE + 3 }} />
      <View style={{
        flexDirection: 'row', alignItems: 'flex-start',
        borderTopWidth: 1, borderTopColor: t.bd,
        paddingBottom: insets.bottom || 8,
      }}>
        {routes.slice(0, half).map(tab)}

        <View style={{ width: 80, alignItems: 'center' }}>
          {/* ツアーの目印はボタン自身に付ける。囲みの View に付けると、
              上へ出た分が入らず、指す位置が下へずれる。 */}
          <TouchableOpacity
            ref={addRef}
            collapsable={false}
            accessibilityRole="button"
            accessibilityLabel="記帳する"
            onPress={() => navigation.navigate(ENTRY_ROUTE)}
            style={[{
              width: 64, height: 64, borderRadius: 32, marginTop: -FAB_RISE,
              backgroundColor: state.index === entryIndex ? t.acDeep : t.ac,
              alignItems: 'center', justifyContent: 'center',
            }, t.shadow]}
          >
            <Ionicons name="add" size={34} color={t.acTx} />
          </TouchableOpacity>
        </View>

        {routes.slice(half).map(tab)}
      </View>
    </View>
  );
}
