// kurofukubo のアカウントに接続して、サーバー上の帳簿を端末へ取り込む。
// **取り込むだけで、サーバーへは一切書き込まない。** 書き込み同期は削除の伝播まで
// 設計してから入れる（/api/import は upsert なので、それを使うと消した仕訳が復活する）。
import { useState } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/store/AuthProvider';
import { useData } from '../src/store/DataProvider';
import { useTheme } from '../src/theme';
import { Button, Card, ChipRow, Field, Input, Screen } from '../src/components/ui';
import { ENVIRONMENTS } from '../src/config';
import { probe, pullEncrypted, pullPlain, unlockWith } from '../src/store/pull';

export default function Connect() {
  const t = useTheme();
  const router = useRouter();
  const auth = useAuth();
  const { pendingCount, replaceAll, rememberDek } = useData();

  const [mail, setMail] = useState('');
  const [password, setPassword] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [bundle, setBundle] = useState(null); // 暗号化アカウントのとき、解錠待ちの鍵バンドル
  const [ct, setCt] = useState(null);
  const [busy, setBusy] = useState(null);

  const fail = (e) => Alert.alert('失敗しました', e?.message || String(e));

  const doGoogle = async () => {
    setBusy('Google に接続中…');
    try {
      await auth.signInWithGoogle();
      await inspect();
    } catch (e) { fail(e); } finally { setBusy(null); }
  };

  const doSignIn = async () => {
    setBusy('ログイン中…');
    try {
      await auth.signIn(mail.trim(), password);
      setPassword('');
      await inspect();
    } catch (e) { fail(e); } finally { setBusy(null); }
  };

  // 暗号化アカウントかどうかで、この先の手順が変わる。
  const inspect = async () => {
    setBusy('アカウントを確認中…');
    try {
      const p = await probe();
      if (p.encrypted) { setBundle(p.bundle); setCt(p.ct); }
      else await importPlain();
    } catch (e) { fail(e); } finally { setBusy(null); }
  };

  const finish = async (dataset) => {
    await replaceAll(dataset);
    const n = dataset.journals.length;
    Alert.alert('取り込みました', `仕訳 ${n.toLocaleString('ja-JP')} 件 / 勘定科目 ${dataset.accounts.length} 件`,
      [{ text: 'OK', onPress: () => router.back() }]);
  };

  const importPlain = async () => finish(await pullPlain());

  const doUnlock = async () => {
    setBusy('解錠中…');
    try {
      const dek = await unlockWith(bundle, passphrase);
      await rememberDek(dek); // 次回からパスフレーズ入力を省く（鍵は端末の Keychain のみ）
      setPassphrase('');
      await finish(pullEncrypted(dek, ct));
    } catch {
      // AES-GCM の認証が失敗した＝鍵が違う。原因を取り違えないよう文言を分ける。
      Alert.alert('解錠できません', 'パスフレーズが違います');
    } finally { setBusy(null); }
  };

  if (auth.booting) return <Screen><ActivityIndicator color={t.ac} /></Screen>;

  return (
    <Screen>
      {pendingCount > 0 ? (
        <Card>
          <Text style={{ color: t.red, fontSize: 14, lineHeight: 20 }}>
            この端末に未送信の変更が {pendingCount} 件あります。取り込むと上書きされて消えます。
            まだ書き込み同期が無いためです。
          </Text>
        </Card>
      ) : null}

      <Card title="接続先">
        <ChipRow
          options={Object.entries(ENVIRONMENTS).map(([k, v]) => ({ value: k, label: v.label }))}
          value={auth.env}
          onChange={auth.setEnv}
        />
        <Text style={{ color: t.tx3, fontSize: 12 }}>
          既定は開発環境です。本番の家計データを見る場合のみ本番に切り替えてください。
        </Text>
      </Card>

      {!auth.signedIn ? (
        <Card title="ログイン">
          <Field label="メールアドレス">
            <Input value={mail} onChangeText={setMail} autoCapitalize="none" keyboardType="email-address"
              autoComplete="email" textContentType="username" placeholder="you@example.com" />
          </Field>
          <Field label="パスワード">
            <Input value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none"
              autoComplete="current-password" textContentType="password" />
          </Field>
          <Button label="ログイン" onPress={doSignIn} disabled={!mail.trim() || !password || !!busy} />
          <Button label="Google でログイン" variant="ghost" onPress={doGoogle} disabled={!!busy} />
          <Text style={{ color: t.tx3, fontSize: 12 }}>
            Google ログインは Expo Go では動きません（戻り先が {'kurofukubo://auth'} 固定のため）。開発ビルドが要ります。
          </Text>
        </Card>
      ) : bundle ? (
        <Card title="暗号化の解錠">
          <Text style={{ color: t.tx2, fontSize: 14, lineHeight: 20 }}>
            このアカウントは E2E 暗号化が有効です。パスフレーズは端末内でのみ使われ、送信されません。
          </Text>
          <Field label="パスフレーズ">
            <Input value={passphrase} onChangeText={setPassphrase} secureTextEntry autoCapitalize="none" />
          </Field>
          <Button label="解錠して取り込む" onPress={doUnlock} disabled={!passphrase || !!busy} />
        </Card>
      ) : (
        <Card title="ログイン済み">
          <Text style={{ color: t.tx, fontSize: 14 }}>{auth.email}</Text>
          <Button label="帳簿を取り込む" onPress={inspect} disabled={!!busy} />
          <Button label="ログアウト" variant="ghost" onPress={() => { auth.signOut(); setBundle(null); setCt(null); }} />
        </Card>
      )}

      {busy ? (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <ActivityIndicator color={t.ac} />
            <Text style={{ color: t.tx, fontSize: 14 }}>{busy}</Text>
          </View>
        </Card>
      ) : null}

      <Card title="いまできること">
        <Text style={{ color: t.tx2, fontSize: 13, lineHeight: 19 }}>
          サーバーからの取り込みのみ対応しています。この端末で加えた変更はサーバーへ送られません。
        </Text>
      </Card>
    </Screen>
  );
}
