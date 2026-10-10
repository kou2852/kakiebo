// 通知の設定。端末内のローカル通知で、サーバーは介さない。
// カードの引き落とし・定期取引・レポート（月次・週次）・記帳のリマインダーを1画面にまとめる。
// 何をいつ送るかは src/utils/notifyPlan.js。通知の文面に金額は入らない。
//
// 初期値は、カードの引き落とし=3日前だけオン／定期取引=3日前だけオン／月次レポート=オン／
// 週次レポート・記帳のリマインダー・「当日」の通知=オフ。ただし通知の許可が得られるまでは何も送られない。
// 許可は、アプリを初めて開いたとき（既存の利用者はアップデート後の最初）に求める。
// 拒否した人・あとから許可したい人は、この画面の「通知を許可する」から。
import { useEffect, useState } from 'react';
import { Alert, Linking, Platform, Switch, Text, View } from 'react-native';
import { useTheme } from '../../src/theme';
import { Button, Card, ChipRow, Screen } from '../../src/components/ui';
import { useData } from '../../src/store/DataProvider';
import { isCreditCard } from '../../src/utils/creditCard';
import { DEFAULT_SETTINGS } from '../../src/utils/notifyPlan';
import { ensurePermission, getNotifySettings, notificationsGranted, saveNotifySettings } from '../../src/notifications';

// 任意入力にすると打ち間違いで通知が来なくなるので選択式にする。
const TIMES = ['20:00', '21:00', '22:00'];

export default function Notifications() {
  const t = useTheme();
  const { accounts } = useData();
  const [s, setS] = useState(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [granted, setGranted] = useState(true); // 確かめるまでは案内を出さない

  useEffect(() => {
    let cancelled = false;
    getNotifySettings().then((v) => { if (!cancelled) { setS(v); setLoaded(true); } });
    notificationsGranted().then((v) => { if (!cancelled) setGranted(v); });
    return () => { cancelled = true; };
  }, []);

  const settingsHint = (Platform.OS === 'ios' ? 'iOS の設定 → 通知' : '端末の設定 → アプリ → kurofukubo → 通知') + ' から kurofukubo の通知を許可してください。';

  // 許可を求める。許可されたら、いまの設定で予約を作り直す。
  const allow = async () => {
    if (await ensurePermission()) {
      setGranted(true);
      await saveNotifySettings(s);
    } else {
      Alert.alert('通知が許可されていません', settingsHint, [
        { text: '閉じる', style: 'cancel' },
        { text: '設定を開く', onPress: () => Linking.openSettings().catch(() => {}) },
      ]);
    }
  };

  const update = async (patch, turningOn) => {
    // 通知をオンにする操作のとき、許可が無ければここで求める
    if (turningOn && !granted && !(await ensurePermission())) {
      Alert.alert('通知が許可されていません', settingsHint);
      return;
    }
    if (turningOn) setGranted(true);
    const next = { ...s, ...patch };
    setS(next);
    await saveNotifySettings(next);
  };

  const cards = accounts.filter((a) => isCreditCard(a) && !a.hidden);
  const note = { color: t.tx3, fontSize: 13.5, lineHeight: 20 };
  const row = { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 };
  const label = { color: t.tx, fontSize: 15.5, flex: 1 };
  const sw = (key, turnOn = true) => (
    <Switch value={!!s[key]} trackColor={{ true: t.ac }} disabled={!loaded}
      onValueChange={(v) => update({ [key]: v }, turnOn && v)} />
  );

  return (
    <Screen>
      {!granted ? (
        <Card title="通知はまだ許可されていません">
          <Text style={note}>下の設定は、通知を許可すると働きはじめます。それまでは何も送られません。</Text>
          <Button label="通知を許可する" onPress={allow} />
        </Card>
      ) : null}

      <Card title="カードの引き落とし">
        <View style={row}><Text style={label}>引き落とし日の3日前</Text>{sw('cardBefore')}</View>
        <View style={row}><Text style={label}>引き落とし日の当日</Text>{sw('cardDay')}</View>
        {(s.cardBefore || s.cardDay) && cards.length ? (
          <>
            <Text style={{ color: t.tx2, fontSize: 13.5, fontWeight: '700', marginTop: 4 }}>通知するカード</Text>
            {cards.map((c) => (
              <View key={c.id} style={row}>
                <Text style={{ color: t.tx2, fontSize: 15, flex: 1 }}>{c.name}</Text>
                <Switch value={!s.cardOff?.[c.id]} trackColor={{ true: t.ac }}
                  onValueChange={(v) => update({ cardOff: { ...s.cardOff, [c.id]: !v } }, false)} />
              </View>
            ))}
          </>
        ) : null}
        {(s.cardBefore || s.cardDay) && !cards.length ? (
          <Text style={note}>引き落としの設定があるカードがありません。「口座・カード」でカードを追加し、締め日・引落日・引落口座を入れてください。</Text>
        ) : null}
        <Text style={note}>
          朝9時に「○○の引き落とし日（10/27）の3日前です。」のようにお知らせします。同じ日に引き落とされるカードが複数あれば、1通にまとめます。金額は書きません。
        </Text>
      </Card>

      <Card title="定期取引">
        <View style={row}><Text style={label}>予定日の3日前</Text>{sw('recBefore')}</View>
        <View style={row}><Text style={label}>予定日の当日</Text>{sw('recDay')}</View>
        <Text style={note}>
          朝9時に「家賃の予定日（10/27）の3日前です。」のようにお知らせします。同じ日に予定が複数あれば、1通にまとめます。金額は書きません。記帳は自動では行いません。
        </Text>
      </Card>

      <Card title="レポート">
        <View style={row}><Text style={label}>月次（毎月1日の朝）</Text>{sw('monthly')}</View>
        <View style={row}><Text style={label}>週次（日曜の夜）</Text>{sw('weekly')}</View>
        <Text style={note}>
          金額は書かず、「先月の純資産と収支を確認できます。」のようにお知らせします。押すとレポート（週次はホーム）が開きます。
        </Text>
      </Card>

      <Card title="記帳のリマインダー">
        <ChipRow
          options={TIMES.map((v) => ({ value: v, label: v }))} value={s.reminder}
          onChange={(v) => update({ reminder: v === s.reminder ? '' : v }, !!v && v !== s.reminder)}
        />
        <Text style={note}>
          {s.reminder
            ? `毎日 ${s.reminder} に、その日にまだ記帳がないときだけ通知します。もう一度押すと解除します。`
            : '時刻を選ぶと、その日にまだ記帳がないときだけ通知します。初期値はオフです。'}
        </Text>
      </Card>

      <Text style={{ color: t.tx3, fontSize: 13, lineHeight: 19, textAlign: 'center' }}>
        端末内で予約する通知です。家計データが外部に出ることはありません。{'\n'}
        通知の文面に金額は入りません。
      </Text>
    </Screen>
  );
}
