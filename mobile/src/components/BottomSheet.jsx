// 下から出るシート。上へスワイプで全画面、下へスワイプで元の高さ、さらに下で閉じる。
//
// 標準の Modal（pageSheet）は画面をほぼ覆ってしまい、元の画面が見えなくなる。
// カレンダーのように「元の画面を見ながら詳細も見たい」場面では成立しないので、
// 高さを持つシートにして、カレンダーを隠さない位置を既定にしている。
//
// react-native-bottom-sheet 等は入れない（ネイティブ依存が増えて OTA が届かなくなる）。
// Animated と PanResponder は React Native 標準なのでこれで組む。
import { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, PanResponder, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../theme';

const H = Dimensions.get('window').height;
// 上端の位置（画面上端からの距離）。小さいほど大きく開く。
const FULL = Math.round(H * 0.08);
const HALF = Math.round(H * 0.48);
const CLOSED = H;
const SNAPS = [FULL, HALF, CLOSED];

export default function BottomSheet({ visible, onClose, title, right, children }) {
  const t = useTheme();
  const [y] = useState(() => new Animated.Value(CLOSED));

  // 停止位置は描画にも使うので state。PanResponder は作り直さないので ref でも持つ。
  const [snap, setSnap] = useState(CLOSED);
  const snapRef = useRef(CLOSED);
  const dragFrom = useRef(CLOSED);
  // props は作成時に閉じ込められるため、最新を ref 経由で参照する。
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  const [slideTo] = useState(() => (to) => {
    snapRef.current = to;
    setSnap(to);
    Animated.spring(y, { toValue: to, useNativeDriver: true, bounciness: 2, speed: 16 })
      .start(() => { if (to === CLOSED) onCloseRef.current?.(); });
  });

  useEffect(() => {
    slideTo(visible ? HALF : CLOSED);
    // slideTo は毎回同じ挙動。visible の変化だけで動かす。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // ref を読むのはジェスチャの発生時だけで、レンダー中には走らない。
  // useState の初期化関数がレンダー中に呼ばれるため lint が誤検出する。
  // eslint-disable-next-line react-hooks/refs
  const [pan] = useState(() => PanResponder.create({
    // 縦に動かしたときだけ掴む。中の一覧のタップやスクロールを邪魔しない。
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderGrant: () => { dragFrom.current = snapRef.current; },
    onPanResponderMove: (_, g) => y.setValue(Math.max(FULL, dragFrom.current + g.dy)),
    onPanResponderRelease: (_, g) => {
      const pos = Math.max(FULL, dragFrom.current + g.dy);
      // 速く弾いたときは向きを優先。ゆっくりのときは一番近い停止位置へ。
      if (g.vy > 0.8) return slideTo(dragFrom.current === FULL ? HALF : CLOSED);
      if (g.vy < -0.8) return slideTo(FULL);
      return slideTo(SNAPS.reduce((a, b) => (Math.abs(b - pos) < Math.abs(a - pos) ? b : a)));
    },
  }));

  if (!visible && snap === CLOSED) return null;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 0, right: 0, top: 0, height: H, transform: [{ translateY: y }] }}
    >
      <View style={{
        flex: 1, backgroundColor: t.bg1,
        borderTopLeftRadius: 18, borderTopRightRadius: 18,
        shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: -4 },
        elevation: 12,
      }}>
        {/* つまみと見出しの帯だけがドラッグを受ける */}
        <View {...pan.panHandlers}>
          <View style={{ alignItems: 'center', paddingTop: 8 }}>
            <View style={{ width: 38, height: 4, borderRadius: 2, backgroundColor: t.bd2 }} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 14, paddingBottom: 10, gap: 10 }}>
            <Text style={{ color: t.tx, fontSize: 16, fontWeight: '700', flex: 1 }}>{title}</Text>
            {right}
            <TouchableOpacity onPress={() => slideTo(CLOSED)} style={{ padding: 4 }}>
              <Text style={{ color: t.ac, fontSize: 14, fontWeight: '600' }}>閉じる</Text>
            </TouchableOpacity>
          </View>
        </View>
        {children}
      </View>
    </Animated.View>
  );
}
