// kurofukubo のアカウントを作る / 既存のアカウントに繋いで、サーバー上の帳簿を取り込む。
//
// アカウントが無くてもアプリは全機能が使える（帳簿は端末内で完結する）。
// アカウントは端末を跨いで持ち歩くためのもので、登録を必須にはしない。
import { useState } from 'react';
import { ActivityIndicator, Alert, Linking, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/store/AuthProvider';
import { useData } from '../src/store/DataProvider';
import { useTheme } from '../src/theme';
import { Button, Card, Field, Input, Screen, Segmented } from '../src/components/ui';
import { probe, pullEncrypted, pullPlain, unlockWith } from '../src/store/pull';
import { authMessage } from '../src/auth/cognito';

const MODES = [{ value: 'signin', label: 'ログイン' }, { value: 'signup', label: '新規登録' }];

// Cognito 側の設定と揃える（backend/template.yaml の PasswordPolicy）。
// 画面に出しておかないと、登録を押してから弾かれて理由が分からない。
const PW_RULE = '8文字以上。英小文字と数字を含めてください。';
const pwOk = (v) => v.length >= 8 && /[a-z]/.test(v) && /[0-9]/.test(v);

export default function Connect() {
  const t = useTheme();
  const router = useRouter();
  const auth = useAuth();
  const { pendingCount, replaceAll, rememberDek } = useData();

  const [mode, setMode] = useState('signin');
  const [mail, setMail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [awaiting, setAwaiting] = useState(null); // 確認コード待ちの登録先メール
  const [passphrase, setPassphrase] = useState('');
  const [bundle, setBundle] = useState(null); // 暗号化アカウントのとき、解錠待ちの鍵バンドル
  const [ct, setCt] = useState(null);
  const [busy, setBusy] = useState(null);

  const fail = (e) => Alert.alert('失敗しました', authMessage(e));

  const doGoogle = async () => {
    setBusy('Google に接続中…');
    try {
      await auth.signInWithGoogle();
      await inspect();
    } catch (e) { fail(e); } finally { setBusy(null); }
  };

  const doSignUp = async () => {
    setBusy('登録中…');
    try {
      await auth.signUp(mail.trim(), password);
      setAwaiting(mail.trim());
    } catch (e) { fail(e); } finally { setBusy(null); }
  };

  // 確認できたらそのままログインまで済ませる。ここで手を止めさせる理由がない。
  const doConfirm = async () => {
    setBusy('確認中…');
    try {
      await auth.confirmSignUp(awaiting, code.trim());
      await auth.signIn(awaiting, password);
      setPassword(''); setCode(''); setAwaiting(null);
      Alert.alert('登録しました',
        'この端末の帳簿はそのまま残ります。同期するとサーバーにも保存され、他の端末から見られるようになります。',
        [{ text: 'OK', onPress: () => router.back() }]);
    } catch (e) { fail(e); } finally { setBusy(null); }
  };

  const doResend = async () => {
    setBusy('再送中…');
    try {
      await auth.resendCode(awaiting);
      Alert.alert('送り直しました', awaiting + ' を確認してください。');
    } catch (e) { fail(e); } finally { setBusy(null); }
  };

  const doSignIn = async () => {
    setBusy('ログイン中…');
    try {
      await auth.signIn(mail.trim(), password);
      setPassword('');
      await inspect();
    } catch (e) {
      // 登録の途中でコード入力をやめた人。ここで確認へ戻せないと、その
      // メールアドレスは登録済みなのにログインもできない行き止まりになる。
      if ((e?.code || e?.name) === 'UserNotConfirmedException') {
        setAwaiting(mail.trim());
        await auth.resendCode(mail.trim()).catch(() => {});
        Alert.alert('確認が済んでいません', '確認コードを送り直しました。メールを見てください。');
      } else fail(e);
    } finally { setBusy(null); }
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
          <Text style={{ color: t.red, fontSize: 15, lineHeight: 22 }}>
            この端末に未送信の変更が {pendingCount} 件あります。取り込みはサーバーの内容で
            まるごと置き換えるため、この変更は消えます。先に「いま同期する」で送ってください。
          </Text>
        </Card>
      ) : null}


      {awaiting ? (
        <Card title="確認コードの入力">
          <Text style={{ color: t.tx2, fontSize: 15, lineHeight: 22 }}>
            {awaiting} に6桁のコードを送りました。迷惑メールに入ることがあります。
          </Text>
          <Field label="確認コード">
            <Input value={code} onChangeText={setCode} keyboardType="number-pad"
              autoComplete="one-time-code" textContentType="oneTimeCode" placeholder="123456" />
          </Field>
          <Button label="確認して始める" onPress={doConfirm} disabled={!code.trim() || !!busy} />
          <Button label="コードを送り直す" variant="ghost" onPress={doResend} disabled={!!busy} />
          <Button label="やめる" variant="ghost"
            onPress={() => { setAwaiting(null); setCode(''); }} disabled={!!busy} />
        </Card>
      ) : !auth.signedIn ? (
        <Card>
          <Segmented options={MODES} value={mode} onChange={(v) => { setMode(v); setPassword(''); }} />
          <Field label="メールアドレス">
            <Input value={mail} onChangeText={setMail} autoCapitalize="none" keyboardType="email-address"
              autoComplete="email" textContentType="username" placeholder="you@example.com" />
          </Field>
          <Field label="パスワード">
            <Input value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              textContentType={mode === 'signup' ? 'newPassword' : 'password'} />
          </Field>

          {mode === 'signup' ? (
            <>
              <Text style={{ color: t.tx3, fontSize: 13.5, lineHeight: 20 }}>{PW_RULE}</Text>
              <Button label="登録する" onPress={doSignUp}
                disabled={!mail.trim() || !pwOk(password) || !!busy} />
            </>
          ) : (
            <Button label="ログイン" onPress={doSignIn} disabled={!mail.trim() || !password || !!busy} />
          )}

          <Button label="Google で続ける" variant="ghost" onPress={doGoogle} disabled={!!busy} />

          <Text style={{ color: t.tx3, fontSize: 13.5, lineHeight: 20 }}>
            続けると
            <Text style={{ color: t.ac }} onPress={() => Linking.openURL('https://kurofukubo.com/terms.html')}>
              利用規約
            </Text>
            と
            <Text style={{ color: t.ac }} onPress={() => Linking.openURL('https://kurofukubo.com/privacy.html')}>
              プライバシーポリシー
            </Text>
            に同意したものとみなします。
          </Text>
        </Card>
      ) : bundle ? (
        <Card title="暗号化の解錠">
          <Text style={{ color: t.tx2, fontSize: 15, lineHeight: 22 }}>
            このアカウントは E2E 暗号化が有効です。パスフレーズは端末内でのみ使われ、送信されません。
          </Text>
          <Field label="パスフレーズ">
            <Input value={passphrase} onChangeText={setPassphrase} secureTextEntry autoCapitalize="none" />
          </Field>
          <Button label="解錠して取り込む" onPress={doUnlock} disabled={!passphrase || !!busy} />
        </Card>
      ) : (
        <Card title="ログイン済み">
          <Text style={{ color: t.tx, fontSize: 15 }}>{auth.email}</Text>
          <Button label="帳簿を取り込む" onPress={inspect} disabled={!!busy} />
          <Button label="ログアウト" variant="ghost" onPress={() => { auth.signOut(); setBundle(null); setCt(null); }} />
        </Card>
      )}

      {busy ? (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <ActivityIndicator color={t.ac} />
            <Text style={{ color: t.tx, fontSize: 15 }}>{busy}</Text>
          </View>
        </Card>
      ) : null}

      <Card title="アカウントについて">
        <Text style={{ color: t.tx2, fontSize: 14, lineHeight: 21 }}>
          アカウントが無くても、この端末だけで全機能を使えます。
          アカウントは帳簿を他の端末と共有し、端末を失っても残すためのものです。
        </Text>
      </Card>
    </Screen>
  );
}
