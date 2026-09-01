import { Tabs } from 'expo-router';
import { useTheme } from '../../src/theme';
import TabBar from '../../src/components/TabBar';

export default function TabsLayout() {
  const t = useTheme();
  return (
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
  );
}
