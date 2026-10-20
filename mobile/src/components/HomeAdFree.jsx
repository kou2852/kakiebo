// ホーム右下の「広告を消す」（2026-10-17 決定）。押すと、画面の真ん中にカードを出し、後ろを暗くする（2026-10-18 指示）。
// 動画を見るとその日は広告が消える。カードには、記帳の全画面広告があと何件で出るかも出す（AdFreeCard）。
//
// ・ボタンは「アイコン（AdOffIcon＝広告に禁止の印）＋「広告を消す」の文字」
// ・動画広告を見られない人には、ボタンごと出さない（リワードの ID が無い版・広告の無いビルドなど＝rewardedReady が偽）
// ・今日もう広告を消した人にも、ボタンは出さない（消すものが無い）。カードを開いたまま見終えたら、カードに「○時まで広告オフ」を出す
// ・オンボーディング・ホームの紹介カード・ツアーの間は出さない（重なると押し間違える）
// ・中身は設定の「広告」画面と同じ部品（AdFreeCard）
import { useEffect, useState } from 'react';
import { Animated, Modal, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';
import { useAdFree } from '../adFree';
import { rewardedReady } from './Rewarded';
import AdFreeCard from './AdFreeCard';
import AdOffIcon from './AdOffIcon';
import { useOnboarding } from '../store/OnboardingProvider';
import { useTour } from '../store/TourProvider';

// 下の帯広告（タブバーの上）のすぐ上に置く（2026-10-18 指示。目立たせるため。以前は 56 だった）。
// ⚠ 広告と操作の部品が近すぎると、AdMob のポリシー（誤タップを誘う配置）に触れるおそれがある。最低限の隙間（12）は残す。
const BOTTOM = 12;

// scrolling: ホームをスクロールしている間は消して押せなくし、止まったら出す（2026-10-18 指示）
export default function HomeAdFree({ scrolling = false }) {
  const t = useTheme();
  const { active } = useAdFree();
  const onboarding = useOnboarding();
  const tour = useTour();
  const [open, setOpen] = useState(false);
  const [fade] = useState(() => new Animated.Value(1));
  useEffect(() => {
    Animated.timing(fade, { toValue: scrolling ? 0 : 1, duration: scrolling ? 90 : 180, useNativeDriver: true }).start();
  }, [scrolling, fade]);

  if (!rewardedReady() || onboarding?.active || onboarding?.intro || tour?.tourId) return null;

  if (open) {
    return (
      // 画面全体（見出しとタブも）を暗くして、真ん中に出す。ホームの中に置くと見出しとタブが暗くならず、真ん中からずれる
      <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={() => setOpen(false)}>
      <View style={{ flex: 1, backgroundColor: 'rgba(12,18,24,0.55)', justifyContent: 'center', padding: 24 }}>
        {/* 暗いところを押すと閉じる。カードの中を押しても閉じない */}
        <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} onPress={() => setOpen(false)} accessibilityLabel="閉じる" />
        <View style={[{ backgroundColor: t.bg1, borderRadius: 18, padding: 16, gap: 10 }, t.shadow]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <AdOffIcon size={34} />
            <Text style={{ color: t.tx, fontSize: 17, fontWeight: '800', flex: 1 }}>広告を消す</Text>
            <Pressable onPress={() => setOpen(false)} hitSlop={10} accessibilityRole="button" accessibilityLabel="閉じる">
              <Ionicons name="close" size={22} color={t.tx3} />
            </Pressable>
          </View>
          <AdFreeCard />
        </View>
      </View>
      </Modal>
    );
  }

  if (active) return null;
  return (
    <Animated.View pointerEvents={scrolling ? 'none' : 'box-none'} style={{ position: 'absolute', right: 14, bottom: BOTTOM, opacity: fade }}>
      {/* 地はテーマの色（目立たせるため）。文字はその上で読める色（acTx） */}
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel="広告を消す"
        style={({ pressed }) => [{
          flexDirection: 'row', alignItems: 'center', gap: 8,
          backgroundColor: t.ac, borderRadius: 24, paddingVertical: 7, paddingLeft: 8, paddingRight: 16,
          opacity: pressed ? 0.8 : 1,
        }, t.shadow]}>
        {/* アイコンは白い丸の上に置く（テーマの色の上で、灰色と赤が埋もれないように） */}
        <View style={{ backgroundColor: '#ffffff', borderRadius: 22, padding: 3 }}>
          <AdOffIcon size={34} />
        </View>
        <Text style={{ color: t.acTx, fontSize: 15, fontWeight: '800' }}>広告を消す</Text>
      </Pressable>
    </Animated.View>
  );
}
