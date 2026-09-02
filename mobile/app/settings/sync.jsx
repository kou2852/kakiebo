// 同期の状態と手動同期。
import { ActivityIndicator, Alert, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/store/AuthProvider';
import { useData } from '../../src/store/DataProvider';
import { useTheme } from '../../src/theme';
import { Button, Card, Screen } from '../../src/components/ui';

function Row({ label, value }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text style={{ color: t.tx2, fontSize: 15 }}>{label}</Text>
      <Text style={{ color: t.tx, fontSize: 15, fontWeight: '600' }}>{value}</Text>
    </View>
  );
}

export default function Sync() {
  const t = useTheme();
  const router = useRouter();
  const auth = useAuth();
  const d = useData();

  const doSync = async () => {
    try {
      const r = await d.sync();
      const note = r.notes?.length ? `\n\n${r.notes.join('\n')}` : '';
      Alert.alert('同期しました', `仕訳 ${r.dataset.journals.length.toLocaleString('ja-JP')} 件${note}`);
    } catch (e) {
      Alert.alert('同期できません', e?.message || String(e));
    }
  };

  return (
    <Screen>
      <Card title="接続">
        <Row label="接続先" value={auth.env === 'prod' ? '本番' : '開発 (dev)'} />
        <Row label="ログイン" value={auth.email || '未ログイン'} />
        {d.unlocked ? <Row label="暗号化" value="解錠済み（この端末に鍵を保持）" /> : null}
        <Button label="アカウントに接続 / 帳簿を取り込む" onPress={() => router.push('/connect')} />
      </Card>

      <Card title="同期">
        <Row label="未送信の変更" value={`${d.pendingCount} 件`} />
        {d.lastSync?.error ? (
          <Text style={{ color: t.red, fontSize: 14 }}>前回の同期に失敗: {d.lastSync.error}</Text>
        ) : d.lastSync ? (
          <Text style={{ color: t.tx3, fontSize: 13.5 }}>
            前回の同期: {new Date(d.lastSync.at).toLocaleString('ja-JP')}
            {d.lastSync.notes?.length ? `（${d.lastSync.notes.join(' / ')}）` : ''}
          </Text>
        ) : null}
        {d.syncing ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <ActivityIndicator color={t.ac} />
            <Text style={{ color: t.tx2, fontSize: 15 }}>同期中…</Text>
          </View>
        ) : (
          <Button label="いま同期する" onPress={doSync} disabled={!auth.signedIn} />
        )}
        <Text style={{ color: t.tx3, fontSize: 13.5 }}>
          オフライン中の変更は端末に溜まり、通信が戻ると自動で送られます。
        </Text>
      </Card>
    </Screen>
  );
}
