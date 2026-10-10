// 下から出るシート。上へスワイプで全画面、下へスワイプで元の高さ、さらに下で閉じる。
//
// 標準の Modal（pageSheet）は画面をほぼ覆ってしまい、元の画面が見えなくなる。
// カレンダーのように「元の画面を見ながら詳細も見たい」場面では成立しないので、
// 高さを持つシートにして、カレンダーを隠さない位置を既定にしている。
//
// react-native-bottom-sheet 等は入れない（ネイティブ依存が増えて OTA が届かなくなる）。
// Animated と PanResponder は React Native 標準なのでこれで組む。
import { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, PanResponder, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../theme';

// 停止位置は「置かれた親の高さ」を基準にする。画面全体の高さで決めると、
// タブバーやヘッダーの分だけ親より背が高くなり、シートの下側が画面の外にはみ出す。
// はみ出した分は中の一覧が自分の高さだと思い込んで、最後の行までスクロールできなかった。
const snapsOf = (h) => ({ full: Math.round(h * 0.08), half: Math.round(h * 0.48), closed: h });
const NAMES = ['full', 'half', 'closed'];

export default function BottomSheet({ visible, onClose, title, right, children }) {
  const t = useTheme();
  const [parentH, setParentH] = useState(() => Dimensions.get('window').height);
  const parentHRef = useRef(parentH);
  const [y] = useState(() => new Animated.Value(parentH));
  // 位置は Animated の描画に任せず、値を state に写して普通の View の top に入れる。
  // Animated.View に載せたままだと（transform でも top でも、止まっていても）、
  // Android で中の一覧が「下へ引く（上へ戻る）」操作だけ受け付けなくなった。上へ送る操作は動く。
  const [top, setTop] = useState(parentH);
  useEffect(() => {
    const id = y.addListener(({ value }) => setTop(value));
    return () => y.removeListener(id);
  }, [y]);
  // 停止位置は描画にも使うので state。PanResponder は作り直さないので ref でも持つ。
  const [pos, setPos] = useState('closed');
  const posRef = useRef('closed');
  const dragFrom = useRef(0);
  // props は作成時に閉じ込められるため、最新を ref 経由で参照する。
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  const [slideTo] = useState(() => (name) => {
    posRef.current = name;
    setPos(name);
    Animated.spring(y, { toValue: snapsOf(parentHRef.current)[name], useNativeDriver: false, bounciness: 2, speed: 16 })
      .start(() => { if (name === 'closed') onCloseRef.current?.(); });
  });

  useEffect(() => {
    slideTo(visible ? 'half' : 'closed');
    // slideTo は毎回同じ挙動。visible の変化だけで動かす。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const onLayout = (e) => {
    const h = e.nativeEvent.layout.height;
    if (!h || h === parentHRef.current) return;
    parentHRef.current = h;
    setParentH(h);
    // 親の高さが変わったら、いまの停止位置に置き直す
    y.setValue(snapsOf(h)[posRef.current]);
  };

  // ref を読むのはジェスチャの発生時だけで、レンダー中には走らない。
  // useState の初期化関数がレンダー中に呼ばれるため lint が誤検出する。
  // eslint-disable-next-line react-hooks/refs
  const [pan] = useState(() => PanResponder.create({
    // 縦に動かしたときだけ掴む。中の一覧のタップやスクロールを邪魔しない。
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderGrant: () => { dragFrom.current = snapsOf(parentHRef.current)[posRef.current]; },
    onPanResponderMove: (_, g) => y.setValue(Math.max(snapsOf(parentHRef.current).full, dragFrom.current + g.dy)),
    onPanResponderRelease: (_, g) => {
      const snaps = snapsOf(parentHRef.current);
      const at = Math.max(snaps.full, dragFrom.current + g.dy);
      // 速く弾いたときは向きを優先。ゆっくりのときは一番近い停止位置へ。
      if (g.vy > 0.8) return slideTo(posRef.current === 'full' ? 'half' : 'closed');
      if (g.vy < -0.8) return slideTo('full');
      return slideTo(NAMES.reduce((a, b) => (Math.abs(snaps[b] - at) < Math.abs(snaps[a] - at) ? b : a)));
    },
  }));

  const open = visible || pos !== 'closed';
  // 親いっぱいの透明な層で高さを測る。閉じている間も置いておく（開く瞬間に高さが要るため）。
  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill} onLayout={onLayout}>
      {open ? (
        <View
          pointerEvents="box-none"
          style={{ position: 'absolute', left: 0, right: 0, top, height: parentH }}
        >
          <View style={{
            flex: 1, backgroundColor: t.bg1,
            // 下げた分だけ下を空ける。これで一覧とボタンが画面に見える範囲に収まる。
            paddingBottom: snapsOf(parentH)[pos],
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
                <Text style={{ color: t.tx, fontSize: 17, fontWeight: '700', flex: 1 }}>{title}</Text>
                {right}
                <TouchableOpacity onPress={() => slideTo('closed')} style={{ padding: 4 }}>
                  <Text style={{ color: t.ac, fontSize: 15, fontWeight: '600' }}>閉じる</Text>
                </TouchableOpacity>
              </View>
            </View>
            {children}
          </View>
        </View>
      ) : null}
    </View>
  );
}
