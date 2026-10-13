// ストアに新しい版が出ていたら「アップデート」を勧める。強制はしない（「あとで」で閉じて使い続けられる）。
//
// 最新版の番号は、ベルの記事と同じ updates.json の latest から取る（frontend/src/config/release.js の APP_LATEST）。
// 出すのはダッシュボードに着いたときだけ。オンボーディング中・ツアー中は出さない。
// AppLock の内側に置くこと（外に置くとロック画面の上に出る）。
// 「あとで」を押した版は7日間出さない（utils/updatePrompt.js）。1回の起動では1度まで。
import { useEffect, useRef, useState } from 'react';
import { Linking, Modal, Platform, Pressable, Text, TouchableOpacity } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePathname } from 'expo-router';
import { useTheme } from '../theme';
import { useData } from '../store/DataProvider';
import { useOnboarding } from '../store/OnboardingProvider';
import { useTour } from '../store/TourProvider';
import { appVersion, useUpdates } from '../updates';
import { shouldPromptUpdate } from '../utils/updatePrompt';

const SNOOZE_KEY = 'updatePrompt.snooze'; // { version, at }
const STORE_NAME = Platform.OS === 'android' ? 'Google Play' : 'App Store';

export default function UpdatePrompt() {
  const t = useTheme();
  const { latest } = useUpdates();
  const { loading } = useData();
  const onboarding = useOnboarding();
  const tour = useTour();
  const path = usePathname();
  const [show, setShow] = useState(false);
  const checked = useRef(false);

  const ready = !loading && !!onboarding?.decided && !onboarding?.active && !tour?.tourId && path === '/';

  useEffect(() => {
    if (!ready || !latest || checked.current) return undefined;
    // 画面が見えてから出す。通知の許可（ダッシュボード到達時に一度だけ）と重ならないよう少し待つ
    const id = setTimeout(async () => {
      checked.current = true;
      let snooze = null;
      try { snooze = JSON.parse((await AsyncStorage.getItem(SNOOZE_KEY)) || 'null'); } catch { snooze = null; }
      if (shouldPromptUpdate({ current: appVersion, latest, snooze, now: Date.now() })) setShow(true);
    }, 2500);
    return () => clearTimeout(id);
  }, [ready, latest]);

  const later = () => {
    setShow(false);
    AsyncStorage.setItem(SNOOZE_KEY, JSON.stringify({ version: latest?.version, at: Date.now() })).catch(() => {});
  };
  const update = () => {
    setShow(false);
    Linking.openURL(latest.url).catch(() => {});
  };

  if (!show || !latest) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={later} statusBarTranslucent>
      <Pressable onPress={later} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,.45)', justifyContent: 'center', padding: 28 }}>
        {/* 中のタップが背景に抜けて閉じないよう、空の onPress で受ける */}
        <Pressable onPress={() => {}} style={{ backgroundColor: t.bg1, borderRadius: 16, padding: 18, gap: 12 }}>
          <Text style={{ color: t.tx, fontSize: 17, fontWeight: '700' }}>新しいバージョンがあります</Text>
          <Text style={{ color: t.tx2, fontSize: 15, lineHeight: 22 }}>
            {`バージョン ${latest.version} を ${STORE_NAME} で配信しています（お使いの版は ${appVersion}）。アップデートすると、新しい機能と修正が使えます。`}
          </Text>
          <TouchableOpacity onPress={update}
            style={{ backgroundColor: t.ac, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 4 }}>
            <Text style={{ color: t.acTx, fontSize: 16, fontWeight: '700' }}>アップデートする</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={later}
            style={{ borderWidth: 1, borderColor: t.bd2, borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}>
            <Text style={{ color: t.tx2, fontSize: 16, fontWeight: '700' }}>あとで</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
