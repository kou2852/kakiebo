// 記帳のリマインダー。毎日決まった時刻に1回だけ通知する。
// サーバーからのプッシュではなく端末内スケジュール（ローカル通知）なので、
// APNs の鍵設定も、家計データを外部へ出すことも不要。
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

const KEY = 'kk_reminder'; // '' なら無効、'HH:MM' なら有効
const ID = 'kk_daily_reminder';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldPlaySound: false, shouldSetBadge: false }),
});

export const getReminder = () => AsyncStorage.getItem(KEY);

/** 'HH:MM' で毎日通知。null で解除。許可が得られなければ false を返す。 */
export async function setReminder(hhmm) {
  await Notifications.cancelScheduledNotificationAsync(ID).catch(() => {});
  if (!hhmm) {
    await AsyncStorage.setItem(KEY, '');
    return true;
  }
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return false;

  const [hour, minute] = hhmm.split(':').map(Number);
  await Notifications.scheduleNotificationAsync({
    identifier: ID,
    content: { title: 'kurofukubo', body: '今日の記帳はお済みですか？' },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute },
  });
  await AsyncStorage.setItem(KEY, hhmm);
  return true;
}
