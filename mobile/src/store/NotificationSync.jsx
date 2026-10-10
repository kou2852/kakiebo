// 通知の予約を、帳簿・設定・アプリの状態に合わせて作り直す。見た目は持たない。
//
// 作り直すきっかけ: 記帳や同期で仕訳が変わったとき／カードや科目が変わったとき／設定を変えたとき／
// アプリを開いたとき。記帳できるのはこのアプリの中だけなので、「今日は記帳した」は必ずここで拾える。
// あわせて、通知をタップしたときの行き先（記帳・クレジット・ホーム・レポート）へ移動する。
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { usePathname, useRouter } from 'expo-router';
import { useOnboarding } from './OnboardingProvider';
import { useData } from './DataProvider';
import { askPermissionOnce, onSettingsChange, syncNotifications } from '../notifications';

const DEBOUNCE_MS = 1500;
// 通知から開いてよい行き先。通知の中身（data）を信用して任意の画面へ飛ばさない。
const ROUTES = new Set(['/', '/journal', '/credit', '/reports', '/manage/recurring']);

export default function NotificationSync() {
  const router = useRouter();
  const { journals, accounts, recurring, loading } = useData();
  const latest = useRef({ journals, accounts, recurring });
  // 予約のたびに最新の帳簿を読む。先に書いておく（下の効果より前に実行される）
  useEffect(() => { latest.current = { journals, accounts, recurring }; }, [journals, accounts, recurring]);
  const timer = useRef(null);

  const run = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      syncNotifications(latest.current).catch((e) => console.warn('[通知] 予約に失敗', e?.message || e));
    }, DEBOUNCE_MS);
  };

  // 通知の許可。新しく入れた人は、オンボーディングの最後のページで求める（Onboarding.jsx）。
  // ここは、そこで求められなかった人のため: オンボーディングを飛ばした人と、既存の利用者
  // （アップデート後の最初）に、ダッシュボードに着いたとき一度だけ求める。
  // 求めたかどうかは端末に残る（askPermissionOnce）ので、すでに求めた人には何も起きない。
  const path = usePathname();
  const onboarding = useOnboarding();
  const ready = !loading && !!onboarding?.decided && !onboarding?.active;
  const onDashboard = path === '/';
  useEffect(() => {
    if (!ready || !onDashboard) return undefined;
    const id = setTimeout(() => { askPermissionOnce(); }, 800); // 画面が見えてから出す
    return () => clearTimeout(id);
  }, [ready, onDashboard]);

  // 帳簿・科目・定期取引が変わったとき（読み込み中は、空の帳簿で予約を消さないよう待つ）
  useEffect(() => { if (!loading) run(); }, [journals, accounts, recurring, loading]);
  // 設定が変わったとき
  useEffect(() => onSettingsChange(run), []);
  // アプリを開いたとき（日付が変わっていれば、今日の分の判定も変わる）
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') run(); });
    return () => { sub.remove(); clearTimeout(timer.current); };
  }, []);

  // 通知をタップして開いたとき（起動前に届いたものも拾う）
  const response = Notifications.useLastNotificationResponse();
  const handled = useRef(null);
  useEffect(() => {
    const id = response?.notification?.request?.identifier;
    const route = response?.notification?.request?.content?.data?.route;
    if (!id || handled.current === id || !ROUTES.has(route)) return;
    handled.current = id;
    router.navigate(route);
  }, [response, router]);

  return null;
}
