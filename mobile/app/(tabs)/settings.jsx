// 設定。iOS の設定アプリに倣い、直接ボタンを並べずメニューから各画面へ進む形にする。
//
// 管理（勘定科目・タグ等）もここに統合した。以前は「件数を出すカード」と
// 「管理へ行くボタン」が別々で、同じものを2つの見た目で示していた。
import { Alert, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/store/AuthProvider';
import { useData } from '../../src/store/DataProvider';
import { useThemeMode, useTheme } from '../../src/theme';
import { MenuList, Screen } from '../../src/components/ui';
import { BUILD_STAMP } from '../../src/buildStamp';
import { resetAll } from '../../src/db';

export default function Settings() {
  const t = useTheme();
  const router = useRouter();
  const d = useData();
  const auth = useAuth();
  const theme = useThemeMode();

  const go = (href) => () => router.push(href);
  const n = (v) => `${v.length} 件`;

  const confirmReset = () =>
    Alert.alert('端末のデータを消去しますか？', 'この端末に保存した帳簿を削除して初期状態に戻します。アプリを再起動してください。', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '消去',
        style: 'destructive',
        onPress: () => resetAll().then(() => Alert.alert('消去しました', 'アプリを再起動してください')),
      },
    ]);

  return (
    <Screen>
      <MenuList items={[
        {
          label: 'アカウントと同期',
          value: d.pendingCount ? `未送信 ${d.pendingCount} 件` : (auth.email || '未ログイン'),
          alert: d.pendingCount > 0,
          onPress: go('/settings/sync'),
        },
        { label: '外観', value: theme.mode === 'auto' ? '端末に合わせる' : (theme.resolved === 'light' ? 'ライト' : 'ダーク'), onPress: go('/settings/appearance') },
        { label: 'アプリロック', onPress: go('/settings/security') },
        { label: 'リマインダー', onPress: go('/settings/reminder') },
        { label: 'ショートカット', onPress: go('/shortcuts') },
      ]} />

      <MenuList title="帳簿の基礎" items={[
        { label: '勘定科目', value: n(d.accounts), onPress: go('/manage/accounts') },
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
      ]} />

      {/* 取り返しがつかない操作なので、他の項目と地続きにしない */}
      <View style={{ height: 18 }} />
      <MenuList items={[
        { label: '端末のデータを消去', sub: 'この端末に保存した帳簿を削除します', danger: true, onPress: confirmReset },
      ]} />

      <Text style={{ color: t.tx3, fontSize: 13.5, textAlign: 'center' }}>
        kurofukubo v0.1.0 · build {BUILD_STAMP}
      </Text>
    </Screen>
  );
}
