import '../src/polyfills';
import { Component, useEffect } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import * as Updates from 'expo-updates';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '../src/store/AuthProvider';
import { DataProvider, useData } from '../src/store/DataProvider';
import KdfBridge from '../src/crypto/KdfBridge';
import AppLock from '../src/components/AppLock';
import { useQuickActionRouting } from '../src/quickActions';
import { initAds } from '../src/ads';
import { recordInstall } from '../src/components/ReviewAsk';
import { useTheme, useThemeMode } from '../src/theme';
import { ThemeProvider } from '../src/store/ThemeProvider';
import { TourProvider } from '../src/store/TourProvider';
import Tour from '../src/components/Tour';
import { OnboardingProvider } from '../src/store/OnboardingProvider';
import Onboarding from '../src/components/Onboarding';

// スプラッシュは既定だと最初の描画と同時に消える。起動が速い端末では一瞬すぎて
// 何が出たのか分からないので、自動で消えるのを止めて最低表示時間を持たせる。
SplashScreen.preventAutoHideAsync().catch(() => {});
// スプラッシュは白基調に固定している（ダークモードでも）ため、消えた瞬間に
// ダークモードの画面へ切り替わると色の変化が硬い。フェードで和らげる。
SplashScreen.setOptions({ fade: true, duration: 250 });
const SPLASH_HOLD_MS = 500;

/**
 * 起動時に描画が失敗したときの受け皿。
 *
 * ⚠ スプラッシュを preventAutoHide で止めているので、描画に失敗すると
 *   スプラッシュのまま固まる。利用者は操作もできず、何が起きたかも分からない。
 *   時間で当てずっぽうに消すのではなく、例外を捕まえた時点で消す。
 *
 * ⚠ ここで端末のデータを消さない。描画に失敗しただけで帳簿を捨てるのは筋が違う。
 *   利用者には再起動だけを提示し、消すかどうかは本人に決めさせる。
 *
 * ⚠ 配色プロバイダ自体が落ちている可能性があるので、テーマに依存しない色で描く。
 */
class StartupBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    // 何より先にスプラッシュを消す。これをしないと下のUIが見えない。
    SplashScreen.hideAsync().catch(() => {});
    console.error('起動に失敗:', error?.message || String(error));
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <View style={{ flex: 1, backgroundColor: '#f4f5f6', padding: 24, justifyContent: 'center', gap: 16 }}>
        <Text style={{ color: '#11181c', fontSize: 20, fontWeight: '800' }}>
          起動できませんでした
        </Text>
        <Text style={{ color: '#3a4145', fontSize: 15, lineHeight: 22 }}>
          アプリの読み込み中に問題が起きました。この端末に保存した帳簿は消えていません。
          再起動しても直らない場合は、設定の「問い合わせ」からご連絡ください。
        </Text>
        <Text style={{ color: '#6b7378', fontSize: 12.5 }} numberOfLines={4}>
          {String(error?.message || error)}
        </Text>
        <Pressable
          onPress={() => { Updates.reloadAsync().catch(() => {}); }}
          style={{ backgroundColor: '#0f766e', borderRadius: 12, paddingVertical: 14, alignItems: 'center' }}
        >
          <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: '700' }}>再起動する</Text>
        </Pressable>
      </View>
    );
  }
}

// ステータスバーの文字色は、端末設定ではなくアプリで選んだ配色に合わせる。
function ThemedStatusBar() {
  const { resolved } = useThemeMode();
  return <StatusBar style={resolved === 'light' ? 'dark' : 'light'} />;
}

function Nav() {
  const t = useTheme();
  const router = useRouter();
  const { presets } = useData();
  useQuickActionRouting(presets);
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: t.bg1 },
        headerTintColor: t.tx,
        headerTitleStyle: { fontWeight: '700' },
        contentStyle: { backgroundColor: t.bg0 },
        // 戻るボタンは矢印だけにする。既定では直前の画面名が並ぶが、タブ画面には
        // 名前が無いためルート名がそのまま出て「＜ (tabs)」になっていた。
        // 画面名を付けて回っても、日本語のタイトルは長くて矢印の横に収まらない。
        headerBackButtonDisplayMode: 'minimal',
        // ⚠ iOS は戻るボタンを自前にする。iOS 26 ＋ react-native-screens 4.16.0（Expo SDK 54 の固定版）では、
        //   ヘッダーを隠した画面（タブ）の上に積んだ画面で、標準の「＜」が途中から押しても反応しなくなる
        //   （スワイプで戻るのは効く）。設定の中の画面で起きていた（2026-10-02 問い合わせ）。
        //   本来の修正は react-native-screens 4.28 以降。上げたらここを外す。
        //   参考: software-mansion/react-native-screens #3294
        ...(Platform.OS === 'ios' ? {
          headerLeft: ({ canGoBack, tintColor }) => (canGoBack ? (
            <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="戻る"
              style={{ paddingRight: 8 }}>
              <Ionicons name="chevron-back" size={28} color={tintColor || t.tx} />
            </Pressable>
          ) : null),
        } : {}),
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="connect" options={{ title: 'アカウント接続', presentation: 'modal' }} />
      <Stack.Screen name="journal/[id]" options={{ title: '仕訳を編集' }} />
      <Stack.Screen name="updates" options={{ title: '更新情報' }} />
      {/* ログイン・ログアウトからの戻り先（Android）。見せずにすぐ戻る */}
      <Stack.Screen name="auth" options={{ headerShown: false, animation: 'none' }} />
      <Stack.Screen name="settings/sync" options={{ title: 'アカウントと同期' }} />
      <Stack.Screen name="settings/delete-account" options={{ title: 'アカウントの削除' }} />
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
      <Stack.Screen name="resolve-codes" options={{ title: 'コードの重複' }} />
    </Stack>
  );
}

// 初回の案内はツアーからオンボーディングに替えた（src/components/Onboarding.jsx）。
// ツアー自体は残す。「使い方」画面から見直せるし、useTourTarget は各画面が使っている。
export default function RootLayout() {
  // 広告SDKは起動時に一度だけ初期化する（暗黙初期化だと初回表示が遅れる）
  useEffect(() => { initAds(); }, []);
  // ストア評価の「インストールから3日」の起点。初回起動で一度だけ記録する
  useEffect(() => { recordInstall(); }, []);
  // 自動で消すのを止めてあるので、ここで責任を持って消す。
  // 失敗しても握りつぶさない（スプラッシュが残ったままになると何も操作できない）。
  useEffect(() => {
    const t = setTimeout(() => { SplashScreen.hideAsync().catch(() => {}); }, SPLASH_HOLD_MS);
    return () => clearTimeout(t);
  }, []);
  return (
    <StartupBoundary>
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
        <DataProvider>
          <OnboardingProvider>
          <TourProvider>
            {/* オンボーディングは AppLock の内側に置く。外に出すとロック画面の上に出てしまう。 */}
            <AppLock>
              <Nav />
              <Onboarding />
            </AppLock>
            <Tour />
          </TourProvider>
          </OnboardingProvider>
          <KdfBridge />
          <ThemedStatusBar />
        </DataProvider>
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
    </StartupBoundary>
  );
}
