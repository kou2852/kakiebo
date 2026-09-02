// 同期の状態と手動同期、アカウントの削除。
//
// 削除をこの画面に置いているのは、App Store の審査要件（5.1.1(v)）で
// 「アカウントを作れるアプリは、アプリ内から削除を開始できること」が求められ、
// かつ見つけにくい場所に隠すことも認められていないため。
// アカウントに関する操作はこの1画面に集めて、設定の先頭から辿れるようにしている。
import { useState } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';
import * as Updates from 'expo-updates';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/store/AuthProvider';
import { useData } from '../../src/store/DataProvider';
import { useTheme } from '../../src/theme';
import { Button, Card, Screen } from '../../src/components/ui';
import { resetAll } from '../../src/db';

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

  const [deleting, setDeleting] = useState(false);

  // サーバー → 端末の順で消す。逆にすると、サーバーの削除に失敗したときに
  // 端末だけ空になり、次の同期でサーバーの内容が戻ってくる。
  const doDelete = async () => {
    setDeleting(true);
    try {
      await auth.deleteAccount();
      // 端末に預けたデータ鍵（Keychain）も消す。ここを忘れると、消したはずの
      // アカウントの鍵が端末に残る。
      await d.forgetDek();
      await resetAll();
      // 消した直後の画面には、もう存在しない帳簿が残っている。読み込み直して確実に消す。
      try {
        await Updates.reloadAsync();
      } catch {
        Alert.alert('削除しました', 'アプリを再起動してください。');
      }
    } catch (e) {
      Alert.alert('削除できません', e?.message || String(e));
    } finally {
      setDeleting(false);
    }
  };

  const confirmDelete = () =>
    Alert.alert(
      'アカウントを削除しますか',
      'サーバーに保存した帳簿とログイン情報をすべて削除します。'
      + 'この端末に保存した帳簿も消えます。取り消せません。',
      [
        { text: 'やめる', style: 'cancel' },
        { text: '削除する', style: 'destructive', onPress: doDelete },
      ],
    );

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

      {auth.signedIn ? (
        <Card title="アカウントの削除">
          <Text style={{ color: t.tx2, fontSize: 15, lineHeight: 22 }}>
            サーバーに保存した帳簿とログイン情報をすべて削除します。
            この端末に保存した帳簿も一緒に消えます。取り消せません。
          </Text>
          {d.pendingCount ? (
            <Text style={{ color: t.red, fontSize: 14 }}>
              未送信の変更が {d.pendingCount} 件あります。これも消えます。
            </Text>
          ) : null}
          {deleting ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <ActivityIndicator color={t.red} />
              <Text style={{ color: t.tx2, fontSize: 15 }}>削除中…</Text>
            </View>
          ) : (
            <Button label="アカウントを削除" variant="danger" onPress={confirmDelete} />
          )}
        </Card>
      ) : null}
    </Screen>
  );
}
