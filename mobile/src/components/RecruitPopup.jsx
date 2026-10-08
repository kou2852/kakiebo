import { useEffect, useState } from 'react';
import { Linking, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Android 版のテスター募集を、iPhone のアプリ内でも告知する（一度閉じたら出さない）。
// iOS だけに出す。Android 版はこのアプリを入れている端末なので、募集の対象外。
// ⚠ 募集は 10/9（金）まで。期限を過ぎたら、このファイルごと外す。
const SEEN_KEY = 'kk_recruit_android_ios_seen_v1';
const APPLY_URL = 'https://kurofukubo.com/contact.html?topic=android-tester';

export default function RecruitPopup() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    let alive = true;
    AsyncStorage.getItem(SEEN_KEY)
      .then((v) => { if (alive && !v) setVisible(true); })
      .catch(() => {}); // 読めなければ出さない（何度も出るよりは安全側）
    return () => { alive = false; };
  }, []);

  const close = () => {
    setVisible(false);
    AsyncStorage.setItem(SEEN_KEY, String(Date.now())).catch(() => {});
  };

  const apply = () => {
    close();
    Linking.openURL(APPLY_URL).catch(() => {});
  };

  if (!visible) return null;

  return (
    <Modal transparent animationType="fade" visible onRequestClose={close}>
      <View style={{ flex: 1, backgroundColor: 'rgba(20,32,31,0.45)', justifyContent: 'center', padding: 20 }}>
        <View style={{ backgroundColor: '#ffffff', borderRadius: 14, padding: 22, maxHeight: '85%' }}>
          <ScrollView>
            <Text style={{ fontSize: 18, fontWeight: '800', color: '#0d9488', marginBottom: 10 }}>
              Android版のテスターを募集しています
            </Text>
            <Text style={{ fontSize: 14, lineHeight: 22, color: '#3c4a49', marginBottom: 10 }}>
              kurofukubo のAndroid版を、毎日使ってくださるテスターを探しています。iPhone版と同じ機能を、Google Play の「クローズドテスト」で先行してお使いいただけます。
            </Text>
            <Text style={{ fontSize: 14, lineHeight: 22, color: '#3c4a49', marginBottom: 6 }}>・必要なもの: Google アカウント（Gmail）と Android 端末</Text>
            <Text style={{ fontSize: 14, lineHeight: 22, color: '#3c4a49', marginBottom: 6 }}>・参加後は14日間、毎日の家計管理にアプリを使っていただきます（毎日記帳いただかなくても構いません）</Text>
            <Text style={{ fontSize: 14, lineHeight: 22, color: '#3c4a49', marginBottom: 10 }}>・不具合や使いにくい点を教えていただくと、正式版の改善に使わせていただきます</Text>
            <Text style={{ fontSize: 12.5, lineHeight: 20, color: '#5d6b6a', marginBottom: 6 }}>
              テスター開始は、アプリの審査通過後に順次ご案内します。テスト版のため、動作が不安定な場合があります。募集は10月9日（金）までです。
            </Text>
            <Text style={{ fontSize: 12.5, lineHeight: 20, color: '#5d6b6a', marginBottom: 16 }}>
              申込方法: お問い合わせフォーム、または machinakalog@gmail.com へメール、または X の DM（@pakupaku_x_x_x 宛て）
            </Text>
          </ScrollView>
          <Pressable onPress={apply} accessibilityRole="button"
            style={{ backgroundColor: '#0d9488', borderRadius: 10, paddingVertical: 13, alignItems: 'center', marginBottom: 10 }}>
            <Text style={{ color: '#ffffff', fontSize: 15, fontWeight: '700' }}>フォームで申し込む</Text>
          </Pressable>
          <Pressable onPress={close} accessibilityRole="button" style={{ paddingVertical: 10, alignItems: 'center' }}>
            <Text style={{ color: '#5d6b6a', fontSize: 14 }}>あとで</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
