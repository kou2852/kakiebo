// 一覧の並び替え。各行の右の ≡ をつかんで、上下へドラッグして順番を変える（2026-10-20 追加）。
//
// ほかの部品と同じく Animated と PanResponder だけで組む（ネイティブ依存を増やさない＝OTA で届く）。
//   ・つかんだ行は指に付いて動き、ほかの行は空いた分だけ上下にずれる（行の高さがばらばらでも合う）
//   ・画面の上下の端へ寄せると、画面を自動でスクロールする（行が多くても端まで運べる）
//   ・離したところで並びが確定する。確定は onChange(新しい id の並び) で親に返す
// 行の中身（renderRow）はタップや左スライドの操作を持たない静的な見た目にする。並び替えの間は、行の操作と競合させない。
import { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, PanResponder, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';
import { focusedScroll, sep } from './ui';
import { dropIndex, moveId } from '../utils/listOrder';

const EDGE_TOP = 150; // 画面の上端からこの距離（ヘッダーの下あたり）に入ったら上へ送る
const EDGE_BOTTOM = 130;
const STEP = 14; // 1フレームに送る量

/** 並び替えの切り替えボタン（一覧の上に右寄せで置く）。件数が1つ以下なら出さない */
export function ReorderToggle({ active, onPress, count = 2 }) {
  const t = useTheme();
  if (count < 2) return null;
  return (
    <View style={{ alignItems: 'flex-end' }}>
      <TouchableOpacity onPress={onPress} accessibilityRole="button"
        style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 4 }}>
        <Ionicons name={active ? 'checkmark' : 'swap-vertical'} size={18} color={t.ac} />
        <Text style={{ color: t.ac, fontSize: 15, fontWeight: '600' }}>{active ? '完了' : '並び替え'}</Text>
      </TouchableOpacity>
    </View>
  );
}

function Row({ item, index, active, dy, shift, api, onHeight, children }) {
  const t = useTheme();
  const idRef = useRef(item.id);
  useEffect(() => { idRef.current = item.id; }, [item.id]);

  // ref を読むのはジェスチャの発生時だけで、レンダー中には走らない（SwipeRow と同じ誤検出）。
  // eslint-disable-next-line react-hooks/refs
  const [pan] = useState(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => api.current.begin(idRef.current),
    onPanResponderMove: (_, g) => api.current.move(g.dy, g.moveY),
    onPanResponderRelease: () => api.current.end(),
    onPanResponderTerminate: () => api.current.end(),
    // 一度つかんだら、画面のスクロールに横取りさせない
    onPanResponderTerminationRequest: () => false,
  }));

  const dragging = active?.id === item.id;
  return (
    <Animated.View
      onLayout={(e) => onHeight(item.id, e.nativeEvent.layout.height)}
      style={[
        { flexDirection: 'row', alignItems: 'center', backgroundColor: t.bg1 },
        sep(t),
        dragging
          ? [{ zIndex: 20, elevation: 8, transform: [{ translateY: dy }] }, t.shadow]
          : { zIndex: 1, transform: [{ translateY: shift }] },
      ]}
    >
      <View style={{ flex: 1 }}>{children}</View>
      <View {...pan.panHandlers} accessibilityLabel={`${index + 1}番目。ドラッグして並び替え`}
        style={{ width: 52, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="reorder-three" size={28} color={dragging ? t.ac : t.tx3} />
      </View>
    </Animated.View>
  );
}

/**
 * @param items 表示している順の項目（{ id } を持つ）
 * @param renderRow (item) => 行の中身（静的な見た目）
 * @param onChange (ids) => 並べ替えたあとの id の並び
 * @param scroller 自動スクロール先（{ scrollBy, getOffset }）。省略すると表に出ている画面（Screen）
 */
export default function ReorderList({ items, renderRow, onChange, scroller }) {
  const heights = useRef({});
  const [active, setActive] = useState(null); // { id, from, to }
  const [dy] = useState(() => new Animated.Value(0));
  const [shifts] = useState(() => new Map());
  const shiftOf = (id) => {
    if (!shifts.has(id)) shifts.set(id, new Animated.Value(0));
    return shifts.get(id);
  };
  const drag = useRef(null);
  const api = useRef({});

  // 最新の items / onChange を、つかんでいる間のイベントから使えるようにする
  useEffect(() => {
    const stop = () => { if (drag.current?.timer) clearInterval(drag.current.timer); };

    const update = () => {
      const d = drag.current;
      if (!d) return;
      // 自動スクロールで画面が動いた分も、つかんだ行の移動に足す（指は同じ場所にあるまま）
      const eff = d.lastDy + ((d.sc?.getOffset?.() ?? 0) - d.startOffset);
      dy.setValue(eff);
      const to = dropIndex(d.hs, d.from, eff);
      if (to === d.to) return;
      d.to = to;
      setActive((a) => (a ? { ...a, to } : a));
      const h = d.hs[d.from];
      items.forEach((x, j) => {
        const target = d.from < to && j > d.from && j <= to ? -h : d.from > to && j >= to && j < d.from ? h : 0;
        Animated.timing(shiftOf(x.id), { toValue: target, duration: 120, useNativeDriver: true }).start();
      });
    };

    const tick = () => {
      const d = drag.current;
      if (!d) return;
      const winH = Dimensions.get('window').height;
      if (d.moveY && d.moveY < EDGE_TOP) d.sc?.scrollBy?.(-STEP);
      else if (d.moveY > winH - EDGE_BOTTOM) d.sc?.scrollBy?.(STEP);
      update();
    };

    api.current = {
      begin: (id) => {
        stop();
        const from = items.findIndex((x) => x.id === id);
        if (from < 0) return;
        const sc = scroller || focusedScroll.current;
        drag.current = {
          id, from, to: from, sc, lastDy: 0, moveY: 0,
          hs: items.map((x) => heights.current[x.id] || 48),
          startOffset: sc?.getOffset?.() ?? 0,
          timer: setInterval(tick, 16),
        };
        dy.setValue(0);
        setActive({ id, from, to: from });
      },
      move: (gy, moveY) => {
        const d = drag.current;
        if (!d) return;
        d.lastDy = gy;
        d.moveY = moveY;
        update();
      },
      end: () => {
        const d = drag.current;
        if (!d) return;
        stop();
        drag.current = null;
        if (d.to !== d.from) onChange(moveId(items.map((x) => x.id), d.from, d.to));
        dy.setValue(0);
        shifts.forEach((v) => v.setValue(0));
        setActive(null);
      },
    };
  });

  // 画面を離れる・並び替えを終えるときに、タイマーを残さない
  useEffect(() => () => { if (drag.current?.timer) clearInterval(drag.current.timer); }, []);

  return (
    <View>
      {items.map((item, index) => (
        <Row key={item.id} item={item} index={index} active={active} dy={dy} shift={shiftOf(item.id)} api={api}
          onHeight={(id, h) => { heights.current[id] = h; }}>
          {renderRow(item)}
        </Row>
      ))}
    </View>
  );
}
