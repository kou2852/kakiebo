// 使い方。複式簿記に馴染みのない人がつまずく箇所だけを扱う。
// Web版の GuidePage をそのまま持ってくると分量が過ぎるので、モバイルで実際にできる操作に絞った。
import { Text, View } from 'react-native';
import { useTheme } from '../src/theme';
import { Card, MenuList, Screen } from '../src/components/ui';
import { useTour } from '../src/store/TourProvider';
import { TOURS, TOUR_MENU } from '../src/tours';

const SECTIONS = [
  {
    title: 'なぜ「支出・収入・振替」なのか',
    body: 'このアプリは複式簿記で記録しますが、入力では借方・貸方を直接選ばせません。'
      + '「支出」なら費目と支払方法、「収入」なら入金先と収入元を選ぶだけで、正しい仕訳になります。',
  },
  {
    title: '振替とは',
    body: '資産どうしのお金の移動です。銀行から現金を引き出す、カードの引き落とし、口座間の移動など。'
      + '支出ではないので、家計の支出額には含まれません。ここを支出にすると二重計上になります。',
  },
  {
    title: 'プリセット',
    body: 'よく使う「費目 × 支払方法」の組み合わせを登録しておくと、入力画面の上部から1タップで呼び出せます。'
      + '金額と日付は毎回入力します。設定 → 管理 → プリセットで作れます。',
  },
  {
    title: 'クレジットカード',
    body: 'カードで払った時点で「費用 ← クレジットカード（負債）」として記録します。引き落としは後日、'
      + '「クレジットカード ← 預金」の振替で消し込みます。負債の勘定科目に締め日・引落日・引落口座を設定すると、'
      + 'レポートの「カード」でサイクルごとの利用額と引落予定が見られます。',
  },
  {
    title: 'タグと配分',
    body: 'タグは仕訳の用途分類です。配分は「この口座の残高のうち、いくらを何に取っておくか」という予算取りで、'
      + '残高そのものは動かしません。',
  },
  {
    title: 'オフラインと同期',
    body: '入力は常に端末内に即保存されます。通信が無くても使え、つながった時点で自動的にサーバーへ送られます。'
      + '未送信の件数は設定画面で確認できます。',
  },
  {
    title: 'E2E暗号化',
    body: '有効にしている場合、家計データは端末内で暗号化されてから送られます。'
      + 'パスフレーズも鍵もサーバーへは送りません。解錠した鍵はこの端末の Keychain にだけ保存されます。',
  },
  {
    title: 'まだ Web版が必要なこと',
    body: '3行以上の複合仕訳の編集、ゲストデータの移行、アカウント設定の変更、PDF出力。'
      + 'これらは app.kurofukubo.com をご利用ください。',
  },
];

export default function Guide() {
  const t = useTheme();
  const { start } = useTour();
  return (
    <Screen>
      {/* 読ませるより触らせた方が早い。ツアーを先頭に置く。 */}
      <MenuList title="画面を見ながら覚える" items={TOUR_MENU.map((id) => ({
        label: TOURS[id].label,
        onPress: () => start(id),
      }))} />

      <Text style={{ color: t.tx3, fontSize: 13, textAlign: 'center' }}>
        選ぶと実際の画面を指しながら案内します
      </Text>

      {SECTIONS.map((s) => (
        <Card key={s.title} title={s.title}>
          <Text style={{ color: t.tx2, fontSize: 15, lineHeight: 23 }}>{s.body}</Text>
        </Card>
      ))}
      <View style={{ height: 8 }} />
    </Screen>
  );
}
