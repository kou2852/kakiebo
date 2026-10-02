// アカウントの削除（専用の画面）。「アカウントと同期」の「アカウント削除に進む」から開く。
//
// App Store の審査要件（5.1.1(v)）で、アプリ内から削除を開始できることが求められている。
// 入口は「アカウントと同期」に置いたまま、理由を聞く欄と削除のボタンをこの画面にまとめた（2026-10-02）。
import { useState } from 'react';
import { ActivityIndicator, Alert, Text, TouchableOpacity, View } from 'react-native';
import * as Updates from 'expo-updates';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/store/AuthProvider';
import { useData } from '../../src/store/DataProvider';
import { useTheme } from '../../src/theme';
import { Button, Card, Input, Screen } from '../../src/components/ui';
import { resetAll } from '../../src/db';
import { forgetOnboarding } from '../../src/store/OnboardingProvider';

// 削除の理由の選択肢。自由記述だけだと書かれない（9/7 以降の退会7件がすべて空。2026-09-22 調査）ので、
// 数タップで選べる形を先に置く。選ばなくても削除はできる（退会を妨げない）。
// サーバーは理由をログに1行残すだけで、DB には保存しない（backend/src/handlers/settings.js）。
const REASONS = [
  '操作が分かりにくい',
  '登録を間違えて、直し方が分からない',
  '欲しい機能がない',
  '別のアプリに乗り換える',
  '入力が面倒で続かない',
  '試しに使っただけ',
  'その他',
];

export default function DeleteAccount() {
  const t = useTheme();
  const router = useRouter();
  const auth = useAuth();
  const d = useData();

  const [deleting, setDeleting] = useState(false);
  const [reasons, setReasons] = useState([]);
  const [note, setNote] = useState('');
  const toggleReason = (x) => setReasons((cur) => (cur.includes(x) ? cur.filter((y) => y !== x) : [...cur, x]));

  // サーバー → 端末の順で消す。逆にすると、サーバーの削除に失敗したときに
  // 端末だけ空になり、次の同期でサーバーの内容が戻ってくる。
  const doDelete = async () => {
    setDeleting(true);
    try {
      // 選んだ理由と自由記述を1つの文字列にして送る（サーバーは500字で切る）
      const reason = [reasons.join('、'), note.trim()].filter(Boolean).join(' / ');
      await auth.deleteAccount(reason || undefined);
      // 端末に預けたデータ鍵（Keychain）も消す。ここを忘れると、消したはずの
      // アカウントの鍵が端末に残る。
      await d.forgetDek();
      await resetAll();
      // 端末は空になったので、次の起動はオンボーディングから始める。
      await forgetOnboarding();
      // ⚠ 黙って再起動しない。以前は即 reloadAsync していたため結果が見えず、
      //   「アカウント自体は消えたのか」が利用者に分からなかった。
      Alert.alert('削除しました',
        'サーバーの帳簿とログイン情報、この端末の帳簿を削除しました。\n'
        + '「再起動」を押すとアプリを読み込み直します。',
        [{ text: '再起動', onPress: () => { Updates.reloadAsync().catch(() => {}); } }],
        { cancelable: false });
    } catch (e) {
      Alert.alert('削除できません', e?.message || String(e));
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

  // ログインしていない（ログアウトした直後など）なら消す対象が無い
  if (!auth.signedIn && !deleting) {
    return (
      <Screen>
        <Card>
          <Text style={{ color: t.tx2, fontSize: 15, lineHeight: 22 }}>ログインしていないため、削除するアカウントがありません。</Text>
          <Button label="戻る" variant="ghost" onPress={() => router.back()} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <Card title="削除されるもの">
        <Text style={{ color: t.tx2, fontSize: 15, lineHeight: 22 }}>
          サーバーに保存した帳簿とログイン情報をすべて削除します。
          この端末に保存した帳簿も一緒に消えます。取り消せません。
        </Text>
        {d.pendingCount ? (
          <Text style={{ color: t.red, fontSize: 14 }}>
            未送信の変更が {d.pendingCount} 件あります。これも消えます。
          </Text>
        ) : null}
      </Card>

      <Card title="削除の理由（任意・複数可）">
        <Text style={{ color: t.tx3, fontSize: 13.5, lineHeight: 20 }}>
          よろしければ教えてください。改善の参考にします。選ばなくても削除できます。
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {REASONS.map((x) => {
            const on = reasons.includes(x);
            return (
              <TouchableOpacity key={x} onPress={() => toggleReason(x)} disabled={deleting}
                accessibilityRole="checkbox" accessibilityState={{ checked: on }}
                style={{
                  paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999,
                  borderWidth: 1, borderColor: on ? t.ac : t.bd2, backgroundColor: on ? t.acb : t.bg1,
                }}>
                <Text style={{ color: on ? t.ac : t.tx2, fontSize: 14, fontWeight: on ? '700' : '400' }}>{x}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Input value={note} onChangeText={setNote} placeholder="よろしければ詳しく教えてください" multiline
          editable={!deleting} maxLength={400} style={{ minHeight: 90, textAlignVertical: 'top', fontSize: 15 }} />
      </Card>

      {deleting ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12 }}>
          <ActivityIndicator color={t.red} />
          <Text style={{ color: t.tx2, fontSize: 15 }}>削除中…</Text>
        </View>
      ) : (
        <>
          <Button label="アカウントを削除する" variant="danger" onPress={confirmDelete} />
          <Button label="やめる" variant="ghost" onPress={() => router.back()} />
        </>
      )}
    </Screen>
  );
}
