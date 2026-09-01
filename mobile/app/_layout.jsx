import '../src/polyfills';
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '../src/store/AuthProvider';
import { DataProvider, useData } from '../src/store/DataProvider';
import KdfBridge from '../src/crypto/KdfBridge';
import AppLock from '../src/components/AppLock';
import { useQuickActionRouting } from '../src/quickActions';
import { initAds } from '../src/ads';
import { useTheme, useThemeMode } from '../src/theme';
import { ThemeProvider } from '../src/store/ThemeProvider';

// ステータスバーの文字色は、端末設定ではなくアプリで選んだ配色に合わせる。
function ThemedStatusBar() {
  const { resolved } = useThemeMode();
  return <StatusBar style={resolved === 'light' ? 'dark' : 'light'} />;
}

function Nav() {
  const t = useTheme();
  const { presets } = useData();
  useQuickActionRouting(presets);
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: t.bg1 },
        headerTintColor: t.tx,
        headerTitleStyle: { fontWeight: '700' },
        contentStyle: { backgroundColor: t.bg0 },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="connect" options={{ title: 'アカウント接続', presentation: 'modal' }} />
      <Stack.Screen name="journal/[id]" options={{ title: '仕訳を編集' }} />
      <Stack.Screen name="settings/sync" options={{ title: 'アカウントと同期' }} />
      <Stack.Screen name="settings/appearance" options={{ title: '外観' }} />
      <Stack.Screen name="settings/security" options={{ title: 'アプリロック' }} />
      <Stack.Screen name="settings/reminder" options={{ title: 'リマインダー' }} />
      <Stack.Screen name="manage/index" options={{ title: '管理' }} />
      <Stack.Screen name="manage/accounts" options={{ title: '勘定科目' }} />
      <Stack.Screen name="manage/wallets" options={{ title: '口座' }} />
      <Stack.Screen name="manage/tags" options={{ title: 'タグ' }} />
      <Stack.Screen name="manage/presets" options={{ title: 'プリセット' }} />
      <Stack.Screen name="manage/recurring" options={{ title: '定期取引' }} />
      <Stack.Screen name="manage/budgets" options={{ title: '予算' }} />
      <Stack.Screen name="manage/allocations" options={{ title: 'タグ配分' }} />
      <Stack.Screen name="manage/csv" options={{ title: 'CSV' }} />
      <Stack.Screen name="manage/reconcile" options={{ title: '実査・評価替え' }} />
      <Stack.Screen name="manage/rules" options={{ title: '自動仕訳ルール' }} />
      <Stack.Screen name="manage/encryption" options={{ title: '暗号化' }} />
      <Stack.Screen name="add" options={{ title: '記帳', presentation: 'modal' }} />
      <Stack.Screen name="scan" options={{ title: '撮って記帳' }} />
      <Stack.Screen name="credit" options={{ title: 'クレジット' }} />
      <Stack.Screen name="inquiry" options={{ title: '問い合わせ' }} />
      <Stack.Screen name="ledger/bulk" options={{ title: 'まとめて編集' }} />
      <Stack.Screen name="shortcuts" options={{ title: 'ショートカット' }} />
      <Stack.Screen name="guide" options={{ title: '使い方' }} />
      <Stack.Screen name="diag" options={{ title: '動作診断', presentation: 'modal' }} />
    </Stack>
  );
}

export default function RootLayout() {
  // 広告SDKは起動時に一度だけ初期化する（暗黙初期化だと初回表示が遅れる）
  useEffect(() => { initAds(); }, []);
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
        <DataProvider>
          <AppLock>
            <Nav />
          </AppLock>
          <KdfBridge />
          <ThemedStatusBar />
        </DataProvider>
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
