// kurofukubo のアカウントを作る / 既存のアカウントに繋いで、サーバー上の帳簿を取り込む。
//
// アカウントが無くてもアプリは全機能が使える（帳簿は端末内で完結する）。
// アカウントは端末を跨いで持ち歩くためのもので、登録を必須にはしない。
import { useState } from 'react';
import { ActivityIndicator, Alert, Linking, Text, TouchableOpacity, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/store/AuthProvider';
import { useData } from '../src/store/DataProvider';
import { useTheme, useThemeMode } from '../src/theme';
import { Button, Card, Field, Input, Screen, Segmented } from '../src/components/ui';
import { probe, pullEncrypted, pullPlain, unlockWith } from '../src/store/pull';
import { COLLECTIONS, codeCollisions, diffSummary, hasContent, mergeDatasets } from '../src/store/merge';
import { replace, upsert } from '../src/db/intents';
import { clearAllPending, readLocal } from '../src/db';
import { emptyDataset } from '../src/db/defaults';
import { authMessage } from '../src/auth/cognito';

// 規約・ポリシーはアプリ内ブラウザで開く。
//
// ⚠ Linking.openURL だと Safari に飛ばされ、どのアプリから来たのか分からなくなる。
//   openBrowserAsync なら配色を合わせた画面がアプリの上に重なり、閉じれば戻る。
const openInApp = (url, t) => WebBrowser.openBrowserAsync(url, {
  toolbarColor: t.bg1,
  controlsColor: t.ac,
  presentationStyle: 'pageSheet',
}).catch(() => Linking.openURL(url)); // 端末に対応ブラウザが無い場合の逃げ道

const MODES = [{ value: 'signin', label: 'ログイン' }, { value: 'signup', label: '新規登録' }];

// Cognito 側の設定と揃える（backend/template.yaml の PasswordPolicy）。
// 画面に出しておかないと、登録を押してから弾かれて理由が分からない。
const PW_RULE = '8文字以上。英小文字と数字を含めてください。';
const pwOk = (v) => v.length >= 8 && /[a-z]/.test(v) && /[0-9]/.test(v);

/**
 * Sign in with Apple のボタン。
 *
 * ⚠ 見た目を勝手に変えないこと。Apple のデザイン規定で、地色は黒・白・白+枠線の
 * いずれか、ロゴと文言はセットで出す、と決まっている。ここでは明るい配色のとき黒地、
 * 暗い配色のとき白地にしている。
 *
 * ⚠ 他のログイン手段より目立たなくしてはいけない（規定）。Google が枠線ボタンなので、
 * こちらは塗りつぶしにして上に置いてある。順番も入れ替えないこと。
 */
function AppleButton({ onPress, disabled }) {
  const { resolved } = useThemeMode();
  const dark = resolved === 'dark';
  const fg = dark ? '#000000' : '#ffffff';
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel="Appleで続ける"
      style={{
        backgroundColor: dark ? '#ffffff' : '#000000',
        opacity: disabled ? 0.4 : 1,
        borderRadius: 12, paddingVertical: 12, paddingHorizontal: 18,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      }}
    >
      <Ionicons name="logo-apple" size={19} color={fg} style={{ marginTop: -2 }} />
      <Text style={{ color: fg, fontWeight: '700', fontSize: 16 }}>Appleで続ける</Text>
    </TouchableOpacity>
  );
}

export default function Connect() {
  const t = useTheme();
  const router = useRouter();
  const auth = useAuth();
  const d = useData();
  const { pendingCount, replaceAll, rememberDek } = d;

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

  const doApple = async () => {
    setBusy('Apple に接続中…');
    try {
      await auth.signInWithApple();
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
      else await reconcile(await pullPlain());
    } catch (e) { fail(e); } finally { setBusy(null); }
  };

  /**
   * サーバーと端末の帳簿を突き合わせて繋ぐ。
   *
   * ⚠ 以前はここが無条件の取り込み（replaceAll）だった。新規アカウントでも
   *   サーバーの空の帳簿で端末を上書きするため、ゲストで記帳した人が
   *   Apple / Google でアカウントを作ると帳簿が消えていた。
   *
   * 端末に中身があるかは、データだけでなく未送信キューの有無も見る。
   * 既定科目の名前を変えただけの端末を「空」と誤判定しないため。
   */
  const reconcile = async (server, dek) => {
    const local = (await readLocal())?.dataset || emptyDataset();
    const localHas = hasContent(local) || pendingCount > 0;
    const serverHas = hasContent(server);

    // どちらも初期状態。取り込むものも送るものも無いので、黙って終わる。
    if (!localHas && !serverHas) { router.back(); return; }

    // 端末が初期状態なら、取り込んでも失うものが無い。
    if (!localHas) {
      await replaceAll(server);
      Alert.alert('取り込みました',
        `仕訳 ${server.journals.length.toLocaleString('ja-JP')} 件 / 勘定科目 ${server.accounts.length} 件`,
        [{ text: 'OK', onPress: () => router.back() }]);
      return;
    }

    // サーバーが空なら、端末の帳簿を送る。未送信キューを流すだけで済む。
    if (!serverHas) { await pushLocal(dek, server, local); return; }

    // 両方に中身があっても、差分が無いなら聞くことが無い。
    // ⚠ 実機で、取り込み直後に入り直すと 0件/0件/0件 の選択を迫られた。
    //   「合わせるか選べ」と言いながら合わせる対象が無い、という無意味な問い合わせになる。
    const diff = diffSummary(server, local);
    if (!diff.onlyLocal && !diff.onlyServer && !diff.conflict) { router.back(); return; }

    // 両方に中身があり、実際に食い違っている。どちらを正とするかは利用者が決める。
    askPrefer(server, local, dek);
  };

  /**
   * 合わせ終わったあとの案内。
   *
   * 科目は id で突き合わせるので、id が違えば両方残る。その結果「別の科目なのに
   * コードが同じ」が生まれる。コードは並び順と体系の根拠なので、放っておくと
   * どちらがどれか読めない。消さずに、直す場所へ案内する。
   */
  const doneWith = (title, body, server, local) => {
    const dup = server && local ? codeCollisions(mergeDatasets(server, local, 'local'), server, local) : [];
    if (!dup.length) {
      Alert.alert(title, body, [{ text: 'OK', onPress: () => router.back() }]);
      return;
    }
    Alert.alert(title,
      `${body}\n\n別の科目に同じ勘定科目コードが付きました（${dup.length} 件）。`
      + 'どちらも消えていません。コードをずらすか名前を直して区別できます。',
      [
        { text: 'あとで', style: 'cancel', onPress: () => router.back() },
        { text: 'いま直す', onPress: () => router.replace('/resolve-codes') },
      ]);
  };

  /**
   * サーバーに無いものを意図として積む。積み終わるまで待つ。
   *
   * ⚠ 未送信キューが空のまま sync を呼んではいけない。pushPlain は意図が無いと
   *   何も送らず、最後に exportAll の結果（＝サーバーの内容）を返す。DataProvider は
   *   それで端末を上書きするので、サーバーが空なら端末の帳簿が消える。
   *   「取り込みを置換にしない」修正を入れた後も、この分岐に同じ事故が残っていた。
   */
  const queueMissing = async (server, local) => {
    // ⚠ 予算とタグ配分は id を持たない。applyIntent の upsert は x.id === item.id で
    //   突き合わせるので、id 無しだと undefined === undefined が真になり1件目を
    //   上書きし続ける（＝件数が壊れる）。これらは replace（全置換）で積む。
    //   実際、5件の予算が壊れた状態でサーバーへ送られ、SK が重複して 502 になった。
    const NO_ID = ['budgets', 'allocs'];
    const intents = [];
    for (const c of COLLECTIONS) {
      const ids = new Set((server[c] || []).map((x) => x.id));
      const missing = (local[c] || []).filter((item) => !ids.has(item.id));
      if (!missing.length) continue;
      if (NO_ID.includes(c)) intents.push(replace(c, local[c] || []));
      else for (const item of missing) intents.push(upsert(c, item));
    }
    await d.commitAll(intents);
  };

  const pushLocal = async (dek, server, local) => {
    setBusy('保存中…');
    try {
      await queueMissing(server, local);
      await d.sync(dek);
      doneWith('保存しました', 'この端末の帳簿をサーバーに保存しました。他の端末からも見られます。', server, local);
    } catch (e) { fail(e); } finally { setBusy(null); }
  };

  const askPrefer = (server, local, dek) => {
    const { onlyLocal, onlyServer, conflict } = diffSummary(server, local);
    Alert.alert('両方に帳簿があります',
      `この端末だけにある: ${onlyLocal} 件
サーバーだけにある: ${onlyServer} 件
`
      + `両方にあって内容が違う: ${conflict} 件

`
      + '合わせると、片方にしか無いものは必ず残ります。'
      + '内容が違うものだけ、どちらを採るか選んでください。',
      [
        { text: 'キャンセル', style: 'cancel' },
        { text: 'この端末を正にする', onPress: () => pushLocal(dek, server, local) },
        { text: 'サーバーを正にする', onPress: () => takeServer(server, local, dek) },
      ]);
  };

  /**
   * サーバーを正にして合わせる。
   *
   * 端末にしか無いものは積み直して送るので消えない。消えるのは「両方にあって
   * 内容が違うもの」の端末側だけで、それは利用者が選んだ結果である。
   */
  const takeServer = async (server, local, dek) => {
    setBusy('合わせています…');
    try {
      await clearAllPending();          // 選ばれた破棄。自動では絶対に呼ばない
      await replaceAll(mergeDatasets(server, local, 'server'));
      // ⚠ save は積み終わりを待てない。待たずに sync すると、積む前に同期が終わって
      //   端末だけにあった分が消える。commitAll で積み終わってから送る。
      await queueMissing(server, local);
      await d.sync(dek);
      doneWith('合わせました', 'サーバーの内容を正として、この端末だけにあったものを足しました。', server, local);
    } catch (e) { fail(e); } finally { setBusy(null); }
  };

  const doUnlock = async () => {
    setBusy('解錠中…');
    try {
      const dek = await unlockWith(bundle, passphrase);
      await rememberDek(dek); // 次回からパスフレーズ入力を省く（鍵は端末の Keychain のみ）
      setPassphrase('');
      await reconcile(pullEncrypted(dek, ct), dek);
    } catch {
      // AES-GCM の認証が失敗した＝鍵が違う。原因を取り違えないよう文言を分ける。
      Alert.alert('解錠できません', 'パスフレーズが違います');
    } finally { setBusy(null); }
  };

  if (auth.booting) return <Screen><ActivityIndicator color={t.ac} /></Screen>;

  return (
    <Screen>

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

          <AppleButton onPress={doApple} disabled={!!busy} />
          <Button label="Google で続ける" variant="ghost" onPress={doGoogle} disabled={!!busy} />

          <Text style={{ color: t.tx3, fontSize: 13.5, lineHeight: 20 }}>
            続けると
            <Text style={{ color: t.ac }} onPress={() => openInApp('https://kurofukubo.com/terms.html', t)}>
              利用規約
            </Text>
            と
            <Text style={{ color: t.ac }} onPress={() => openInApp('https://kurofukubo.com/privacy.html', t)}>
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
          {/* ⚠ 解錠待ち（bundle あり）のときは出さない。押すと probe からやり直しになり、
              解錠しないまま突き合わせへ進む経路ができる。 */}
          {bundle ? null : (
            <Button label="サーバーの帳簿と突き合わせる" onPress={inspect} disabled={!!busy} />
          )}
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
