// ホームのモーダル。オンボーディングのあと、何を設定するとホームのどこが動くかを見せる（2026-10-17 決定。案は v2）。
//
//   1枚目 全体図（ホームの見本の各所に、どの設定で動くかの番号）
//   2枚目から 設定1つにつき1枚（ここで入れる → ホームのここが変わる）
//     ① 口座と現金の設定 ② カードの設定 ③ 記帳 ④ タグ ⑤ 毎月のお金（ツアーの①〜⑤と同じ名前）
//
// ・ホームの上に重ねるカード。全画面は覆わない（後ろにホームを暗くして見せる）
// ・カードは1枚で動かさず、カードの中の中身を横にスライドして送る（2026-10-17 指示）。とばす・点・ボタンはカードに固定
// ・1枚に見本1つと短い見出しだけ。縦にスクロールさせない（低い画面だけ、カードの中で縦に送れる）
// ・最後の1枚で「ツアーで①から設定する」か「あとで」を選ぶ。ツアーの入口はホーム右上の「使い方」にも残す
// ・進み具合（済みの印）は出さない（8-11）。見本の数字は作り物
// ・出すのはオンボーディングを終えた・飛ばした直後だけ。今の利用者には出さない（8-2。印は OnboardingProvider）。
//   出している間、通知の許可と更新の案内は待つ（NotificationSync・UpdatePrompt）
//
// オンボーディング（Onboarding.jsx）と同じく、AppLock の内側に重ねて置く。
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, BackHandler, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { Button } from './ui';
import PieChart from './PieChart';
import PageDots from './PageDots';
import { useOnboarding } from '../store/OnboardingProvider';
import { useTour } from '../store/TourProvider';
import { useData } from '../store/DataProvider';
import { balanceSheet } from '../utils/bookkeeping';
import { today } from '../utils/format';
import { useMoney } from '../store/hideAmounts';
import { trackStage } from '../track';
import { SETUP } from '../tours';

const SIDE = 24;       // 画面の端からカードまで
const PAD = 16;        // カードの内側の左右の余白（中身の1ページの幅は、カードの幅からこれを引いた分）
const MAX_H = 590;

// 設定の並びは tours.js の SETUP（2026-10-15 決定）。カードは記帳の前。カードで払った記帳を、締め日を入れる前にしないため。
// ツアーも同じ並び・同じ名前にしてある
const CIRCLED = ['①', '②', '③', '④', '⑤'];

// ── 部品 ─────────────────────────────────────────────────

/** 番号の丸 */
function Num({ n, size = 30 }) {
  const t = useTheme();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: t.ac, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: t.acTx, fontSize: size * 0.5, fontWeight: '800' }}>{n}</Text>
    </View>
  );
}

/** 全体図の、どの設定で動くかの札 */
function Badge({ n, label, light }) {
  const t = useTheme();
  return (
    <View style={{ backgroundColor: light ? t.bg1 : t.ac, borderRadius: 999, paddingVertical: 2, paddingHorizontal: 8 }}>
      <Text style={{ color: light ? t.ac : t.acTx, fontSize: 11.5, fontWeight: '800' }}>{`${CIRCLED[n - 1]} ${label}`}</Text>
    </View>
  );
}

/** 見本を置く地 */
function Well({ children, style }) {
  const t = useTheme();
  return <View style={[{ backgroundColor: t.bg3, borderRadius: 14, padding: 11, gap: 7 }, style]}>{children}</View>;
}

/** 白い小さなカード（ホームのカードの縮小）。on で枠を付けて強調する */
function Mini({ children, on, color, style }) {
  const t = useTheme();
  return (
    <View style={[{
      backgroundColor: t.bg1, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10, gap: 5,
      borderWidth: on ? 2 : 0, borderColor: color || t.ac,
    }, style]}>{children}</View>
  );
}

/** 入れる欄の見本（枠で強調） */
function FieldMock({ label, value, color }) {
  const t = useTheme();
  const c = color || t.ac;
  return (
    <View style={{ backgroundColor: t.bg1, borderWidth: 2, borderColor: c, borderRadius: 10, paddingVertical: 7, paddingHorizontal: 11,
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
      <Text style={{ color: c, fontSize: 13, fontWeight: '700' }}>{label}</Text>
      <Text style={{ color: t.tx, fontSize: 15.5, fontWeight: '800' }} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function Small({ children, color, bold }) {
  const t = useTheme();
  return <Text style={{ color: color || t.tx2, fontSize: 12, fontWeight: bold ? '700' : '400' }}>{children}</Text>;
}

/** 設定1つの1枚。上に「ここで入れる」、矢印のあとに「ホームのここが変わる」 */
function Step({ n, title, where, setting, result, effect, note }) {
  const t = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <Num n={n} />
        <Text style={{ color: t.tx, fontSize: 20, fontWeight: '800', flex: 1 }}>{title}</Text>
      </View>
      <Small bold>{`ここで入れる：${where}`}</Small>
      <Well>{setting}</Well>
      <View style={{ alignItems: 'center', paddingVertical: 2 }}>
        <Ionicons name="arrow-down" size={24} color={t.ac} />
      </View>
      <Small bold>{result}</Small>
      <Well>{effect}</Well>
      {note ? <Text style={{ color: t.tx2, fontSize: 12.5, marginTop: 2 }}>{note}</Text> : null}
    </View>
  );
}

// ── 各枚 ─────────────────────────────────────────────────

function Overview({ nums, netWorth }) {
  const t = useTheme();
  const { faBal } = useMoney(); // ホームの「金額を隠す」に合わせる
  const c = t.pie;
  const count = Object.keys(nums).length;
  return (
    <View style={{ gap: 10 }}>
      <Text style={{ color: t.tx, fontSize: 20, fontWeight: '800', lineHeight: 28 }}>{`${count}つ設定すると、\nホームが動きます`}</Text>
      <Well>
        <View style={{ backgroundColor: netWorth < 0 ? t.red : t.hero, borderRadius: 10, padding: 10, flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.heroSub, fontSize: 11 }}>純資産（今日）</Text>
            <Text style={{ color: t.heroTx, fontSize: 18, fontWeight: '800' }} numberOfLines={1}>{faBal(netWorth)}</Text>
          </View>
          <Badge n={nums.opening} label="口座と現金の設定" light />
        </View>
        <Mini>
          <Small bold>未記帳の自動取引</Small>
          {nums.card ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ color: t.tx, fontSize: 12.5 }}>カードの引き落とし</Text>
              <Badge n={nums.card} label="カードの設定" />
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: t.tx, fontSize: 12.5 }}>家賃</Text>
            <Badge n={nums.monthly} label="毎月のお金" />
          </View>
        </Mini>
        <Mini style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <PieChart size={38} items={[{ label: 'a', value: 6, color: c[0] }, { label: 'b', value: 3, color: c[1] }, { label: 'c', value: 2, color: c[2] }]} />
          <View style={{ flex: 1 }}><Small bold>支出内訳・口座の残高</Small></View>
          <Badge n={nums.journal} label="記帳" />
        </Mini>
        <Mini>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Small bold>資産の使いみち</Small>
            <Badge n={nums.tag} label="タグ" />
          </View>
          <View style={{ flexDirection: 'row', height: 10, borderRadius: 3, overflow: 'hidden' }}>
            <View style={{ flex: 2, backgroundColor: c[0] }} />
            <View style={{ flex: 1, backgroundColor: c[1] }} />
            <View style={{ flex: 3, backgroundColor: t.tx3 }} />
          </View>
        </Mini>
      </Well>
      <Text style={{ color: t.tx2, fontSize: 14 }}>1つずつ見ていきます。</Text>
    </View>
  );
}

function Opening({ n }) {
  const t = useTheme();
  return (
    <Step n={n} title="口座と現金の設定" where="設定 › 口座・カード"
      setting={<>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ color: t.tx2, fontSize: 14 }}>口座</Text>
          <Text style={{ color: t.tx, fontSize: 14, fontWeight: '700' }}>銀行口座</Text>
        </View>
        <FieldMock label="いまの残高" value="¥300,000" />
      </>}
      result="純資産が変わる"
      effect={
        <View style={{ backgroundColor: t.hero, borderRadius: 12, padding: 12 }}>
          <Text style={{ color: t.heroSub, fontSize: 12 }}>純資産（今日）</Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
            <Text style={{ color: t.heroSub, fontSize: 15, textDecorationLine: 'line-through' }}>¥0</Text>
            <Text style={{ color: t.heroTx, fontSize: 26, fontWeight: '800' }}>¥300,000</Text>
          </View>
        </View>
      } />
  );
}

function Card({ n }) {
  const t = useTheme();
  return (
    <Step n={n} title="カードの設定" where="口座・カード › カードを押す"
      setting={<>
        <View style={{ flexDirection: 'row', gap: 7 }}>
          <View style={{ flex: 1 }}><FieldMock label="締め日" value="15日" /></View>
          <View style={{ flex: 1 }}><FieldMock label="引落日" value="10日" /></View>
        </View>
        <FieldMock label="引落口座" value="銀行口座" />
      </>}
      result="引き落とし日に、ホームに出る"
      effect={
        <Mini on>
          <Small bold>未記帳の自動取引</Small>
          <Text style={{ color: t.red, fontSize: 15, fontWeight: '700' }}>カードの引き落とし 1件（¥30,000）</Text>
        </Mini>
      } />
  );
}

function Journal({ n }) {
  const t = useTheme();
  const c2 = t.pie[1];
  return (
    <Step n={n} title="記帳する" where="下の ＋"
      setting={<>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 2 }}>
          <Text style={{ color: t.tx2, fontSize: 14 }}>金額</Text>
          <Text style={{ color: t.tx, fontSize: 14, fontWeight: '800' }}>¥1,200</Text>
        </View>
        <FieldMock label="費目" value="食費" />
        <FieldMock label="支払方法" value="銀行口座" color={c2} />
      </>}
      result="支出内訳と口座の残高が変わる"
      effect={
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Mini on style={{ flex: 1 }}>
            <Small bold color={t.ac}>支出内訳</Small>
            <PieChart size={44} items={[{ label: '食費', value: 1, color: t.ac }]} />
            <Text style={{ color: t.tx, fontSize: 12.5, fontWeight: '700' }}>食費 ¥1,200</Text>
          </Mini>
          <Mini on color={c2} style={{ flex: 1 }}>
            <Small bold color={c2}>口座の残高</Small>
            <Text style={{ color: t.tx3, fontSize: 12, textDecorationLine: 'line-through' }}>¥300,000</Text>
            <Text style={{ color: t.tx, fontSize: 16, fontWeight: '800' }}>¥298,800</Text>
          </Mini>
        </View>
      } />
  );
}

function Tag({ n }) {
  const t = useTheme();
  const c = t.pie;
  return (
    <Step n={n} title="タグで目的を分ける" where="設定 › タグ配分"
      setting={<>
        <Text style={{ color: t.tx2, fontSize: 13 }}>銀行口座 ¥300,000 のうち</Text>
        <FieldMock label="生活費" value="¥100,000" />
        <FieldMock label="旅行" value="¥50,000" color={c[1]} />
      </>}
      result="ホームに「資産の使いみち」が出る"
      effect={
        <Mini on>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ color: t.tx, fontSize: 13.5, fontWeight: '700' }}>銀行口座</Text>
            <Text style={{ color: t.tx, fontSize: 13.5, fontWeight: '800' }}>¥300,000</Text>
          </View>
          <View style={{ flexDirection: 'row', height: 14, borderRadius: 4, overflow: 'hidden' }}>
            <View style={{ flex: 2, backgroundColor: c[0] }} />
            <View style={{ flex: 1, backgroundColor: c[1] }} />
            <View style={{ flex: 3, backgroundColor: t.tx3 }} />
          </View>
          <Small>生活費・旅行・未配分</Small>
        </Mini>
      }
      note="記帳でタグを選ぶと、その目的の残りが減ります。" />
  );
}

function Monthly({ n }) {
  const t = useTheme();
  return (
    <Step n={n} title="毎月のお金を入れる" where="設定 › 定期取引"
      setting={
        <View style={{ backgroundColor: t.bg1, borderWidth: 2, borderColor: t.ac, borderRadius: 10, paddingVertical: 7, paddingHorizontal: 11,
          flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <Text style={{ color: t.tx, fontSize: 15, fontWeight: '700' }}>家賃</Text>
            <Small>毎月27日・銀行口座から</Small>
          </View>
          <Text style={{ color: t.tx, fontSize: 16, fontWeight: '800' }}>¥80,000</Text>
        </View>
      }
      result="予定日に、ホームに出る"
      effect={
        <Mini on>
          <Small bold>未記帳の自動取引</Small>
          <Text style={{ color: t.tx, fontSize: 15, fontWeight: '700' }}>定期取引 1件（家賃）</Text>
        </Mini>
      } />
  );
}

const BODY = { opening: Opening, card: Card, journal: Journal, tag: Tag, monthly: Monthly };

// ── 全体 ─────────────────────────────────────────────────

export default function HomeIntro() {
  const t = useTheme();
  const inset = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const path = usePathname();
  const o = useOnboarding();
  const tour = useTour();
  const { accounts, journals } = useData();
  const [index, setIndex] = useState(0);
  const pager = useRef(null);
  const [scrollX] = useState(() => new Animated.Value(0));

  const show = !!o?.intro && !o?.active && path === '/' && !tour?.tourId;

  // カードの有無で出し分けない。誰にも①〜⑤の5枚を出す（2026-10-18 指示。使い方の画面の番号と同じ）
  const steps = SETUP;
  const nums = useMemo(() => Object.fromEntries(SETUP.map((k, i) => [k, String(i + 1)])), []);
  const netWorth = useMemo(() => balanceSheet(journals, accounts, today()).netWorth, [journals, accounts]);

  const total = steps.length + 1;
  const cardW = width - SIDE * 2;
  const step = cardW - PAD * 2; // 中身の1ページの幅
  const cardH = Math.min(MAX_H, height - inset.top - inset.bottom - 48);

  const goTo = (i) => {
    const k = Math.max(0, Math.min(total - 1, i));
    pager.current?.scrollTo({ x: k * step, animated: true });
    setIndex(k);
  };
  const close = () => { setIndex(0); o?.closeIntro?.(); };
  const toTours = () => {
    trackStage('m_intro_tour'); // 「ツアー」を選んだ（新しく入れた端末だけ。src/track.js）
    close();
    tour?.start('opening');
  };

  // Android の戻るキーは前の1枚へ。1枚目では閉じる（下のホームを戻らせない）
  useEffect(() => {
    if (!show) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (index > 0) goTo(index - 1); else close();
      return true;
    });
    return () => sub.remove();
    // goTo・close は毎回作り直すが、中で使うものは index と closeIntro だけ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, index]);

  if (!show) return null;

  const pages = [
    <Overview key="overview" nums={nums} netWorth={netWorth} />,
    ...steps.map((k) => { const B = BODY[k]; return <B key={k} n={nums[k]} />; }),
  ];

  const last = index >= total - 1;
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(12,18,24,0.55)', justifyContent: 'center', alignItems: 'center' }}>
      <View style={[{
        width: cardW, height: cardH,
        backgroundColor: t.bg1, borderRadius: 22, paddingHorizontal: PAD, paddingTop: 10, paddingBottom: 14,
      }, t.shadow]}>
        <View style={{ height: 36, alignItems: 'flex-end', justifyContent: 'center' }}>
          {!last ? (
            <Pressable onPress={() => goTo(total - 1)} hitSlop={10} accessibilityRole="button">
              <Text style={{ color: t.tx3, fontSize: 15, fontWeight: '600' }}>とばす</Text>
            </Pressable>
          ) : null}
        </View>
        {/* 中身だけを横に送る。カードの外へ出た分は見せない */}
        <View style={{ flex: 1, overflow: 'hidden' }}>
          <Animated.ScrollView ref={pager} horizontal pagingEnabled showsHorizontalScrollIndicator={false}
            onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: false })}
            scrollEventThrottle={16}
            onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / step))}
            style={{ flex: 1 }}>
            {pages.map((body, i) => (
              <View key={i} style={{ width: step }}>
                {/* 低い画面だけ、中で縦に送れる。ふつうの画面では収まる */}
                <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} nestedScrollEnabled>{body}</ScrollView>
              </View>
            ))}
          </Animated.ScrollView>
        </View>
        <View style={{ gap: 10, paddingTop: 10 }}>
          <PageDots count={pages.length} x={scrollX} step={step} active={20} />
          {!last ? (
            <Button label="次へ" onPress={() => goTo(index + 1)} />
          ) : (
            <View>
              <Button label="ツアーで①から設定する" onPress={toTours} />
              <Pressable onPress={close} style={{ paddingVertical: 10 }} accessibilityRole="button">
                <Text style={{ color: t.tx2, fontSize: 15, fontWeight: '700', textAlign: 'center' }}>あとで</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}
