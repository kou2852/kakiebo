// 行を左へスライドすると、右端に操作ボタンが出る（iPhone のメールと同じ形）。
//
// BottomSheet と同じく Animated と PanResponder だけで組む（ネイティブ依存を増やさない）。
// 開けるのは同時に1行だけ。別の行を開くと、前に開いていた行は閉じる。
// 開いている行をタップしたときは、行の操作（編集など）ではなく閉じるだけにする。
import { useEffect, useRef, useState } from 'react';
import { Animated, PanResponder, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../theme';

const BTN_W = 76;
// いま開いている行を閉じる関数。行どうしで共有するため、コンポーネントの外に持つ。
const current = { close: null };

export default function SwipeRow({ actions, disabled, children }) {
  const t = useTheme();
  const width = BTN_W * actions.length;
  const [x] = useState(() => new Animated.Value(0));
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);
  const base = useRef(0);
  // PanResponder は作り直さないので、最新の disabled は ref 経由で見る
  const disabledRef = useRef(disabled);
  useEffect(() => { disabledRef.current = disabled; }, [disabled]);

  // 何度描画しても同じ関数を使う
  const [slide] = useState(() => {
    const fn = (to) => {
      openRef.current = to !== 0;
      setOpen(to !== 0);
      if (to !== 0) current.close = () => fn(0);
      Animated.spring(x, { toValue: to, useNativeDriver: true, bounciness: 0, speed: 20 }).start();
    };
    return fn;
  });
  const close = () => slide(0);

  // ref を読むのはジェスチャの発生時だけで、レンダー中には走らない（BottomSheet と同じ誤検出）。
  // eslint-disable-next-line react-hooks/refs
  const [pan] = useState(() => PanResponder.create({
    // 横に動いたときだけ取る。縦のスクロールは一覧に任せる。
    onMoveShouldSetPanResponder: (_, g) => !disabledRef.current && Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderGrant: () => {
      // 別の行が開いていたら閉じる
      if (!openRef.current && current.close) current.close();
      x.stopAnimation();
      base.current = openRef.current ? -width : 0;
    },
    onPanResponderMove: (_, g) => {
      x.setValue(Math.min(0, Math.max(-width - 24, base.current + g.dx)));
    },
    // 一度つかんだら、一覧のスクロールに横取りさせない
    onPanResponderTerminationRequest: () => false,
    onPanResponderRelease: (_, g) => {
      const end = base.current + g.dx;
      slide(end < -width / 2 || g.vx < -0.4 ? -width : 0);
    },
    onPanResponderTerminate: () => slide(openRef.current ? -width : 0),
  }));

  return (
    <View style={{ overflow: 'hidden' }}>
      <View style={{ position: 'absolute', top: 0, bottom: 0, right: 0, flexDirection: 'row' }}>
        {actions.map((a) => (
          <TouchableOpacity
            key={a.label}
            onPress={() => { close(); a.onPress(); }}
            style={{ width: BTN_W, alignItems: 'center', justifyContent: 'center', backgroundColor: a.color || t.ac }}
          >
            <Text style={{ color: a.textColor || t.acTx, fontSize: 15, fontWeight: '700' }}>{a.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Animated.View style={{ transform: [{ translateX: x }] }} {...pan.panHandlers}>
        {children}
        {/* 開いている間は行のタップを受けず、閉じるだけにする */}
        {open ? (
          <TouchableOpacity activeOpacity={1} onPress={close}
            style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} />
        ) : null}
      </Animated.View>
    </View>
  );
}
