// ショートカット設定の案内。
//
// URL を手で書かせない。プリセットごとに1タップでコピーでき、貼るだけで
// ショートカットApp・背面タップ・Siri に割り当てられるようにする。
import { useState } from 'react';
import { Linking, Text, TouchableOpacity, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useData } from '../src/store/DataProvider';
import { useTheme } from '../src/theme';
import { Button, Card, Empty, Screen, sep } from '../src/components/ui';
import { fa } from '../src/utils/format';
import { presetUrl } from '../src/quickActions';

const STEPS = [
  {
    title: 'ホーム画面のアイコンを長押し',
    body: '設定は要りません。登録したプリセットが自動で並びます（先頭3件＋レシート撮影）。'
      + '並び順を変えたいときは、管理 → プリセット で作り直してください。',
  },
  {
    title: '背面タップに割り当てる',
    body: '本体の背面を2回叩くだけで記帳画面が開きます。レシートが出ない支出に一番速い。'
      + '設定 → アクセシビリティ → タッチ → 背面タップ → ダブルタップ → 作ったショートカットを選択。',
  },
  {
    title: 'Siri で話しかける',
    body: 'ショートカットAppで「入力を要求（テキスト）」→「URLを開く」に kurofukubo://add?text= と入力内容を繋げます。'
      + '名前を「記帳」にすると、Hey Siri 記帳 →「食費 1200 現金」と話すだけになります。',
  },
];

export default function Shortcuts() {
  const t = useTheme();
  const router = useRouter();
  const { presets } = useData();
  const [copied, setCopied] = useState(null);

  const copy = async (p) => {
    await Clipboard.setStringAsync(presetUrl(p));
    setCopied(p.id);
    setTimeout(() => setCopied((c) => (c === p.id ? null : c)), 1800);
  };

  return (
    <Screen>
      <Card title="プリセットのリンク">
        <Text style={{ color: t.tx2, fontSize: 14, lineHeight: 21 }}>
          タップするとURLをコピーします。ショートカットAppの「URLを開く」に貼れば、
          ホーム画面・背面タップ・Siri のどれからでも呼び出せます。
        </Text>
        {presets.length === 0 ? (
          <Empty text="プリセットがありません" />
        ) : presets.map((p) => {
          const amount = p.lines?.find((l) => l.side === 'dr')?.amount || 0;
          return (
            <TouchableOpacity key={p.id} onPress={() => copy(p)}
              style={[{ flexDirection: 'row', alignItems: 'center', paddingVertical: 11 }, sep(t)]}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.tx, fontSize: 16 }}>
                  {p.name}
                  {amount > 0 ? <Text style={{ color: t.tx2, fontWeight: '400' }}>{`  ${fa(amount)}`}</Text> : null}
                </Text>
                <Text style={{ color: t.tx3, fontSize: 13 }} numberOfLines={1}>{presetUrl(p)}</Text>
              </View>
              <Text style={{ color: copied === p.id ? t.grn : t.ac, fontSize: 14, fontWeight: '700' }}>
                {copied === p.id ? 'コピー済' : 'コピー'}
              </Text>
            </TouchableOpacity>
          );
        })}
        <Button label="プリセットを編集" variant="ghost" onPress={() => router.push('/manage/presets')} />
      </Card>

      <Card title="金額まで決めておくと1タップになります">
        <Text style={{ color: t.tx2, fontSize: 14, lineHeight: 21 }}>
          プリセットに「既定の金額」を入れておくと、開いた時点で金額まで埋まります。
          自販機や駐車場のように毎回同じ額のものは、確認して保存を押すだけで終わります。
        </Text>
      </Card>

      {STEPS.map((s) => (
        <Card key={s.title} title={s.title}>
          <Text style={{ color: t.tx2, fontSize: 15, lineHeight: 23 }}>{s.body}</Text>
        </Card>
      ))}

      <Button label="ショートカットAppを開く" variant="ghost"
        onPress={() => Linking.openURL('shortcuts://').catch(() => {})} />
    </Screen>
  );
}
