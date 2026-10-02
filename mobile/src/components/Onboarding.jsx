// 初回のオンボーディング。画面全体を覆って、口座と残高を登録してもらう。
//
// ⚠ ここは何も保存しない。入力は OnboardingProvider がメモリで持ち、最後の「はじめる」で
//   一度だけ書き込む。途中で保存すると、やめた人の端末に中途半端な口座が残る。
//
// ⚠ ログインへ飛ぶ間はこの覆いを消す。expo-router のモーダル（/connect）はナビゲータの中に
//   出るので、上に覆いが残っていると触れない。戻ってきたら再判定する（取り込み済みなら畳む）。
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo, Alert, Animated, BackHandler, Easing, Image, Keyboard, Platform, Pressable, ScrollView, Text, TextInput, View,
} from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { Button, useDoneBar } from './ui';
import Sparkline from './Sparkline';
import { useOnboarding } from '../store/OnboardingProvider';
import { useAuth } from '../store/AuthProvider';
import { CUSTOM_EXPENSE_ID, KINDS, MONTHLY_PRESETS } from '../store/onboardingPlan';
import { faBal } from '../utils/format';

const ICONS = {
  cash: 'wallet-outline',
  bank: 'business-outline',
  card: 'card-outline',
  emoney: 'phone-portrait-outline',
  invest: 'trending-up-outline',
  loan: 'document-text-outline',
};

/** いま何画面目かを示す点。1〜2画面目と同じものを全画面に置く。 */
function Dots({ index, total }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 }}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={{
          width: i === index ? 20 : 6, height: 6, borderRadius: 3,
          backgroundColor: i === index ? t.ac : t.bd2,
        }} />
      ))}
    </View>
  );
}

function Title({ text, sub }) {
  const t = useTheme();
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: t.tx, fontSize: 26, fontWeight: '800', letterSpacing: -0.3, lineHeight: 34 }}>{text}</Text>
      {sub ? <Text style={{ color: t.tx2, fontSize: 15, lineHeight: 24 }}>{sub}</Text> : null}
    </View>
  );
}

/**
 * 数字を0から数え上げる。純資産が「入れた数字から組み上がる」ことを見せるための動き。
 * 端末で「視差効果を減らす」を選んでいる人には、動かさず最終値をそのまま出す。
 */
function useCountUp(target, { duration = 900, delay = 350 } = {}) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    let alive = true;
    let raf = 0;
    let timer = 0;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (!alive) return;
      if (reduce) { setShown(target); return; }
      timer = setTimeout(() => {
        const t0 = Date.now();
        const tick = () => {
          const p = Math.min(1, (Date.now() - t0) / duration);
          setShown(Math.round(target * (1 - Math.pow(1 - p, 3))));
          if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      }, delay);
    });
    return () => { alive = false; clearTimeout(timer); cancelAnimationFrame(raf); };
  }, [target, duration, delay]);
  return shown;
}

/**
 * 中身を左から現していく（折れ線を「引く」動き）。
 * 地と同じ色の覆いを右へずらして見せる。Sparkline は幅を実測して描くので、
 * 中身の幅を縮めて見せる方法だと線の形が崩れる。
 */
function Reveal({ color, children, delay = 600, duration = 1100 }) {
  const [w, setW] = useState(0);
  const [x] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!w) return undefined;
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (!alive) return;
      if (reduce) { x.setValue(w); return; }
      Animated.timing(x, {
        toValue: w, delay, duration, easing: Easing.out(Easing.cubic), useNativeDriver: true,
      }).start();
    });
    return () => { alive = false; };
  }, [w, x, delay, duration]);
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ overflow: 'hidden' }}>
      {children}
      <Animated.View pointerEvents="none" style={{
        position: 'absolute', top: 0, bottom: 0, left: 0, width: w || '100%',
        backgroundColor: color, transform: [{ translateX: x }],
      }} />
    </View>
  );
}

/**
 * 金額の入力欄。¥ は飾りとして別に置き、値は数字だけを持つ。
 * 枠の強調は TextInput 自身の焦点で決める（親が触れた位置で判断すると、外したとき戻らない）。
 */
function Money({ value, onChange }) {
  const t = useTheme();
  const [on, setOn] = useState(false);
  const done = useDoneBar();
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: on ? t.bg1 : t.bg3,
      borderWidth: on ? 2 : 1, borderColor: on ? t.ac : t.bd,
      borderRadius: 10, paddingHorizontal: on ? 11 : 12,
    }}>
      <Text style={{ color: t.tx3, fontSize: 17 }}>¥</Text>
      {/* 見せるのは桁区切り、持つのは数字だけ。区切りは次の入力で剥がれるので、打ち足しても崩れない。 */}
      <TextInput
        value={value ? Number(value).toLocaleString('ja-JP') : ''}
        onChangeText={(v) => onChange(v.replace(/[^0-9]/g, ''))}
        onFocus={() => setOn(true)}
        onBlur={() => setOn(false)}
        keyboardType="number-pad"
        inputAccessoryViewID={done.id}
        placeholder="0"
        placeholderTextColor={t.tx3}
        style={{
          flex: 1, color: t.tx, fontSize: 17, fontWeight: '600', textAlign: 'right',
          paddingVertical: on ? 10 : 11,
        }}
      />
      {done.bar}
    </View>
  );
}

// ── 各画面 ───────────────────────────────────────────────

// 1画面目の「表示の例」。すべて見本の数字で、利用者の帳簿とは関係ない。
const SAMPLE_TREND = [
  { label: '4月', value: 1512000 },
  { label: '5月', value: 1528400 },
  { label: '6月', value: 1521900 },
  { label: '7月', value: 1575300 },
  { label: '8月', value: 1629620 },
  { label: '9月', value: 1650640 },
];

function Welcome() {
  const t = useTheme();
  const shown = useCountUp(SAMPLE_TREND[SAMPLE_TREND.length - 1].value);
  return (
    <View style={{ gap: 26, marginTop: 16 }}>
      <View style={{ gap: 18 }}>
        <Image source={require('../../assets/icon.png')}
          style={{ width: 84, height: 84, borderRadius: 19 }} />
        <Title text={'純資産まで見える\n家計簿'}
          sub="使ったお金だけでなく、口座・資産・負債までつながって、いまいくら持っているかが分かります。" />
      </View>

      {/* 何が手に入るのかを言葉だけで説明しても伝わらない。実際の画面の形で見せる。 */}
      <View style={{ gap: 6 }}>
        <Text style={{ color: t.tx3, fontSize: 13, fontWeight: '700', letterSpacing: 0.3, paddingHorizontal: 3 }}>
          表示の例
        </Text>
        <View style={[{ backgroundColor: t.hero, borderRadius: 16, padding: 15, gap: 2 }, t.shadow]}>
          <Text style={{ color: t.heroSub, fontSize: 13 }}>純資産（今日）</Text>
          <Text style={{ color: t.heroTx, fontSize: 31, fontWeight: '800', letterSpacing: -0.5 }}>{faBal(shown)}</Text>
          <Text style={{ color: t.heroSub, fontSize: 13 }}>前月比 +¥21,020（+1.3%）</Text>
          <View style={{ marginTop: 8 }}>
            <Reveal color={t.hero}>
              <Sparkline data={SAMPLE_TREND} height={46} color={t.heroTx} labelColor={t.heroSub} />
            </Reveal>
          </View>
        </View>
      </View>
    </View>
  );
}

function Steps() {
  const t = useTheme();
  const rows = [
    ['管理したいお金を選ぶ', '現金・銀行口座・カードなど'],
    ['いまの残高を入れる', '分からなければ空欄のまま進めます'],
    ['毎月決まっているお金', '給料・家賃など（任意）'],
  ];
  return (
    <View style={{ gap: 24, marginTop: 16 }}>
      <Title text={'最初に、管理したい\nお金を登録します'} sub="入れた残高から、いまの純資産を計算します。" />
      <View style={[{ backgroundColor: t.bg1, borderRadius: 14, overflow: 'hidden' }, t.shadow]}>
        {rows.map(([head, sub], i) => (
          <View key={head} style={{
            flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15,
            borderTopWidth: i ? 1 : 0, borderTopColor: t.bd,
          }}>
            <View style={{
              width: 30, height: 30, borderRadius: 15, backgroundColor: t.acb,
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Text style={{ color: t.ac, fontSize: 15, fontWeight: '800' }}>{i + 1}</Text>
            </View>
            <View style={{ gap: 2, flex: 1 }}>
              <Text style={{ color: t.tx, fontSize: 16.5, fontWeight: '700' }}>{head}</Text>
              <Text style={{ color: t.tx3, fontSize: 13.5 }}>{sub}</Text>
            </View>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 4 }}>
        <Ionicons name="shield-checkmark-outline" size={18} color={t.ac} />
        <Text style={{ color: t.tx2, fontSize: 13.5, lineHeight: 20, flex: 1 }}>
          銀行やカードのIDとパスワードは預かりません。
        </Text>
      </View>
    </View>
  );
}

function Pick({ draft, setDraft }) {
  const t = useTheme();
  const toggle = (key) => setDraft((p) => ({
    ...p,
    picks: p.picks.includes(key) ? p.picks.filter((k) => k !== key) : [...p.picks, key],
  }));
  return (
    <View style={{ gap: 24, marginTop: 16 }}>
      <Title text={'どれを\n管理したいですか？'} sub="当てはまるものを選んでください。あとから増やせます。" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {KINDS.map((k) => {
          const on = draft.picks.includes(k.key);
          return (
            <Pressable key={k.key} onPress={() => toggle(k.key)}
              accessibilityRole="checkbox" accessibilityState={{ checked: on }}
              style={[{
                width: '47.5%', flexGrow: 1, minHeight: 98, borderRadius: 14, padding: 13, gap: 8,
                backgroundColor: t.bg1,
                borderWidth: on ? 2 : 1, borderColor: on ? t.ac : t.bd,
              }, on ? null : t.shadow]}>
              <Ionicons name={ICONS[k.key]} size={26} color={on ? t.ac : t.tx2} />
              <View style={{ gap: 2 }}>
                <Text style={{ color: t.tx, fontSize: 16, fontWeight: '700' }}>{k.label}</Text>
                <Text style={{ color: t.tx3, fontSize: 12.5 }}>{k.sub}</Text>
              </View>
              {on ? (
                <View style={{
                  position: 'absolute', top: 10, right: 10, width: 22, height: 22, borderRadius: 11,
                  backgroundColor: t.ac, alignItems: 'center', justifyContent: 'center',
                }}>
                  <Ionicons name="checkmark" size={14} color={t.acTx} />
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function Balance({ draft, setDraft }) {
  const t = useTheme();
  const picked = KINDS.filter((k) => draft.picks.includes(k.key));
  const set = (key) => (v) => setDraft((p) => ({ ...p, balances: { ...p.balances, [key]: v } }));

  if (!picked.length) {
    return (
      <View style={{ gap: 24, marginTop: 16 }}>
        <Title text={'いまの残高を\n入れてください'} sub="前の画面で何も選んでいません。戻って選ぶか、このまま進めます。" />
      </View>
    );
  }
  return (
    <View style={{ gap: 22, marginTop: 16 }}>
      <Title text={'いまの残高を\n入れてください'} sub="分からなければ空欄のまま進めます。あとから直せます。" />
      <View style={{ gap: 11 }}>
        {picked.map((k) => (
          <View key={k.key} style={[{ backgroundColor: t.bg1, borderRadius: 14, padding: 13, gap: 10 }, t.shadow]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
              <Ionicons name={ICONS[k.key]} size={20} color={k.type === 'liability' ? t.red : t.ac} />
              <Text style={{ color: t.tx, fontSize: 16, fontWeight: '700', flex: 1 }}>{k.label}</Text>
            </View>
            {k.type === 'liability' ? (
              <Text style={{ color: t.tx2, fontSize: 13, fontWeight: '600' }}>
                {k.key === 'card' ? '次の引き落とし予定額' : 'いま借りている額'}
              </Text>
            ) : null}
            <Money value={draft.balances[k.key] || ''} onChange={set(k.key)} />
            {k.type === 'liability' ? (
              <Text style={{ color: t.tx3, fontSize: 13, lineHeight: 20 }}>
                借りているお金として、純資産から差し引きます。
              </Text>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}

function Monthly({ draft, setDraft }) {
  const t = useTheme();
  const done = useDoneBar();
  const update = (i, patch) => setDraft((p) => ({
    ...p, monthly: p.monthly.map((m, j) => (j === i ? { ...m, ...patch } : m)),
  }));
  const drop = (i) => setDraft((p) => ({ ...p, monthly: p.monthly.filter((_, j) => j !== i) }));
  const add = (preset) => setDraft((p) => ({
    ...p,
    monthly: [...p.monthly, preset
      ? { key: preset.key, name: preset.name, dir: preset.dir, day: 1, amount: '', accountId: preset.accountId }
      : { key: `c${p.monthly.length}`, custom: true, name: '', dir: 'out', day: 1, amount: '', accountId: CUSTOM_EXPENSE_ID }],
  }));
  const rest = MONTHLY_PRESETS.filter((x) => !draft.monthly.some((m) => m.key === x.key));

  return (
    <View style={{ gap: 20, marginTop: 16 }}>
      <Title text={'毎月決まっている\nお金はありますか？'}
        sub="登録しておくと、その日になったらホームに記帳の予定として表示します。" />

      <View style={{ gap: 11 }}>
        {draft.monthly.map((m, i) => (
          <View key={`${m.key}-${i}`} style={[{ backgroundColor: t.bg1, borderRadius: 14, padding: 13, gap: 10 }, t.shadow]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
              <Ionicons name={m.dir === 'in' ? 'arrow-down-circle-outline' : 'home-outline'}
                size={20} color={m.dir === 'in' ? t.ac : t.red} />
              {/* ⚠ 名前が入っているかで切り替えないこと。自分で入力した項目に1文字入れた
                  とたん固定文字に変わり、直せなくなる。「自分で入力したものか」で決める。 */}
              {m.custom ? (
                <TextInput value={m.name} onChangeText={(v) => update(i, { name: v })}
                  placeholder="名前（例: 携帯電話）" placeholderTextColor={t.tx3}
                  inputAccessoryViewID={done.id}
                  style={{ flex: 1, color: t.tx, fontSize: 16, fontWeight: '700', paddingVertical: 2 }} />
              ) : (
                <Text style={{ color: t.tx, fontSize: 16, fontWeight: '700', flex: 1 }}>{m.name}</Text>
              )}
              <Pressable onPress={() => drop(i)} hitSlop={8}>
                <Text style={{ color: t.tx3, fontSize: 13, fontWeight: '600' }}>外す</Text>
              </Pressable>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ width: 112, gap: 5 }}>
                <Text style={{ color: t.tx2, fontSize: 13, fontWeight: '600' }}>
                  {m.dir === 'in' ? '入る日' : '出る日'}
                </Text>
                <View style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                  backgroundColor: t.bg3, borderWidth: 1, borderColor: t.bd, borderRadius: 10,
                }}>
                  <TextInput
                    value={String(m.day ?? '')}
                    onChangeText={(v) => update(i, { day: Number(v.replace(/[^0-9]/g, '').slice(0, 2)) || '' })}
                    keyboardType="number-pad"
                    inputAccessoryViewID={done.id}
                    style={{ color: t.tx, fontSize: 17, paddingVertical: 11, paddingHorizontal: 4, minWidth: 34, textAlign: 'right' }} />
                  <Text style={{ color: t.tx, fontSize: 17 }}>日</Text>
                </View>
              </View>
              <View style={{ flex: 1, gap: 5 }}>
                <Text style={{ color: t.tx2, fontSize: 13, fontWeight: '600' }}>金額</Text>
                <Money value={m.amount} onChange={(v) => update(i, { amount: v })} />
              </View>
            </View>
          </View>
        ))}
      </View>

      {/* ⚠ 候補を全部足しても「自分で入力」は消さない。候補に無いもの（習い事・駐車場など）を
          足す手段が無くなる。見出しだけは候補が残っているときに出す。 */}
      <View style={{ gap: 8 }}>
        {rest.length ? (
          <Text style={{ color: t.tx3, fontSize: 13.5, fontWeight: '700', letterSpacing: 0.3, paddingHorizontal: 3 }}>
            ほかによくあるもの
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
          {rest.map((p) => (
            <Pressable key={p.key} onPress={() => add(p)} style={{
              flexDirection: 'row', alignItems: 'center', gap: 5,
              backgroundColor: t.bg1, borderWidth: 1, borderColor: t.bd2,
              borderRadius: 999, paddingVertical: 10, paddingLeft: 11, paddingRight: 14,
            }}>
              <Ionicons name="add" size={15} color={t.ac} />
              <Text style={{ color: t.tx, fontSize: 14.5, fontWeight: '600' }}>{p.name}</Text>
            </Pressable>
          ))}
          <Pressable onPress={() => add(null)} style={{ paddingVertical: 10, paddingHorizontal: 4 }}>
            <Text style={{ color: t.ac, fontSize: 14.5, fontWeight: '700' }}>自分で入力</Text>
          </Pressable>
        </View>
      </View>
      {done.bar}
    </View>
  );
}

function Done({ summary }) {
  const t = useTheme();
  const rows = summary.rows.filter((r) => r.amount > 0);
  const netWorth = useCountUp(summary.netWorth);
  return (
    <View style={{ gap: 22, marginTop: 16 }}>
      <Title text="準備ができました" sub="入れた残高から、いまの純資産を計算しました。" />
      <View style={[{ backgroundColor: summary.netWorth < 0 ? t.red : t.hero, borderRadius: 16, padding: 15, gap: 2 }, t.shadow]}>
        <Text style={{ color: t.heroSub, fontSize: 13 }}>純資産（今日）</Text>
        <Text style={{ color: t.heroTx, fontSize: 31, fontWeight: '800', letterSpacing: -0.5 }}
          numberOfLines={1} adjustsFontSizeToFit>{faBal(netWorth)}</Text>
        <Text style={{ color: t.heroSub, fontSize: 13 }}>
          資産 {faBal(summary.assets)} − 負債 {faBal(summary.liabilities)}
        </Text>
      </View>
      {rows.length ? (
        <View style={[{ backgroundColor: t.bg1, borderRadius: 14, padding: 13, gap: 10 }, t.shadow]}>
          <Text style={{ color: t.tx3, fontSize: 13.5, fontWeight: '700', letterSpacing: 0.3 }}>登録した口座</Text>
          <View>
            {rows.map((r, i) => (
              <View key={r.key} style={{
                flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: t.bd,
              }}>
                <Text style={{ color: t.tx2, fontSize: 15 }}>{r.label}</Text>
                <Text style={{ color: r.type === 'liability' ? t.red : t.tx, fontSize: 15, fontWeight: '600' }}>
                  {r.type === 'liability' ? `−${faBal(r.amount)}` : faBal(r.amount)}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

// ── 全体 ─────────────────────────────────────────────────

export default function Onboarding() {
  const t = useTheme();
  const inset = useSafeAreaInsets();
  const router = useRouter();
  const path = usePathname();
  const o = useOnboarding();
  const auth = useAuth();
  const scroller = useRef(null);
  // ログインへ飛んだかどうか。状態にすると効果の中で setState することになるので ref で持つ。
  // 覆いを消すかどうかは、いま開いている画面（path）から直接決める。
  const wentToLogin = useRef(false);

  const { active, step, index, total, draft, setDraft, summary, saving, next, back, skip, finish, checkAfterLogin } = o || {};

  // 画面が変わったら先頭から読ませる。前の画面の途中位置が残ると、見出しを見落とす。
  useEffect(() => { scroller.current?.scrollTo({ y: 0, animated: false }); }, [index]);

  /**
   * キーボードの分だけ下を空ける。
   *
   * ⚠ AndroidManifest に adjustResize は入っているが効かない。Expo SDK 54 は全画面表示が
   *   既定で、その下では窓が縮まずインセットで伝わる。実機（API 35）で「次へ」が
   *   キーボードに完全に隠れた。窓が縮む経路は無いので、高さをそのまま足してよい。
   */
  const [kb, setKb] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => setKb(e.endCoordinates?.height || 0));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKb(0));
    return () => { show.remove(); hide.remove(); };
  }, []);

  // ログインから戻ってきた。取り込み済みならオンボーディングは畳む。
  useEffect(() => {
    if (!wentToLogin.current || path === '/connect') return;
    wentToLogin.current = false;
    checkAfterLogin?.();
  }, [path, checkAfterLogin]);

  const goLogin = useCallback(() => { wentToLogin.current = true; router.push('/connect'); }, [router]);

  // 「あとで」の確認。OS の Alert を使わず画面内のシートで聞く。
  // ⚠ Android の Alert は style: 'destructive' を無視するので、「やめる」が主操作と同じ色になる。
  //   取り消せない操作（ここまでの入力が消える）を見分けられないので、自前で描く。
  const [asking, setAsking] = useState(false);
  const onSkip = useCallback(() => { Keyboard.dismiss(); setAsking(true); }, []);

  /**
   * Android の戻るキーを画面左上の戻ると揃える。
   * ⚠ 何もしないと、覆いの下にある画面の戻るとして扱われ、途中の画面でもアプリが閉じる。
   *   1画面目だけは戻る先が無いので、これまでどおり OS に任せる（アプリを閉じる）。
   */
  useEffect(() => {
    if (!active || path === '/connect') return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (asking) { setAsking(false); return true; }
      if (index > 0) { back(); return true; }
      return false;
    });
    return () => sub.remove();
  }, [active, path, asking, index, back]);

  const onFinish = useCallback(() => {
    finish().catch(() => Alert.alert('保存できませんでした', '通信は要りません。もう一度お試しください。'));
  }, [finish]);

  // ログイン画面（モーダル）が開いている間は覆いを外す。上に残っていると触れない。
  if (!active || path === '/connect') return null;

  const last = step === 'done';
  const body = step === 'welcome' ? <Welcome />
    : step === 'steps' ? <Steps />
      : step === 'pick' ? <Pick draft={draft} setDraft={setDraft} />
        : step === 'balance' ? <Balance draft={draft} setDraft={setDraft} />
          : step === 'monthly' ? <Monthly draft={draft} setDraft={setDraft} />
            : <Done summary={summary} />;

  return (
    <>
    <View style={{
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: t.bg0,
      paddingTop: inset.top, paddingBottom: Math.max(inset.bottom, 16) + kb,
    }}>
      <View style={{
        height: 44, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      }}>
        {/* 戻るは2画面目から。入れた内容は OnboardingProvider が持っているので、戻っても消えない。 */}
        {index > 0 ? (
          <Pressable onPress={back} hitSlop={12} accessibilityRole="button" accessibilityLabel="戻る"
            style={{ paddingVertical: 8, marginLeft: -6 }}>
            <Ionicons name="chevron-back" size={26} color={t.tx} />
          </Pressable>
        ) : <View />}
        {last ? null : (
          <Pressable onPress={onSkip} hitSlop={10} style={{ paddingVertical: 10 }}>
            <Text style={{ color: t.tx3, fontSize: 15, fontWeight: '600' }}>あとで</Text>
          </Pressable>
        )}
      </View>

      <ScrollView ref={scroller} style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}>
        {body}
      </ScrollView>

      <View style={{ paddingHorizontal: 20, paddingTop: 12, gap: 18 }}>
        <Dots index={index} total={total} />
        <View style={{ gap: 12 }}>
          {/* 最初と最後だけ「はじめる」。最初は登録を始める合図、最後は帳簿を使い始める合図。 */}
          <Button label={last || step === 'welcome' ? 'はじめる' : '次へ'} onPress={last ? onFinish : next} disabled={saving} />
          {/* ログインはボタンの下。並べて大きく出すと、登録が要るように見える。 */}
          {/* ログイン済み（ログインしたが空のアカウントだった・新規登録した）ならログインは勧めない。 */}
          {step === 'welcome' && auth?.signedIn ? (
            <Text style={{ color: t.tx3, fontSize: 14, textAlign: 'center', paddingVertical: 4 }} numberOfLines={1}>
              {auth.email}でログイン中
            </Text>
          ) : step === 'welcome' ? (
            <Pressable onPress={goLogin} style={{ paddingVertical: 4 }}>
              <Text style={{ color: t.ac, fontSize: 14.5, fontWeight: '600', textAlign: 'center' }}>
                アカウントをお持ちの方はログイン
              </Text>
            </Pressable>
          ) : null}
          {last ? (
            <Text style={{ color: t.tx3, fontSize: 13, textAlign: 'center' }}>
              毎月の給料や家賃は、設定からいつでも登録できます
            </Text>
          ) : null}
        </View>
      </View>
    </View>

    {/* 覆いの外に兄弟として置く。覆いは下にキーボード分の余白を持つので、中に入れると浮いて見える。 */}
    {asking ? (
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
        <Pressable onPress={() => setAsking(false)} style={{ flex: 1, backgroundColor: 'rgba(12,18,24,0.5)' }}
          accessibilityLabel="閉じる" />
        <View style={[{
          backgroundColor: t.bg1, borderTopLeftRadius: 18, borderTopRightRadius: 18,
          paddingHorizontal: 20, paddingTop: 12, paddingBottom: Math.max(inset.bottom, 16) + 18, gap: 14,
        }, t.shadow]}>
          <View style={{ width: 38, height: 4, borderRadius: 2, backgroundColor: t.bd2, alignSelf: 'center' }} />
          <Text style={{ color: t.tx, fontSize: 21, fontWeight: '800', letterSpacing: -0.2, marginTop: 4 }}>
            登録をやめますか？
          </Text>
          <Text style={{ color: t.tx2, fontSize: 15, lineHeight: 24 }}>
            ここまで入れた内容は保存されません。口座も残高も、あとから設定でいつでも登録できます。
          </Text>
          <View style={{ gap: 4, marginTop: 4 }}>
            <Button label="登録を続ける" onPress={() => setAsking(false)} />
            <Pressable onPress={() => { setAsking(false); skip(); }} style={{ paddingVertical: 14 }}>
              <Text style={{ color: t.red, fontSize: 15.5, fontWeight: '700', textAlign: 'center' }}>やめる</Text>
            </Pressable>
          </View>
        </View>
      </View>
    ) : null}
    </>
  );
}
