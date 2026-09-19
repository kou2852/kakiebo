// 設定。iOS の設定アプリに倣い、直接ボタンを並べずメニューから各画面へ進む形にする。
//
// 管理（勘定科目・タグ等）もここに統合した。以前は「件数を出すカード」と
// 「管理へ行くボタン」が別々で、同じものを2つの見た目で示していた。
import { Alert, Linking, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useRouter } from 'expo-router';
import * as Updates from 'expo-updates';
import { useAuth } from '../../src/store/AuthProvider';
import { useData } from '../../src/store/DataProvider';
import { useThemeMode, useTheme } from '../../src/theme';
import { MenuList, Screen } from '../../src/components/ui';
import Constants from 'expo-constants';
import { BUILD_STAMP } from '../../src/buildStamp';
import { resetAll } from '../../src/db';
import { forgetOnboarding } from '../../src/store/OnboardingProvider';
import { codeCollisions } from '../../src/store/merge';

// 規約・ポリシーはアプリ内ブラウザで開く。
//
// ⚠ Linking.openURL だと Safari に飛ばされ、どのアプリから来たのか分からなくなる。
//   openBrowserAsync なら配色を合わせた画面がアプリの上に重なり、閉じれば戻る。
const openInApp = (url, t) => WebBrowser.openBrowserAsync(url, {
  toolbarColor: t.bg1,
  controlsColor: t.ac,
  presentationStyle: 'pageSheet',
}).catch(() => Linking.openURL(url)); // 端末に対応ブラウザが無い場合の逃げ道

export default function Settings() {
  const t = useTheme();
  const router = useRouter();
  const d = useData();
  const auth = useAuth();
  const theme = useThemeMode();

  const go = (href) => () => router.push(href);
  // 別IDなのに同じ勘定科目コードを持つ組の数。0 なら項目自体を出さない。
  const dupCodes = codeCollisions({ accounts: d.accounts }, { accounts: [] }, { accounts: d.accounts }).length;
  const n = (v) => `${v.length} 件`;

  // 消したあとは読み込み直す。消えたはずの帳簿が画面に残ったままだと、
  // 消えていないように見える。再起動を利用者にやらせない（sync.jsx の削除と同じ扱い）。
  const doReset = async () => {
    await resetAll();
    // 初期状態に戻したのだから、次の起動はオンボーディングから始める。
    await forgetOnboarding();
    try {
      await Updates.reloadAsync();
    } catch {
      // 開発ビルドなど reload が使えない環境向けの逃げ道。
      Alert.alert('消去しました', 'アプリを再起動してください');
    }
  };

  const confirmReset = () =>
    Alert.alert('端末のデータを消去しますか？', 'この端末に保存した帳簿を削除して初期状態に戻します。', [
      { text: 'キャンセル', style: 'cancel' },
      { text: '消去', style: 'destructive', onPress: doReset },
    ]);

  return (
    <Screen>
      <MenuList items={[
        {
          label: 'アカウントと同期',
          // 未ログイン時は送り先が無いので「未送信」と言わない。キューは残す
          // （初回ログイン時に送るために要る）。表示だけ抑える。
          value: auth.signedIn && d.pendingCount ? `未送信 ${d.pendingCount} 件` : (auth.email || '未ログイン'),
          alert: auth.signedIn && d.pendingCount > 0,
          onPress: go('/settings/sync'),
        },
        { label: '外観', value: theme.mode === 'auto' ? '端末に合わせる' : (theme.resolved === 'light' ? 'ライト' : 'ダーク'), onPress: go('/settings/appearance') },
        { label: 'アプリロック', onPress: go('/settings/security') },
        { label: 'リマインダー', onPress: go('/settings/reminder') },
        { label: 'ショートカット', onPress: go('/shortcuts') },
      ]} />

      <MenuList title="帳簿の基礎" items={[
        { label: '勘定科目', value: n(d.accounts), onPress: go('/manage/accounts') },
        // 帳簿を合わせたあとにコードが重なることがある。放置すると一覧の並びが
        // 崩れたままになるので、後からでも直せる入口をここに置く。
        ...(dupCodes ? [{ label: 'コードの重複を直す', value: `${dupCodes} 件`, alert: true, onPress: go('/resolve-codes') }] : []),
        { label: '口座・カード', value: n(d.wallets), onPress: go('/manage/wallets') },
        { label: 'タグ', value: n(d.tags), onPress: go('/manage/tags') },
      ]} />

      <MenuList title="自動化・効率化" items={[
        { label: 'プリセット', value: n(d.presets), onPress: go('/manage/presets') },
        { label: '自動仕訳ルール', value: n(d.rules || []), onPress: go('/manage/rules') },
        { label: '定期取引', value: n(d.recurring), onPress: go('/manage/recurring') },
      ]} />

      <MenuList title="お金を管理する" items={[
        { label: '実査・評価替え', sub: '実残高と突き合わせて帳簿を合わせる', onPress: go('/manage/reconcile') },
        { label: '予算', value: n(d.budgets), onPress: go('/manage/budgets') },
        { label: 'タグ配分', value: n(d.allocs || []), onPress: go('/manage/allocations') },
      ]} />

      <MenuList title="データ・その他" items={[
        { label: 'CSV 入出力', value: `仕訳 ${d.journals.length.toLocaleString('ja-JP')} 件`, onPress: go('/manage/csv') },
        { label: '暗号化・バックアップ', onPress: go('/manage/encryption') },
      ]} />

      <MenuList items={[
        { label: '使い方', onPress: go('/guide') },
        { label: '問い合わせ', onPress: go('/inquiry') },
        // 5.1.1(i)「プライバシーポリシーへのリンクをアプリ内の分かりやすい場所に置く」
        { label: '利用規約', onPress: () => openInApp('https://kurofukubo.com/terms.html', t) },
        { label: 'プライバシーポリシー', onPress: () => openInApp('https://kurofukubo.com/privacy.html', t) },
      ]} />

      {/* 取り返しがつかない操作なので、他の項目と地続きにしない */}
      <View style={{ height: 18 }} />
      <MenuList items={[
        { label: '端末のデータを消去', sub: 'この端末に保存した帳簿を削除します', danger: true, onPress: confirmReset },
      ]} />

      <Text style={{ color: t.tx3, fontSize: 13.5, textAlign: 'center' }}>
        kurofukubo v{Constants.expoConfig?.version ?? '?'} · build {BUILD_STAMP}
      </Text>
    </Screen>
  );
}
