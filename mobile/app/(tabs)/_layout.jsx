import { View } from 'react-native';
import { Tabs } from 'expo-router';
import { useTheme } from '../../src/theme';
import TabBar from '../../src/components/TabBar';
import { useOnboarding } from '../../src/store/OnboardingProvider';

export default function TabsLayout() {
  const t = useTheme();
  const onboarding = useOnboarding();
  return (
    <View style={{ flex: 1 }}>
      <Tabs
        tabBar={(props) => <TabBar {...props} />}
        screenOptions={{
          headerStyle: { backgroundColor: t.bg1 },
          headerTintColor: t.tx,
          headerTitleStyle: { fontWeight: '700' },
          sceneStyle: { backgroundColor: t.bg0 },
        }}
      >
        <Tabs.Screen name="index"    options={{ title: 'ダッシュボード', tabBarLabel: 'ホーム' }} />
        <Tabs.Screen name="ledger"   options={{ title: '仕訳帳', tabBarLabel: '仕訳帳' }} />
        {/* 記帳は中央のボタンから開く。タブには出さない（役割が重複するため） */}
        <Tabs.Screen name="journal"  options={{ title: '記帳' }} />
        <Tabs.Screen name="reports"  options={{ title: 'レポート', tabBarLabel: 'レポート' }} />
        <Tabs.Screen name="settings" options={{ title: '設定', tabBarLabel: '設定' }} />
      </Tabs>
      {/*
        オンボーディング中はタブ画面を無地の幕で隠す。
        ⚠ オンボーディングからログインへ飛ぶと、覆いを外してから接続画面がせり上がり終わるまでの間、
          下のホームが一瞬見えていた。幕はタブ画面の中にあるので、接続画面（別のルート）はこの上に出る。
      */}
      {onboarding?.active ? (
        <View pointerEvents="none" style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: t.bg0,
        }} />
      ) : null}
    </View>
  );
}
