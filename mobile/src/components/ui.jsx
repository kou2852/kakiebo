// 画面共通の部品。デザイン案「ダッシュボード型」に合わせてある。
//
// 枠線ではなく影で階層を作る。枠線でカードを囲うと画面が箱だらけに見え、
// どれも同じ強さになって主役（純資産）が埋もれる。
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../theme';

/**
 * @param stickyTop     スクロールしても上に貼り付く領域（切替タブなど）
 * @param stickyBottom  下に貼り付く領域（一括操作など）
 * @param refresh       useSyncRefresh() の戻り値。渡すと下に引っ張って同期できる
 */
export function Screen({ children, scroll = true, stickyTop, stickyBottom, refresh }) {
  const t = useTheme();
  const bg = { flex: 1, backgroundColor: t.bg0 };

  const body = scroll
    ? (
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 13, paddingBottom: 40, gap: 11 }}
        refreshControl={refresh?.control}
      >
        {children}
      </ScrollView>
    )
    : <View style={{ flex: 1, padding: 13, gap: 11 }}>{children}</View>;

  if (!stickyTop && !stickyBottom) return <View style={bg}>{body}</View>;

  return (
    <View style={bg}>
      {stickyTop ? (
        <View style={{ paddingHorizontal: 13, paddingTop: 10, paddingBottom: 8, backgroundColor: t.bg0 }}>
          {stickyTop}
        </View>
      ) : null}
      {body}
      {stickyBottom ? (
        <View style={[{ paddingHorizontal: 13, paddingTop: 9, paddingBottom: 11, backgroundColor: t.bg1, borderTopWidth: 1, borderTopColor: t.bd }]}>
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
export function Hero({ label, value, sub, children, negative }) {
  const t = useTheme();
  return (
    <View style={[{ backgroundColor: negative ? t.red : t.hero, borderRadius: 16, padding: 15, gap: 2 }, t.shadow]}>
      <Text style={{ color: t.heroSub, fontSize: 13 }}>{label}</Text>
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
    <View style={{ flexDirection: 'row', backgroundColor: t.bg3, borderRadius: 10, padding: 2, gap: 2 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <TouchableOpacity
            key={String(o.value)} onPress={() => onChange(o.value)}
            style={[{ flex: 1, borderRadius: 8, paddingVertical: 7, alignItems: 'center' },
              on ? { backgroundColor: t.ac } : null]}
          >
            <Text style={{ color: on ? t.acTx : t.tx2, fontSize: 15, fontWeight: on ? '700' : '600' }}
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
  return (
    <View style={{ gap: 6 }}>
      {title ? (
        <Text style={{ color: t.tx3, fontSize: 13.5, fontWeight: '700', letterSpacing: 0.3, paddingHorizontal: 3 }}>
          {title}
        </Text>
      ) : null}
      <View style={[{ backgroundColor: t.bg1, borderRadius: 14, overflow: 'hidden' }, t.shadow]}>
        {items.filter(Boolean).map((it, i) => (
          <TouchableOpacity
            key={it.label} onPress={it.onPress} disabled={!it.onPress}
            style={[{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, paddingHorizontal: 14 },
              i ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.bd } : null]}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ color: it.danger ? t.red : t.tx, fontSize: 16.5 }}>{it.label}</Text>
              {it.sub ? <Text style={{ color: t.tx3, fontSize: 13.5, marginTop: 2 }}>{it.sub}</Text> : null}
            </View>
            {it.value ? (
              <Text style={{ color: it.alert ? t.red : t.tx2, fontSize: 15 }} numberOfLines={1}>{it.value}</Text>
            ) : null}
            {it.onPress ? <Text style={{ color: t.tx3, fontSize: 17 }}>›</Text> : null}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

export const sep = (t) => ({ borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.bd });
