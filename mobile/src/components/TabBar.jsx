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
import { useOnboarding } from '../store/OnboardingProvider';

// 中央ボタンで開くルート。タブとしては出さない。
const ENTRY_ROUTE = 'journal';

const ICONS = {
  index: 'grid-outline',
  ledger: 'list-outline',
  reports: 'stats-chart-outline',
  settings: 'settings-outline',
};

export default function TabBar({ state, descriptors, navigation }) {
  const addRef = useTourTarget('add-button');
  const onboarding = useOnboarding();
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
      {/*
        ⚠ オンボーディング中は広告を置かない。タブバーはオンボーディングの覆いの下に隠れていて、
          置くと見えない広告を読み込み、不可視のインプレッションになる（下の中央ボタンの注意と同じ）。
          それに、隠れている間の読み込みで在庫が無いと取り直しまで1分空き、
          オンボーディングを終えた直後のホームで広告が出ていなかった。
      */}
      {onboarding?.active ? null : <AnchoredAd />}
      <View style={{
        flexDirection: 'row', alignItems: 'flex-start',
        borderTopWidth: 1, borderTopColor: t.bd,
        paddingBottom: insets.bottom || 8,
      }}>
        {routes.slice(0, half).map(tab)}

        {/* ツアーの目印は囲みの View に付ける。TouchableOpacity の ref は
            measureInWindow を持たず、測れずに指し示しが出ない。
            ボタンは帯から出ないので、囲みの位置がそのまま正しい。 */}
        <View ref={addRef} collapsable={false} style={{ width: 80, alignItems: 'center' }}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="記帳する"
            onPress={() => navigation.navigate(ENTRY_ROUTE)}
            style={[{
              width: 64, height: 64, borderRadius: 32,
              // 帯から上へ出さない。出すと広告に重なる。AdMob は操作要素を
              // 広告のすぐ隣へ置くことを誤クリックの原因として禁じており、
              // 広告が覆われた状態も不可視のインプレッションになる。
              // 違反するとそのアプリへの広告配信を止められうる。
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
