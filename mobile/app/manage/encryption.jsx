// E2E暗号化の管理。有効化・パスフレーズ変更・リカバリーキー再発行・解除。
//
// 鍵もパスフレーズもサーバーへ送らない。有効化すると、以後この帳簿は
// パスフレーズ（またはリカバリーキー）を知っている人以外、運営を含めて誰も読めなくなる。
// 失えば復旧手段は無い。だからリカバリーキーの控えを強く促す。
import { useCallback, useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useAuth } from '../../src/store/AuthProvider';
import { useData } from '../../src/store/DataProvider';
import { useTheme } from '../../src/theme';
import { Button, Card, Field, Input, Screen } from '../../src/components/ui';
import * as api from '../../src/api/client';
import { changePassphrase, regenerateRecovery, seal, setupEncryption } from '../../src/crypto';

export default function Encryption() {
  const t = useTheme();
  const auth = useAuth();
  const d = useData();

  const [state, setState] = useState(null); // { enabled, bundle, ct, rev }
  const [busy, setBusy] = useState(null);
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [recoveryKey, setRecoveryKey] = useState(null); // 発行直後だけ画面に出す

  const refresh = useCallback(async () => {
    try {
      const ed = await api.encdata.get();
      setState({ enabled: !!(ed && ed.bundle), bundle: ed?.bundle, ct: ed?.ct, rev: ed?.rev || 0 });
    } catch {
      setState({ enabled: false }); // 未接続や通信断。暗号化なしとして扱う。
    }
  }, []);

  useEffect(() => {
    if (!auth.signedIn) return;
    let cancelled = false;
    api.encdata.get()
      .then((ed) => { if (!cancelled) setState({ enabled: !!(ed && ed.bundle), bundle: ed?.bundle, ct: ed?.ct, rev: ed?.rev || 0 }); })
      .catch(() => { if (!cancelled) setState({ enabled: false }); });
    return () => { cancelled = true; };
  }, [auth.signedIn]);

  const fail = (e) => Alert.alert('失敗しました', e?.message || String(e));

  const enable = async () => {
    if (pass.length < 8) return Alert.alert('短すぎます', 'パスフレーズは8文字以上にしてください。');
    if (pass !== pass2) return Alert.alert('一致しません', '確認用と同じものを入力してください。');
    setBusy('暗号化を有効にしています…');
    try {
      const { dek, recoveryKey: rk, bundle } = await setupEncryption(pass);
      const dataset = {
        accounts: d.accounts, journals: d.journals, tags: d.tags, allocs: d.allocs,
        wallets: d.wallets, presets: d.presets, budgets: d.budgets, recurring: d.recurring, rules: d.rules,
      };
      // clearPlaintext: サーバー上の平文データを消す。これをしないと暗号化の意味がない。
      await api.encdata.save({ bundle, ct: seal(dek, dataset), clearPlaintext: true, rev: state.rev });
      await d.rememberDek(dek);
      setPass(''); setPass2('');
      setRecoveryKey(rk);
      await refresh();
    } catch (e) { fail(e); } finally { setBusy(null); }
  };

  const changePass = async () => {
    if (!d.unlocked) return Alert.alert('解錠が必要です', '先に「アカウント接続」から解錠してください。');
    if (pass.length < 8) return Alert.alert('短すぎます', 'パスフレーズは8文字以上にしてください。');
    if (pass !== pass2) return Alert.alert('一致しません', '確認用と同じものを入力してください。');
    setBusy('パスフレーズを変更しています…');
    try {
      const ed = await api.encdata.get();
      const bundle = await changePassphrase(d.dek, pass, ed.bundle);
      await api.encdata.save({ bundle, ct: ed.ct, rev: ed.rev || 0 });
      setPass(''); setPass2('');
      Alert.alert('変更しました', '次回の解錠から新しいパスフレーズを使ってください。');
      await refresh();
    } catch (e) { fail(e); } finally { setBusy(null); }
  };

  const regen = async () => {
    if (!d.unlocked) return Alert.alert('解錠が必要です', '先に「アカウント接続」から解錠してください。');
    setBusy('リカバリーキーを再発行しています…');
    try {
      const rec = await regenerateRecovery(d.dek);
      const ed = await api.encdata.get();
      const { recoveryKey: rk, ...fields } = rec;
      await api.encdata.save({ bundle: { ...ed.bundle, ...fields }, ct: ed.ct, rev: ed.rev || 0 });
      setRecoveryKey(rk);
      await refresh();
    } catch (e) { fail(e); } finally { setBusy(null); }
  };

  const disable = () => {
    if (!d.unlocked) return Alert.alert('解錠が必要です', '先に「アカウント接続」から解錠してください。');
    Alert.alert(
      '暗号化を解除しますか？',
      '解除すると、この帳簿はサーバー上で平文になります。運営が内容を読める状態に戻ります。',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '解除',
          style: 'destructive',
          onPress: async () => {
            setBusy('解除しています…');
            try {
              const dataset = {
                accounts: d.accounts, journals: d.journals, tags: d.tags, allocs: d.allocs,
                wallets: d.wallets, presets: d.presets, budgets: d.budgets, recurring: d.recurring, rules: d.rules,
              };
              // 平文へ戻してから暗号ブロブを消す。順序を逆にすると復元できなくなる。
              await api.data.importAll(dataset);
              const ed = await api.encdata.get();
              await api.encdata.save({ bundle: null, ct: null, rev: ed?.rev || 0 });
              await d.forgetDek();
              await refresh();
              Alert.alert('解除しました');
            } catch (e) { fail(e); } finally { setBusy(null); }
          },
        },
      ]
    );
  };

  if (!auth.signedIn) {
    return <Screen><Card><Text style={{ color: t.tx2, fontSize: 15 }}>先にアカウントへ接続してください。</Text></Card></Screen>;
  }
  if (!state) return <Screen><Card><Text style={{ color: t.tx3, fontSize: 15 }}>確認中…</Text></Card></Screen>;

  // 発行直後のリカバリーキーはこの一度しか表示しない（サーバーにも平文では残らない）。
  if (recoveryKey) {
    return (
      <Screen>
        <Card title="リカバリーキー">
          <Text style={{ color: t.red, fontSize: 15, lineHeight: 22 }}>
            この画面を離れると二度と表示できません。いま控えてください。
            パスフレーズを忘れた場合、これが唯一の復旧手段です。
          </Text>
          <Text selectable style={{ color: t.tx, fontSize: 18, fontWeight: '700', letterSpacing: 1, paddingVertical: 10 }}>
            {recoveryKey}
          </Text>
          <Button label="コピーする" onPress={() => Clipboard.setStringAsync(recoveryKey)} />
          <Button label="控えました" variant="ghost" onPress={() => setRecoveryKey(null)} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <Card title="状態">
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ color: t.tx2, fontSize: 15 }}>暗号化</Text>
          <Text style={{ color: state.enabled ? t.grn : t.tx3, fontSize: 15, fontWeight: '700' }}>
            {state.enabled ? '有効' : '無効'}
          </Text>
        </View>
        {state.enabled ? (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ color: t.tx2, fontSize: 15 }}>この端末</Text>
            <Text style={{ color: d.unlocked ? t.grn : t.red, fontSize: 15, fontWeight: '700' }}>
              {d.unlocked ? '解錠済み' : '未解錠'}
            </Text>
          </View>
        ) : null}
        <Text style={{ color: t.tx3, fontSize: 13, lineHeight: 20 }}>
          有効にすると、家計データは端末内で暗号化してから送られます。パスフレーズも鍵もサーバーへは送りません。
          失うと運営でも復旧できません。
        </Text>
      </Card>

      {busy ? <Card><Text style={{ color: t.ac, fontSize: 15 }}>{busy}</Text></Card> : null}

      {!state.enabled ? (
        <Card title="暗号化を有効にする">
          <Field label="パスフレーズ（8文字以上）">
            <Input value={pass} onChangeText={setPass} secureTextEntry autoCapitalize="none" />
          </Field>
          <Field label="確認のためもう一度">
            <Input value={pass2} onChangeText={setPass2} secureTextEntry autoCapitalize="none" />
          </Field>
          <Button label="有効にする" onPress={enable} disabled={!!busy || !pass || !pass2} />
        </Card>
      ) : (
        <>
          <Card title="パスフレーズを変更">
            <Field label="新しいパスフレーズ（8文字以上）">
              <Input value={pass} onChangeText={setPass} secureTextEntry autoCapitalize="none" />
            </Field>
            <Field label="確認のためもう一度">
              <Input value={pass2} onChangeText={setPass2} secureTextEntry autoCapitalize="none" />
            </Field>
            <Button label="変更する" onPress={changePass} disabled={!!busy || !pass || !pass2} />
          </Card>

          <Card title="リカバリーキー">
            <Text style={{ color: t.tx2, fontSize: 14, lineHeight: 21 }}>
              控えを失くした場合は再発行できます。再発行すると古いキーは使えなくなります。
            </Text>
            <Button label="再発行する" variant="ghost" onPress={regen} disabled={!!busy} />
          </Card>

          <Button label="暗号化を解除する" variant="ghost" onPress={disable} disabled={!!busy} />
        </>
      )}
    </Screen>
  );
}
