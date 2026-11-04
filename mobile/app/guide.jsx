// 使い方。複式簿記に馴染みのない人がつまずく箇所だけを扱う。
// Web版の GuidePage をそのまま持ってくると分量が過ぎるので、モバイルで実際にできる操作に絞った。
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../src/theme';
import { Card, MenuList, Screen } from '../src/components/ui';
import { useTour } from '../src/store/TourProvider';
import { useOnboarding } from '../src/store/OnboardingProvider';
import { useAuth } from '../src/store/AuthProvider';
import { CIRCLED, TOURS, TOUR_MENU } from '../src/tours';
import { GUIDE_SECTIONS } from '../src/guideSections';



export default function Guide() {
  const t = useTheme();
  const { start } = useTour();
  const router = useRouter();
  const onboarding = useOnboarding();
  // 暗号化はアカウントにつないだ人だけが使える。ゲストには並べるが押せなくする（2026-10-18 指示）
  const signedIn = !!useAuth()?.signedIn;
  // はじめに出したホームの説明（HomeIntro）は、ホームの上に出す。ホームへ戻ってから開く
  const reopenIntro = () => { onboarding?.openIntro?.(); router.navigate('/'); };
  return (
    <Screen>
      <MenuList title="大枠" items={[
        { label: '使い方の大枠を見る', sub: '何を設定すると、ホームのどこが動くか', onPress: reopenIntro },
      ]} />

      {/* 読ませるより触らせた方が早い。ツアーを先頭に置く。 */}
      {/* ①〜⑤はホームの紹介カードと同じ。ほかのツアーは続けて番号を振る（tours.js の TOUR_MENU） */}
      <MenuList title="ツアー" items={TOUR_MENU.map((id, i) => {
        const locked = id === 'encryption' && !signedIn;
        return {
          label: `${CIRCLED[i]} ${TOURS[id].label}`, onPress: () => start(id),
          disabled: locked, sub: locked ? '※ユーザー登録後に有効化できます' : undefined,
        };
      })} />

      <Text style={{ color: t.tx3, fontSize: 13, textAlign: 'center' }}>
        選ぶと実際の画面を指しながら案内します
      </Text>

      {GUIDE_SECTIONS.map((s) => (
        <Card key={s.title} title={s.title}>
          <Text style={{ color: t.tx2, fontSize: 15, lineHeight: 23 }}>{s.body}</Text>
        </Card>
      ))}
      <View style={{ height: 8 }} />
    </Screen>
  );
}
