// 画面共通の部品。デザイン案「ダッシュボード型」に合わせてある。
//
// 枠線ではなく影で階層を作る。枠線でカードを囲うと画面が箱だらけに見え、
// どれも同じ強さになって主役（純資産）が埋もれる。
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, Keyboard, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useTheme } from '../theme';
import { KEYBOARD_BAR_H } from './KeyboardDone';
import { ScrollWatch, createScrollWatch } from '../store/scrollWatch';

/**
 * @param stickyTop     スクロールしても上に貼り付く領域（切替タブなど）
 * @param stickyBottom  下に貼り付く領域（一括操作など）
 * @param refresh       useSyncRefresh() の戻り値。渡すと下に引っ張って同期できる
 */
// Android はエッジ・ツー・エッジ（android/gradle.properties の edgeToEdgeEnabled）のため、
// adjustResize が効かずキーボードが画面に重なるだけになる。下の欄が隠れて入力できなくなるので、
// 画面の下端にキーボードが重なっている分だけ下に余白を足し、隠れた欄もスクロールで出せるようにする。
// タブバーなど画面の外側にある領域はキーボードに隠れるだけなので、その分は引く。
// measureInWindow の座標はステータスバーの下が原点で、キーボードの座標（screenY）は画面の上端が原点。
// 食い違う分（insets.top）を揃えないと、欄が半分隠れたままになる。
function useAndroidKeyboardOverlap(ref) {
  const insets = useSafeAreaInsets();
  const [h, setH] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const a = Keyboard.addListener('keyboardDidShow', (e) => {
      const top = e.endCoordinates?.screenY;
      if (!ref.current || top == null) return;
      ref.current.measureInWindow((x, y, w, ht) => setH(Math.max(0, Math.round(y + ht - (top - insets.top)))));
    });
    const b = Keyboard.addListener('keyboardDidHide', () => setH(0));
    return () => { a.remove(); b.remove(); };
  }, [ref, insets.top]);
  return h;
}

// Android のエッジ・ツー・エッジでは、タブバーの無い画面（スタックで開く画面）の最下部が
// ナビゲーションバーの下に潜り、最後の行までスクロールしても隠れたままになる。
// タブ内の画面はタブバーが自前で余白を持つので、実際にナビバーへ重なっている分だけ足す。
function useAndroidNavOverlap(ref) {
  const insets = useSafeAreaInsets();
  const [h, setH] = useState(0);
  const measure = () => {
    if (Platform.OS !== 'android' || !ref.current) return;
    ref.current.measureInWindow((x, y, w, ht) => {
      const navTop = Dimensions.get('screen').height - insets.bottom;
      setH(Math.max(0, Math.min(insets.bottom, Math.round(y + insets.top + ht - navTop))));
    });
  };
  return [h, measure];
}

/** 画面のスクロール。ツアーが指す先が画面の外にあるとき、見える所まで送るのに使う（useTourTarget） */
export const ScreenScroll = createContext(null);
// 表に出ている画面のスクロール。画面の多くは useTourTarget を Screen より外（画面の関数の先頭）で呼ぶので、
// 上の文脈が届かない。そのときはこちらを使う（指す先は表に出ている画面にある）
export const focusedScroll = { current: null };
/** ツアーの吹き出しが下端を覆っている高さ（操作を待つ段だけ）。その分、画面の下に余白を足して、隠れた保存ボタンなどをスクロールで出せるようにする */
export const TourCover = createContext(0);
/** ツアーが指している部品を押した知らせ（key）。押した瞬間に次の段へ進めるため（TourProvider が値を入れる） */
export const TourPress = createContext(null);

export function Screen({ children, scroll = true, stickyTop, stickyBottom, refresh, onScrolling }) {
  const t = useTheme();
  const rootRef = useRef(null);
  const kb = useAndroidKeyboardOverlap(rootRef);
  const [nav, measureNav] = useAndroidNavOverlap(rootRef);
  const scrollRef = useRef(null);
  const offsetRef = useRef(0);
  const cover = useContext(TourCover);
  // 画面に近づいたら読み込む広告（LazyAd）へ、スクロールを知らせる
  const [watch] = useState(() => createScrollWatch());
  // キーボードが出たとき、入力中の欄がキーボードの下に隠れていれば、見える位置までスクロールする。
  // 余白を足しただけでは、欄はスクロールしないと出てこず、スクロールするとキーボードが閉じてしまう。
  useEffect(() => {
    if (Platform.OS !== 'android' || !kb) return undefined;
    const id = setTimeout(() => {
      const input = TextInput.State?.currentlyFocusedInput?.();
      if (!input || !rootRef.current) return;
      rootRef.current.measureInWindow((rx, ry, rw, rh) => {
        input.measureInWindow((ix, iy, iw, ih) => {
          const visibleBottom = ry + rh - kb;
          const delta = iy + ih + 16 + KEYBOARD_BAR_H - visibleBottom;
          if (delta > 0) scrollRef.current?.scrollTo({ y: offsetRef.current + delta, animated: true });
        });
      });
    }, 250);
    return () => clearTimeout(id);
  }, [kb]);
  const bg = { flex: 1, backgroundColor: t.bg0, paddingBottom: kb };
  const scroller = useMemo(() => ({
    scrollBy: (dy) => scrollRef.current?.scrollTo({ y: Math.max(0, offsetRef.current + dy), animated: false }),
    getOffset: () => offsetRef.current,
  }), []);
  useFocusEffect(useCallback(() => {
    focusedScroll.current = scroller;
    return () => { if (focusedScroll.current === scroller) focusedScroll.current = null; };
  }, [scroller]));

  const body = scroll
    ? (
      <ScrollView
        ref={scrollRef}
        onScroll={(e) => { offsetRef.current = e.nativeEvent.contentOffset.y; onScrolling?.(); watch.emit(); }}
        scrollEventThrottle={16}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 13, paddingBottom: 40 + (kb || stickyBottom ? 0 : nav) + cover, gap: 11 }}
        refreshControl={refresh?.control}
        // 下へ引くとキーボードも一緒に下がる（iOS）。Android は引いた時点で閉じる
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        keyboardShouldPersistTaps="handled"
      >
        <ScreenScroll.Provider value={scroller}><ScrollWatch.Provider value={watch}>{children}</ScrollWatch.Provider></ScreenScroll.Provider>
      </ScrollView>
    )
    : <View style={{ flex: 1, padding: 13, paddingBottom: 13 + (kb || stickyBottom ? 0 : nav), gap: 11 }}>{children}</View>;

  if (!stickyTop && !stickyBottom) return <View ref={rootRef} collapsable={false} style={bg} onLayout={measureNav}>{body}</View>;

  return (
    <View ref={rootRef} collapsable={false} style={bg} onLayout={measureNav}>
      {stickyTop ? (
        <View style={{ paddingHorizontal: 13, paddingTop: 10, paddingBottom: 8, backgroundColor: t.bg0 }}>
          {stickyTop}
        </View>
      ) : null}
      {body}
      {stickyBottom ? (
        <View style={[{ paddingHorizontal: 13, paddingTop: 9, paddingBottom: 11 + (kb ? 0 : nav), backgroundColor: t.bg1, borderTopWidth: 1, borderTopColor: t.bd }]}>
          {stickyBottom}
        </View>
      ) : null}
    </View>
  );
}

export function Card({ title, children, style }) {
  const t = useTheme();
  return (
    <View style={[{ backgroundColor: t.bg1, borderRadius: 14, padding: 13, gap: 10 }, t.shadow, style]}>
      {title ? <Text style={{ color: t.tx3, fontSize: 13.5, letterSpacing: 0.3, fontWeight: '700' }}>{title}</Text> : null}
      {children}
    </View>
  );
}

/**
 * 主役の数字を置く濃いカード。純資産のように「この画面で一番見たいもの」だけに使う。
 * 乱用すると強調の意味が消えるので、1画面に1枚まで。
 */
export function Hero({ label, value, sub, children, negative, right }) {
  const t = useTheme();
  return (
    <View style={[{ backgroundColor: negative ? t.red : t.hero, borderRadius: 16, padding: 15, gap: 2 }, t.shadow]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ color: t.heroSub, fontSize: 13, flex: 1 }} numberOfLines={1}>{label}</Text>
        {right}
      </View>
      <Text style={{ color: t.heroTx, fontSize: 31, fontWeight: '800', letterSpacing: -0.5 }}
        numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      {sub ? <Text style={{ color: t.heroSub, fontSize: 13 }}>{sub}</Text> : null}
      {children}
    </View>
  );
}

export function Kpi({ label, value, color }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, gap: 3, alignItems: 'center' }}>
      <Text style={{ color: t.tx2, fontSize: 13.5 }}>{label}</Text>
      <Text style={{ color: color || t.tx, fontSize: 18, fontWeight: '700' }}
        numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    </View>
  );
}

/** KPI を横に3つ並べる枠。仕切り線で区切ると数字の対応が読みやすい。 */
export function KpiRow({ children }) {
  const t = useTheme();
  const items = Array.isArray(children) ? children : [children];
  return (
    <View style={{ flexDirection: 'row' }}>
      {items.map((c, i) => (
        <View key={i} style={{ flex: 1, borderLeftWidth: i ? 1 : 0, borderLeftColor: t.bd }}>{c}</View>
      ))}
    </View>
  );
}

export function Button({ label, onPress, variant = 'primary', disabled }) {
  const t = useTheme();
  const primary = variant === 'primary';
  // 取り消せない操作は枠と文字を赤にする。塗りつぶしにはしない。
  // 主操作と同じ重さで並ぶと、押すつもりのないものを押させてしまう。
  const danger = variant === 'danger';
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[{
        backgroundColor: primary ? t.ac : t.bg1,
        borderWidth: primary ? 0 : 1,
        borderColor: danger ? t.red : t.bd2,
        opacity: disabled ? 0.4 : 1,
        borderRadius: 12, paddingVertical: 12, paddingHorizontal: 18, alignItems: 'center',
      }, primary ? t.shadow : null]}
    >
      <Text style={{ color: primary ? t.acTx : danger ? t.red : t.tx2, fontWeight: '700', fontSize: 16 }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export function Field({ label, children }) {
  const t = useTheme();
  return (
    <View style={{ gap: 5 }}>
      <Text style={{ color: t.tx2, fontSize: 13, fontWeight: '600' }}>{label}</Text>
      {children}
    </View>
  );
}

export function Input(props) {
  const t = useTheme();
  return (
    <TextInput
      placeholderTextColor={t.tx3}
      {...props}
      style={[{
        backgroundColor: t.bg3, borderWidth: 1, borderColor: t.bd,
        borderRadius: 10, color: t.tx, fontSize: 17,
        paddingVertical: 11, paddingHorizontal: 12,
      }, props.style]}
    />
  );
}

/**
 * 横スクロールの選択チップ列。件数が少ない選択（種別・タグ・プリセット）に使う。
 * 勘定科目のように数が多いものは AccountPicker（リスト）を使うこと。
 */
export function ChipRow({ options, value, onChange }) {
  const t = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }} keyboardShouldPersistTaps="handled">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <TouchableOpacity
            key={String(o.value)}
            onPress={() => onChange(o.value)}
            style={{
              backgroundColor: on ? t.ac : t.bg3,
              borderRadius: 999, paddingVertical: 7, paddingHorizontal: 13,
            }}
          >
            <Text style={{ color: on ? t.acTx : t.tx2, fontSize: 14.5, fontWeight: on ? '700' : '500' }}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

/** iOS のセグメンテッドコントロール相当。2〜3択の切替に使う。 */
export function Segmented({ options, value, onChange }) {
  const t = useTheme();
  return (
    // ⚠ 地と非選択の差が小さいと、ライト配色でどれが選ばれているか読めない。
    //   非選択にも枠と背景を与えて、押せる範囲を見せる。
    <View style={{ flexDirection: 'row', backgroundColor: t.bg3, borderRadius: 10, padding: 2, gap: 2 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <TouchableOpacity
            key={String(o.value)} onPress={() => onChange(o.value)}
            style={[{ flex: 1, borderRadius: 8, paddingVertical: 7, alignItems: 'center' },
              on
                ? { backgroundColor: t.ac }
                : { backgroundColor: t.bg1, borderWidth: 1, borderColor: t.bd }]}
          >
            <Text style={{ color: on ? t.acTx : t.tx, fontSize: 15, fontWeight: on ? '700' : '600' }}
              numberOfLines={1}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function Empty({ text }) {
  const t = useTheme();
  return <Text style={{ color: t.tx3, fontSize: 15, paddingVertical: 18, textAlign: 'center' }}>{text}</Text>;
}

/**
 * 画面の切り替えタブ。下線で示す。
 * 期間の絞り込み（ChipRow の丸いピル）と役割が違うので、見た目も分ける。
 * 同じ形だと「どちらも絞り込み」に見えて、何を切り替えているのか分からなくなる。
 */
export function UnderlineTabs({ options, value, onChange }) {
  const t = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 18 }} keyboardShouldPersistTaps="handled">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <TouchableOpacity key={String(o.value)} onPress={() => onChange(o.value)}
            style={{ paddingBottom: 7, borderBottomWidth: 2.5, borderBottomColor: on ? t.ac : 'transparent' }}>
            <Text style={{ color: on ? t.tx : t.tx3, fontSize: 16.5, fontWeight: on ? '800' : '600' }}>
              {o.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

/** iOS の設定アプリ風のメニュー。行をタップして次の画面へ進む。 */
export function MenuList({ title, items }) {
  const t = useTheme();
  const tourPress = useContext(TourPress);
  return (
    <View style={{ gap: 6 }}>
      {title ? (
        <Text style={{ color: t.tx3, fontSize: 13.5, fontWeight: '700', letterSpacing: 0.3, paddingHorizontal: 3 }}>
          {title}
        </Text>
      ) : null}
      <View style={[{ backgroundColor: t.bg1, borderRadius: 14, overflow: 'hidden' }, t.shadow]}>
        {items.filter(Boolean).map((it, i) => (
          // ツアーで指す行は tourRef（useTourTarget の戻り値）を渡す。TouchableOpacity は測れないので View で包む
          <View key={it.label} ref={it.tourRef} collapsable={false}>
          <TouchableOpacity
            onPress={it.onPress ? () => { tourPress?.(it.tourRef?.tourKey); it.onPress(); } : undefined}
            disabled={!it.onPress || it.disabled}
            style={[{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, paddingHorizontal: 14 },
              i ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.bd } : null]}
          >
            <View style={{ flex: 1 }}>
              {/* disabled: 押せない行。文字を薄くし、› を出さない（理由は sub に書く） */}
              <Text style={{ color: it.danger ? t.red : it.disabled ? t.tx3 : t.tx, fontSize: 16.5 }}>{it.label}</Text>
              {it.sub ? <Text style={{ color: t.tx3, fontSize: 13.5, marginTop: 2 }}>{it.sub}</Text> : null}
            </View>
            {it.value ? (
              <Text style={{ color: it.alert ? t.red : t.tx2, fontSize: 15 }} numberOfLines={1}>{it.value}</Text>
            ) : null}
            {it.onPress && !it.disabled ? <Text style={{ color: t.tx3, fontSize: 17 }}>›</Text> : null}
          </TouchableOpacity>
          </View>
        ))}
      </View>
    </View>
  );
}

export const sep = (t) => ({ borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.bd });
