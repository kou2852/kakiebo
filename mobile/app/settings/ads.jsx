// 広告。動画（リワード）広告を最後まで見ると、その日の終わりまで広告（バナーと全画面）を出さない。
// 押したときだけ動画を出す。勝手には出さない。中身はホーム右下の「広告を消す」と同じ（AdFreeCard）。
import { Card, Screen } from '../../src/components/ui';
import AdFreeCard from '../../src/components/AdFreeCard';

export default function Ads() {
  return (
    <Screen>
      <Card title="今日は広告を消す">
        <AdFreeCard />
      </Card>
    </Screen>
  );
}
