// 同期の状態と手動同期、アカウントの削除。
//
// 削除をこの画面に置いているのは、App Store の審査要件（5.1.1(v)）で
// 「アカウントを作れるアプリは、アプリ内から削除を開始できること」が求められ、
// かつ見つけにくい場所に隠すことも認められていないため。
// アカウントに関する操作はこの1画面に集めて、設定の先頭から辿れるようにしている。
import { useState } from 'react';
import { ActivityIndicator, Alert, Text, TouchableOpacity, View } from 'react-native';
import * as Updates from 'expo-updates';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/store/AuthProvider';
import { useData } from '../../src/store/DataProvider';
import { useTheme } from '../../src/theme';
import { Button, Card, Input, Screen } from '../../src/components/ui';
import { useSyncRefresh } from '../../src/store/useSyncRefresh';
import { resetAll } from '../../src/db';
import { forgetOnboarding } from '../../src/store/OnboardingProvider';
import { useTourTarget } from '../../src/store/TourProvider';

function Row({ label, value }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text style={{ color: t.tx2, fontSize: 15 }}>{label}</Text>
      <Text style={{ color: t.tx, fontSize: 15, fontWeight: '600' }}>{value}</Text>
    </View>
  );
}

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

export default function Sync() {
  const connectRef = useTourTarget('sync-connect');
  const t = useTheme();
  const router = useRouter();
  const auth = useAuth();
  const d = useData();

  const refresh = useSyncRefresh();
  const [deleting, setDeleting] = useState(false);
  // 削除の理由を聞いている途中か。押してすぐ確認のダイアログを出さず、先に理由の欄を開く
  const [asking, setAsking] = useState(false);
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

  // ログアウトしても端末の帳簿は消さない。アカウント無しでも使えるアプリなので、
  // 消すと「ログアウトしたらデータが無くなった」になる。
  // ただし暗号鍵は消す。鍵は kk_dek_<env> で利用者ごとに分かれておらず、
  // 残したまま別の人がログインすると、その人の暗号文を前の人の鍵で開こうとして失敗する。
  const signOutNow = async () => { await d.forgetDek(); await auth.signOut(); };

  const SIGN_OUT_BODY = 'この端末に保存した帳簿はそのまま残ります。もう一度ログインすれば同期を再開できます。'
    + '\n\n暗号化を使っている場合、この端末に預けた鍵は消えます。次回はパスフレーズの入力が要ります。';

  const confirmSignOut = () => {
    // ⚠ 未送信のまま出ると、次に別のアカウントで入ったとき送り先が変わる。
    //   勝手に捨てず、送るかどうかを選ばせる。破棄の選択肢は置かない
    //   （残しても困らない。次の接続時に突き合わせで扱われる）。
    if (d.pendingCount) {
      Alert.alert('未送信の変更があります',
        `まだサーバーへ送っていない変更が ${d.pendingCount} 件あります。\n`
        + '送らずにログアウトしても端末には残りますが、次に別のアカウントで'
        + 'ログインすると、その帳簿と突き合わせることになります。',
        [
          { text: 'キャンセル', style: 'cancel' },
          {
            text: '送らずにログアウト',
            style: 'destructive',
            onPress: () => Alert.alert('ログアウトしますか？', SIGN_OUT_BODY, [
              { text: 'キャンセル', style: 'cancel' },
              { text: 'ログアウト', style: 'destructive', onPress: signOutNow },
            ]),
          },
          {
            text: '送ってからログアウト',
            onPress: async () => {
              try { await d.sync(); } catch (e) {
                Alert.alert('送れませんでした', (e?.message || String(e)));
                return;
              }
              await signOutNow();
            },
          },
        ]);
      return;
    }
    Alert.alert('ログアウトしますか？', SIGN_OUT_BODY, [
      { text: 'キャンセル', style: 'cancel' },
      { text: 'ログアウト', style: 'destructive', onPress: signOutNow },
    ]);
  };
  return (
    <Screen refresh={refresh}>
      <Card title="接続">
        <Row label="ログイン" value={auth.email || '未ログイン'} />
        {d.unlocked ? <Row label="暗号化" value="解錠済み（この端末に鍵を保持）" /> : null}
        <View ref={connectRef} collapsable={false}>
          <Button
            label={auth.signedIn ? 'サーバーの帳簿と突き合わせる' : 'アカウントに接続'}
            onPress={() => router.push('/connect')}
          />
        </View>
        {/* ログアウトは connect 画面の奥にもあるが、接続済みの人がそこを開く動機がなく、
            事実上たどり着けなかった。ログアウトは審査でも必ず試される操作なので、
            この画面に直接置く。 */}
        {auth.signedIn ? (
          <Button label="ログアウト" variant="ghost" onPress={confirmSignOut} />
        ) : null}
      </Card>

      <Card title="同期">
        {/* 未ログイン時は送り先が無いので「未送信」という言い方をしない。
            キューは残す（初回ログイン時に送るために要る）。表示だけ抑える。 */}
        {auth.signedIn
          ? <Row label="未送信の変更" value={`${d.pendingCount} 件`} />
          : <Row label="同期" value="アカウント未接続" />}
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
          ) : asking ? (
            <View style={{ gap: 10 }}>
              <Text style={{ color: t.tx, fontSize: 15, fontWeight: '600' }}>よろしければ、削除の理由を教えてください（任意・複数可）</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {REASONS.map((x) => {
                  const on = reasons.includes(x);
                  return (
                    <TouchableOpacity key={x} onPress={() => toggleReason(x)} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
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
                maxLength={400} style={{ minHeight: 80, textAlignVertical: 'top', fontSize: 15 }} />
              <Button label="削除に進む" variant="danger" onPress={confirmDelete} />
              <Button label="やめる" variant="ghost" onPress={() => { setAsking(false); setReasons([]); setNote(''); }} />
            </View>
          ) : (
            <Button label="アカウントを削除" variant="danger" onPress={() => setAsking(true)} />
          )}
        </Card>
      ) : null}
    </Screen>
  );
}
