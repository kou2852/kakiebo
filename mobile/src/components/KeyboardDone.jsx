// キーボードを閉じる。数字キーパッドには改行キーが無く、金額を入れたあとにキーボードを閉じられなかった。
// 画面の側には置かず、キーボードに付く形で出す。アプリの一番上の層に1つだけ置く。
//
// ・iOS: キーボードの右上（すぐ上）に、丸い「キーボードを閉じる」ボタンを浮かせる（Safari と同じ位置・同じ形）。
// ・Android: キーボードの上端に、右寄せの「閉じる」バーを重ねる。
//
// ⚠ iOS の InputAccessoryView は使わない。新アーキテクチャ（Fabric）では、InputAccessoryView は
//   「自分が表示された時点で見つかった入力欄1つ」にしか付かない（RCTInputAccessoryComponentView の
//   didMoveToWindow）。起動時にルートへ置くと、その時点では入力欄が1つも無く、どの画面でも出なかった
//   （TestFlight で確認された）。入力欄に inputAccessoryViewID を付ける方式もやめた
//   （付けると RN 標準の補助バーも出なくなる）。
//
// キーボードの座標（screenY）は画面の上端が原点。これはルートに置くので、そのまま top に使える。
// Android のバーは、その高さ分だけ欄が隠れるので、入力欄のスクロール量に KEYBOARD_BAR_H を足す（ui.jsx の Screen）。
import { useEffect, useState } from 'react';
import { Keyboard, Platform, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../theme';

export const KEYBOARD_BAR_H = 40; // Android のバーの高さ
const BUTTON = 44;                // iOS のボタンの直径
const GAP = 10;                   // iOS: キーボードとボタンの間

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

function CloseButton() {
  const t = useTheme();
  return (
    <TouchableOpacity onPress={Keyboard.dismiss} hitSlop={8} activeOpacity={0.7}
      accessibilityRole="button" accessibilityLabel="キーボードを閉じる"
      style={[{
        width: BUTTON, height: BUTTON, borderRadius: BUTTON / 2, backgroundColor: t.bg1,
        borderWidth: 1, borderColor: t.bd, alignItems: 'center', justifyContent: 'center',
      }, t.shadow]}>
      <MaterialCommunityIcons name="keyboard-close" size={26} color={t.ac} />
    </TouchableOpacity>
  );
}

/** ルートに1つだけ置く。キーボードが出ている間だけ、その上に出す。 */
export default function KeyboardDone() {
  const [top, setTop] = useState(null);
  useEffect(() => {
    // iOS は表示が始まる時点で最終位置が分かる（Will）ので、キーボードと一緒に出す。
    // 欄の切り替えでキーボードの高さが変わるとき（数字キー→文字キー）は ChangeFrame が来る。
    const ios = Platform.OS === 'ios';
    const place = (e) => setTop(e.endCoordinates?.screenY ?? null);
    const subs = [
      Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', place),
      Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => setTop(null)),
    ];
    if (ios) subs.push(Keyboard.addListener('keyboardWillChangeFrame', place));
    return () => subs.forEach((s) => s.remove());
  }, []);
  if (top == null) return null;
  if (Platform.OS === 'ios') {
    return (
      <View pointerEvents="box-none" style={{ position: 'absolute', right: 12, top: top - BUTTON - GAP }}>
        <CloseButton />
      </View>
    );
  }
  return (
    <View style={{ position: 'absolute', left: 0, right: 0, top: top - KEYBOARD_BAR_H }}>
      <Bar />
    </View>
  );
}
