// キーボードの右上に「閉じる」を出す。数字キーパッドには改行キーが無く、金額を入れたあとに
// キーボードを閉じられなかった。画面の側には置かず、キーボードに付くバーとして出す。
//
// ・iOS: InputAccessoryView（キーボードの上に付く標準のバー）。各入力欄が inputAccessoryViewID で参照する。
// ・Android: InputAccessoryView が無いので、キーボードの上端に重ねて同じ見た目のバーを出す。
//   エッジ・ツー・エッジでルートが画面全体なので、keyboardDidShow の screenY がそのまま top になる。
//   このバーの高さ分だけ欄が隠れるので、入力欄のスクロール量には KEYBOARD_BAR_H を足す（ui.jsx の Screen）。
import { useEffect, useState } from 'react';
import { InputAccessoryView, Keyboard, Platform, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../theme';

export const KEYBOARD_DONE_ID = 'kb-done';
export const KEYBOARD_BAR_H = 40;

function Bar() {
  const t = useTheme();
  return (
    <View style={{
      height: KEYBOARD_BAR_H, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center',
      backgroundColor: t.bg1, borderTopWidth: 1, borderTopColor: t.bd,
    }}>
      <TouchableOpacity onPress={Keyboard.dismiss} hitSlop={{ top: 6, bottom: 6, left: 12, right: 6 }}
        accessibilityRole="button" accessibilityLabel="キーボードを閉じる"
        style={{ paddingHorizontal: 16, height: '100%', justifyContent: 'center' }}>
        <Text style={{ color: t.ac, fontSize: 16, fontWeight: '700' }}>閉じる</Text>
      </TouchableOpacity>
    </View>
  );
}

function AndroidBar() {
  const [top, setTop] = useState(null);
  useEffect(() => {
    const a = Keyboard.addListener('keyboardDidShow', (e) => setTop(e.endCoordinates?.screenY ?? null));
    const b = Keyboard.addListener('keyboardDidHide', () => setTop(null));
    return () => { a.remove(); b.remove(); };
  }, []);
  if (top == null) return null;
  return (
    <View style={{ position: 'absolute', left: 0, right: 0, top: top - KEYBOARD_BAR_H }}>
      <Bar />
    </View>
  );
}

/** ルートに1つだけ置く。 */
export default function KeyboardDone() {
  if (Platform.OS === 'ios') {
    return <InputAccessoryView nativeID={KEYBOARD_DONE_ID}><Bar /></InputAccessoryView>;
  }
  return <AndroidBar />;
}
