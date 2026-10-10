// 広告。動画（リワード）広告を最後まで見ると、その日の終わりまで広告（バナーと全画面）を出さない。
// 押したときだけ動画を出す。勝手には出さない。
import { useState } from 'react';
import { Alert, Text } from 'react-native';
import { useTheme } from '../../src/theme';
import { Button, Card, Screen } from '../../src/components/ui';
import { useToast } from '../../src/store/ToastProvider';
import { useAdFree } from '../../src/adFree';
import { watchRewarded } from '../../src/components/Rewarded';

const clock = (ms) => {
  const d = new Date(ms);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export default function Ads() {
  const t = useTheme();
  const toast = useToast();
  const { active, until } = useAdFree();
  const [busy, setBusy] = useState(false);

  const watch = async () => {
    setBusy(true);
    const r = await watchRewarded();
    setBusy(false);
    if (r === 'earned') toast('今日はこれから広告を出しません');
    else if (r === 'dismissed') Alert.alert('広告は消えていません', '動画を最後まで見ると、今日の広告が消えます。');
    else Alert.alert('動画を読み込めませんでした', '通信を確かめて、少し待ってからもう一度お試しください。');
  };

  const note = { color: t.tx3, fontSize: 13.5, lineHeight: 20 };

  return (
    <Screen>
      <Card title="今日は広告を消す">
        {active ? (
          <>
            <Text style={{ color: t.tx, fontSize: 16, fontWeight: '700' }}>広告をオフにしています</Text>
            <Text style={note}>{clock(until)} まで、バナーも全画面の広告も出ません。日付が変わると、また表示されます。</Text>
          </>
        ) : (
          <>
            <Text style={{ color: t.tx2, fontSize: 15, lineHeight: 22 }}>
              動画広告を最後まで見ると、今日の終わりまで、バナーと全画面の広告を出さなくします。
            </Text>
            <Button label={busy ? '読み込み中…' : '動画を見て、今日は広告を消す'} onPress={watch} disabled={busy} />
            <Text style={note}>動画は30秒ほどです。途中で閉じると広告は消えません。見るのは、この画面でボタンを押したときだけです。</Text>
          </>
        )}
      </Card>
    </Screen>
  );
}
