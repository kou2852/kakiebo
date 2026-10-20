// 「広告を消す」のアイコン（2026-10-18 指示）。広告の見本（「広告」と再生マーク、文字の行）に、赤い禁止の印を重ねる。
// 絵は View だけで描く。SVG の部品（react-native-svg）はアプリに入っておらず、足すとネイティブの変更になって OTA で届かなくなる。
// 大きさは 100 を基準にした割合で組み、size に合わせて拡大縮小する。
import { Text, View } from 'react-native';

const RED = '#f2263a';

export default function AdOffIcon({ size = 28 }) {
  const u = size / 100;
  const box = (x, y, w, h, extra) => ({ position: 'absolute', left: x * u, top: y * u, width: w * u, height: h * u, ...extra });
  const ring = 9 * u;
  return (
    <View style={{ width: size, height: size }} accessibilityLabel="広告を消す">
      {/* 広告の見本 */}
      <View style={box(20, 28, 60, 30, { backgroundColor: '#6b7488', borderRadius: 6 * u })} />
      <Text style={{ position: 'absolute', left: 25 * u, top: 31 * u, fontSize: 17 * u, lineHeight: 24 * u, fontWeight: '800', color: '#ffffff', includeFontPadding: false }}>広告</Text>
      {/* 再生マーク（三角） */}
      <View style={{
        position: 'absolute', left: 64 * u, top: 36 * u, width: 0, height: 0,
        borderTopWidth: 7 * u, borderBottomWidth: 7 * u, borderLeftWidth: 10 * u,
        borderTopColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: '#e9ecf5',
      }} />
      <View style={box(20, 64, 60, 6, { backgroundColor: '#a9afc4', borderRadius: 3 * u })} />
      <View style={box(20, 75, 36, 6, { backgroundColor: '#a9afc4', borderRadius: 3 * u })} />
      {/* 禁止の印（輪と斜線） */}
      <View style={{
        position: 'absolute', left: 8 * u, top: 8 * u, width: 84 * u, height: 84 * u,
        borderRadius: 42 * u, borderWidth: ring, borderColor: RED,
      }} />
      <View style={{
        position: 'absolute', left: (50 - 41) * u, top: 50 * u - ring / 2, width: 82 * u, height: ring,
        backgroundColor: RED, transform: [{ rotate: '45deg' }],
      }} />
    </View>
  );
}
