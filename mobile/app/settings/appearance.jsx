// 外観の設定。設定メニューから開く。
// 配色（ライト・ダーク）とテーマカラー（アクセントの色）は別々に選べる。どちらも端末ごとに保存する。
import { Text, TouchableOpacity, View } from 'react-native';
import { ACCENTS, paletteFor, useTheme, useThemeMode } from '../../src/theme';
import { Card, Screen, Segmented } from '../../src/components/ui';
import { MODES } from '../../src/store/ThemeProvider';

export default function Appearance() {
  const t = useTheme();
  const theme = useThemeMode();
  return (
    <Screen>
      <Card title="配色">
        <Segmented options={MODES} value={theme.mode} onChange={theme.setMode} />
        <Text style={{ color: t.tx3, fontSize: 13.5 }}>
          いま {theme.resolved === 'light' ? 'ライト' : 'ダーク'} で表示しています。
          「端末に合わせる」は端末の外観設定に追随します。
        </Text>
      </Card>

      {/* 色の名前は出さない（丸だけ並べる）。名前は読み上げ用に accessibilityLabel に持つ */}
      <Card title="テーマカラー">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
          {Object.entries(ACCENTS).map(([key, a]) => {
            const on = theme.accent === key;
            // 見本は、いまの配色（ライト・ダーク）での記帳ボタン（＋）と同じ色を出す
            const sample = paletteFor(theme.resolved, key);
            return (
              <TouchableOpacity key={key} onPress={() => theme.setAccent(key)} activeOpacity={0.7}
                accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={a.label}
                style={{ alignItems: 'center' }}>
                <View style={{
                  width: 44, height: 44, borderRadius: 22, backgroundColor: sample.ac,
                  borderWidth: on ? 3 : 0, borderColor: t.tx, alignItems: 'center', justifyContent: 'center',
                }}>
                  {on ? <Text style={{ color: sample.acTx, fontSize: 18, fontWeight: '800' }}>✓</Text> : null}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={{ color: t.tx3, fontSize: 13.5 }}>
          ボタンや純資産のカードなどの色が変わります。収支のプラス・マイナスの色は変わりません。
        </Text>
      </Card>
    </Screen>
  );
}
