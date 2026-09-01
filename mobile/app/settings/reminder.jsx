// 記帳リマインダー。端末内のローカル通知で、サーバーは介さない。
import { useEffect, useState } from 'react';
import { Alert, Text } from 'react-native';
import { useTheme } from '../../src/theme';
import { Card, ChipRow, Screen } from '../../src/components/ui';
import { getReminder, setReminder } from '../../src/notifications';

// 任意入力にすると打ち間違いで通知が来なくなるので選択式にする。
const TIMES = ['20:00', '21:00', '22:00'];

export default function Reminder() {
  const t = useTheme();
  const [time, setTime] = useState('');

  useEffect(() => {
    let cancelled = false;
    getReminder().then((v) => { if (!cancelled) setTime(v || ''); });
    return () => { cancelled = true; };
  }, []);

  const choose = async (v) => {
    const next = v === time ? '' : v;
    if (!(await setReminder(next || null))) {
      Alert.alert('通知が許可されていません', 'iOS の設定 → 通知 から kurofukubo の通知を許可してください。');
      return;
    }
    setTime(next);
  };

  return (
    <Screen>
      <Card title="毎日のリマインダー">
        <ChipRow options={TIMES.map((v) => ({ value: v, label: v }))} value={time} onChange={choose} />
        <Text style={{ color: t.tx3, fontSize: 12.5, lineHeight: 18 }}>
          {time ? `毎日 ${time} に通知します。もう一度押すと解除します。` : '設定されていません。'}
          {'\n'}端末内で予約する通知です。家計データが外部に出ることはありません。
        </Text>
      </Card>
    </Screen>
  );
}
