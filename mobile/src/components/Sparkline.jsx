// 折れ線。ヒーローカードの中で純資産の推移を見せる。
//
// react-native-svg を入れるとネイティブ依存が増えて既存ビルドへ OTA が届かなくなるため、
// 素の View だけで描く。点と点を結ぶ線分を、長さと角度を計算した細い View として置いている。
import { useState } from 'react';
import { Text, View } from 'react-native';

export default function Sparkline({ data, height = 54, color = '#fff', labelColor = 'rgba(255,255,255,.75)' }) {
  // 幅は実測する。端末幅やカードの余白に依存するので固定値にしない。
  const [w, setW] = useState(0);

  const values = (data || []).map((d) => d.value);
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const pad = 5;
  const inner = Math.max(w - pad * 2, 0);
  const x = (i) => pad + (inner * i) / (values.length - 1);
  const y = (v) => pad + (height - pad * 2) * (1 - (v - min) / span);

  return (
    <View style={{ gap: 3 }}>
      <View style={{ height }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
        {w > 0 && values.map((v, i) => {
          if (i === values.length - 1) return null;
          const x1 = x(i), y1 = y(v), x2 = x(i + 1), y2 = y(values[i + 1]);
          const dx = x2 - x1, dy = y2 - y1;
          const len = Math.sqrt(dx * dx + dy * dy);
          const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
          return (
            <View
              key={i}
              style={{
                position: 'absolute',
                left: x1, top: y1 - 1.25,
                width: len, height: 2.5,
                backgroundColor: color,
                borderRadius: 1.25,
                // 左端を軸に回す。既定は中心が軸なので、指定しないと線分が点からずれる。
                transformOrigin: 'left center',
                transform: [{ rotate: `${deg}deg` }],
              }}
            />
          );
        })}
        {w > 0 && values.map((v, i) => (
          <View
            key={`p${i}`}
            style={{
              position: 'absolute',
              left: x(i) - (i === values.length - 1 ? 3.5 : 2.5),
              top: y(v) - (i === values.length - 1 ? 3.5 : 2.5),
              width: i === values.length - 1 ? 7 : 5,
              height: i === values.length - 1 ? 7 : 5,
              borderRadius: 4,
              backgroundColor: color,
            }}
          />
        ))}
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {data.map((d, i) => (
          <Text key={i} style={{ color: labelColor, fontSize: 12.5 }}>{d.label}</Text>
        ))}
      </View>
    </View>
  );
}
