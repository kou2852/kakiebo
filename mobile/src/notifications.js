// 通知。サーバーからのプッシュではなく端末内スケジュール（ローカル通知）なので、
// APNs の鍵設定も、家計データを外部へ出すことも不要。
//
// 何をいつ送るかは utils/notifyPlan.js が決める（記帳漏れ・カード引き落とし・定期取引・週次・月次）。
// ここは、設定の保存と、決まった計画を端末へ予約し直す部分だけを持つ。
// 予約は「先の数日〜数週間分の1回きり」なので、帳簿・設定・カードが変わるたびに作り直す
// （NotificationSync が見ている）。
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { DEFAULT_SETTINGS, ID_PREFIX, anyOn, planNotifications } from './utils/notifyPlan';

const KEY = 'kk_notify';        // 通知の設定（JSON）
const LEGACY_KEY = 'kk_reminder'; // 旧: 毎日の時刻だけ ('' なら無効、'HH:MM' なら有効)
const CHANNEL = 'default';
const ASKED_KEY = 'kk_notify_asked'; // 許可を求めたか（一度だけ）

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldPlaySound: false, shouldSetBadge: false }),
});

// 設定が変わったことを NotificationSync へ知らせる
const listeners = new Set();
export const onSettingsChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

/** 保存した設定。旧版のリマインダーの時刻は引き継ぐ。 */
export async function getNotifySettings() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    const legacy = await AsyncStorage.getItem(LEGACY_KEY);
    return { ...DEFAULT_SETTINGS, reminder: legacy || '' };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveNotifySettings(next) {
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
  listeners.forEach((fn) => fn(next));
}

/** 通知の許可を求める。得られなければ false。 */
export async function ensurePermission() {
  const cur = await Notifications.getPermissionsAsync();
  if (cur.granted) return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

/** いま通知が許可されているか */
export async function notificationsGranted() {
  const cur = await Notifications.getPermissionsAsync().catch(() => null);
  return !!cur?.granted;
}

/**
 * 通知の許可を求める。アプリを初めて開いたとき（既存の利用者は、アップデート後に初めて開いたとき）に一度だけ。
 * すでに許可済み・拒否済み（OS が二度目を出さない）・一度求めた後は何もしない。許可されたら予約を作り直す。
 * 「一度求めたか」は端末に残す。拒否されても毎回は聞かない（設定の「通知」画面から後で許可できる）。
 */
export async function askPermissionOnce() {
  try {
    const cur = await Notifications.getPermissionsAsync();
    if (cur.granted || !cur.canAskAgain) return;
    if (await AsyncStorage.getItem(ASKED_KEY)) return;
    await AsyncStorage.setItem(ASKED_KEY, '1');
    if (await ensurePermission()) listeners.forEach((fn) => fn());
  } catch { /* 求められなくても、アプリの動作には影響しない */ }
}

async function ensureChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL, {
    name: 'お知らせ', importance: Notifications.AndroidImportance.DEFAULT,
  }).catch(() => {});
}

/** このアプリが予約した通知（ID が kk_ で始まるもの）を全部消す */
async function cancelOurs() {
  const all = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
  await Promise.all(all
    .filter((n) => String(n.identifier).startsWith(ID_PREFIX))
    .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {})));
}

/**
 * 帳簿と設定から計画を作り、予約し直す。
 * 許可が無いときは予約しない。
 */
export async function syncNotifications({ journals, accounts, recurring }) {
  const settings = await getNotifySettings();
  await cancelOurs();
  if (!anyOn(settings)) return 0;
  const perm = await Notifications.getPermissionsAsync().catch(() => null);
  if (!perm?.granted) return 0;
  await ensureChannel();
  const plan = planNotifications({ settings, journals, accounts, recurring });
  for (const n of plan) {
    await Notifications.scheduleNotificationAsync({
      identifier: n.id,
      content: { title: n.title, body: n.body, data: { route: n.route } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: n.when, channelId: CHANNEL },
    }).catch(() => {});
  }
  return plan.length;
}
