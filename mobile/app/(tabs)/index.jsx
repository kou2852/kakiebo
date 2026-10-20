// ダッシュボード。デザイン案「ダッシュボード型」の構成。
//
// 主役は純資産。濃いヒーローカード＋推移の折れ線を最上部に置き、それ以外は白いカードに落とす。
// 資産管理がテーマなので、いくら使ったかより「いま資産がいくらで、増えているか」が先に来る。
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useData } from '../../src/store/DataProvider';
import { useTheme } from '../../src/theme';
import { Button, Card, Empty, Hero, Kpi, KpiRow, Screen } from '../../src/components/ui';
import PeriodBar, { usePeriod } from '../../src/components/PeriodBar';
import Breakdown from '../../src/components/Breakdown';
import TagUsage from '../../src/components/TagUsage';
import Sparkline from '../../src/components/Sparkline';
import { today } from '../../src/utils/format';
import { setHideAmounts, useMoney } from '../../src/store/hideAmounts';
import { Ionicons } from '@expo/vector-icons';
import {
  accountBalance, balanceDate, balanceSheet, calcBalances, filterByPeriod, getPeriodRange,
  isCashAccount, isInvestmentAsset, investmentSummary, monthlyTrend, netWorthTrend,
} from '../../src/utils/bookkeeping';
import { dueRecurring, pendingCC } from '../../src/utils/autoGen';
import { useTour, useTourTarget } from '../../src/store/TourProvider';
import { useHomeLayout } from '../../src/store/homeLayout';
import { useOnboarding } from '../../src/store/OnboardingProvider';
import LazyAd from '../../src/components/LazyAd';
import HomeAdFree from '../../src/components/HomeAdFree';
import { setNetWorthSets, useNetWorthSets } from '../../src/store/netWorthSets';
import { accountsFor, selectSet, shownPages } from '../../src/utils/netWorthSets';
import PageDots from '../../src/components/PageDots';

export default function Dashboard() {
  // ツアーで指し示す位置。要素そのものではなく囲みの View に付ける
  // （Hero や PeriodBar は ref を受け取らないため）。
  const netWorthRef = useTourTarget('networth');
  const breakdownRef = useTourTarget('home-breakdown');
  const pendingRef = useTourTarget('home-pending');
  const openRecRef = useTourTarget('home-recurring-open');
  const accountsRef = useTourTarget('home-accounts');
  const t = useTheme();
  const router = useRouter();
  const onboarding = useOnboarding();
  const tour = useTour();
  // 出す項目と並び（設定の「ホームの表示」。端末ごと）
  const layout = useHomeLayout();
  const { loading, accounts, journals, budgets, recurring, wallets } = useData();
  // 純資産に入れる科目の組み合わせ（設定の「純資産に入れる科目」。端末ごと）。変わるのは純資産・推移・前月比だけ。
  // 純資産のカードは、設定で選んだ組み合わせ（「すべての科目」を含めて最大5つ）を横にスライドして見比べる。止めたページを覚える
  const nwState = useNetWorthSets();
  // 金額を隠しているか（純資産のカードの目のボタン。端末ごと）。隠しているときは fa などが伏せ字を返す
  const { hidden, fa, faBal, fas } = useMoney();
  const nwPages = useMemo(() => shownPages(nwState), [nwState]);
  const nwIndex = Math.max(0, nwPages.findIndex((x) => (x ? x.id : null) === nwState.active));
  const { width: winW } = useWindowDimensions();
  // 1ページの幅は画面の幅。カードは左右に Screen と同じ余白（13）を取って置く。
  // ページの幅をカードの幅にすると、送る幅（画面の幅）とずれて、隣のカードの端がはみ出した（実測）
  const heroW = winW;
  const [heroX] = useState(() => new Animated.Value(nwIndex * heroW));
  // スクロール中か（右下の「広告を消す」を、動かしている間は消し、止まったら出す）。止まりは最後の動きから 0.25 秒で判断する
  const [scrolling, setScrolling] = useState(false);
  const stopTimer = useRef(null);
  const onScrolling = () => {
    setScrolling(true);
    clearTimeout(stopTimer.current);
    stopTimer.current = setTimeout(() => setScrolling(false), 250);
  };
  useEffect(() => () => clearTimeout(stopTimer.current), []);
  // 設定の画面で選び直したら、そのページへ送る（contentOffset は iOS では最初の1回しか効かない）
  const heroPager = useRef(null);
  useEffect(() => { heroPager.current?.scrollTo({ x: nwIndex * heroW, animated: false }); }, [nwIndex, heroW]);

  // 収支は「期間中」、純資産と口座残高は「期間末の時点」（2026-09-15 決定）。
  //   今日: 今月1日〜今日。純資産は今日時点の実際の残高。
  //   今月: 1日〜月末。純資産は先日付の仕訳（前もって作った定期取引など）も含めた月末の見込み。
  // 既定は「今日」。開いてすぐ目に入る純資産を、見込みではなく実際の残高にするため。
  const period = usePeriod('today');

  const m = useMemo(() => {
    const { start, end } = period;
    // ⚠ 収支を今日で打ち切らない。以前は時点残高のために今日で切った日付を収支にも使っていて、
    //    「今月」を選んでも今日までしか集計されていなかった（画面には月末までと出ていた）。
    const asOf = balanceDate(period.mode, end, today());

    const flow = calcBalances(filterByPeriod(journals, start, end), accounts);
    const sum = (type, bal) => accounts.filter((a) => a.type === type)
      .reduce((s, a) => s + accountBalance(a.id, accounts, bal), 0);

    const expenses = accounts
      .filter((a) => a.type === 'expense')
      .map((a) => ({ id: a.id, name: a.name, amount: accountBalance(a.id, accounts, flow) }))
      .filter((x) => x.amount > 0)
      .sort((a, b) => b.amount - a.amount);

    const income = sum('income', flow);
    const expense = sum('expense', flow);
    return { income, expense, balance: income - expense, expenses, asOf };
  }, [accounts, journals, period]);

  // 口座別の残高。売掛金や固定資産まで並べても「どこにいくらあるか」は分からないので、
  // 口座として登録したものに絞る。登録が無ければ現金・預金の科目で代用する。
  // カードはここに出さない。負債であって「どこにいくらあるか」の答えにならないうえ、
  // 利用状況・締め・引落は専用のクレジット画面で見るほうが正確に分かる。
  // 時点は純資産と同じ（今日なら今日、今月なら月末の見込み）。
  const byAccount = useMemo(() => {
    const asOf = balanceDate(period.mode, period.end, today());
    const bal = calcBalances(journals.filter((j) => j.date <= asOf), accounts);
    const walletIds = new Set((wallets || []).map((w) => w.accountId));
    // ⚠ 資産だけに限る。口座を1つでも登録すると「口座に紐づく科目」を全部出す作りだったため、
    //    カードの口座を作った人にはカードがここに並び、しかも負債の残高が符号なしで出ていた
    //    （借りている 48,000 が「48,000 ある」と読める）。上のコメントの意図どおりに絞る。
    // 投資の口座は「投資資産」のカードに出る。ここにも並べると二重になる（2026-10-19）
    const target = (a) => a.type === 'asset' && !isInvestmentAsset(a) && (walletIds.size ? walletIds.has(a.id) : isCashAccount(a));
    return accounts
      .filter(target)
      .map((a) => ({ id: a.id, name: a.name, type: a.type, amount: accountBalance(a.id, accounts, bal) }))
      .filter((x) => x.amount !== 0)
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  }, [accounts, journals, wallets, period]);

  // 未記帳の自動取引。放置すると帳簿が実態からずれるので、開いてすぐ見える場所に置く。
  // カードの引落を記帳しないと負債が減らず、貸借対照表の数字が合わなくなる。
  const dueCards = useMemo(() => pendingCC(accounts, journals).filter((x) => x.due), [accounts, journals]);
  const dueRec = useMemo(() => dueRecurring(recurring, journals), [recurring, journals]);

  // 推移は必ず純資産と同じ時点を基準にする。ここを今日で固定していたため、
  // 期間を先月に変えても純資産だけ動いて前月比が変わらなかった。
  // 組み合わせごとの純資産と推移（純資産のカードの各ページ）。借方残の負債は資産側へ振り替えて集計する（詳細は balanceSheet のコメント）
  const nw = useMemo(() => nwPages.map((set) => {
    const accs = accountsFor(accounts, set);
    return { set, net: balanceSheet(journals, accs, m.asOf).netWorth, worth: netWorthTrend(journals, accs, 6, m.asOf) };
  }), [nwPages, accounts, journals, m.asOf]);
  const trend = useMemo(() => monthlyTrend(journals, accounts, 6, m.asOf), [journals, accounts, m.asOf]);
  const investments = useMemo(() => investmentSummary(journals, accounts), [journals, accounts]);

  // 予算は「1ヶ月あたりの額」。期間が複数月にまたがるなら月数分に伸ばす。
  // これをしないと、今年を選んだときに1ヶ月の予算と1年分の支出を比べることになり、
  // 実際には収まっていても大幅に超過して見える。
  // 月数は日数から出す（30.44日＝1ヶ月）。暦の月末差と月の途中を端数で吸収できる。
  // 全期間は「いつまでの予算か」が決まらないので当月に固定する（Web 版と同じ扱い）。
  // 支出は収支と同じ窓で数える（今日なら今日まで、今月なら月末まで）。
  const budget = useMemo(() => {
    const cur = getPeriodRange('month');
    const from = period.mode === 'all' ? cur.start : period.start;
    const to = period.mode === 'all' ? cur.end : period.end;
    const days = Math.max(1, Math.round((new Date(`${to}T00:00:00`) - new Date(`${from}T00:00:00`)) / 86400000) + 1);
    const months = Math.max(1, Math.round((days / 30.44) * 10) / 10);

    // 支出は必ずこの窓で取り直す。上の期間の集計を流用すると全期間のときに桁が合わない。
    const bal = calcBalances(filterByPeriod(journals, from, to), accounts);
    // 予算のある費目だけ、消化率の高い順に。全部並べると予算を見ている意味が薄れる。
    const rows = (budgets || [])
      .filter((b) => b.amount > 0)
      .map((b) => {
        const a = accounts.find((x) => x.id === b.accountId);
        if (!a) return null;
        return {
          name: a.name,
          budget: Math.round(b.amount * months),
          used: Math.max(0, accountBalance(a.id, accounts, bal)),
        };
      })
      .filter(Boolean)
      .sort((x, y) => (y.used / y.budget) - (x.used / x.budget));
    return { rows, months };
  }, [budgets, accounts, journals, period.mode, period.start, period.end]);

  if (loading) return <Screen><Empty text="読み込み中…" /></Screen>;


  // 残高が「いつ時点」かを必ず出す。今日より先なら、実際の残高ではなく見込みだと明記する。
  const td = today();
  const projected = m.asOf > td;

  // 純資産のカードの1ページ（すべての科目、または保存した組み合わせ1つ）
  const heroPage = ({ set, net, worth }) => {
    const hasTrend = worth.some((w) => w.net !== 0);
    const prev = hasTrend ? worth[worth.length - 2].net : 0;
    const delta = hasTrend ? worth[worth.length - 1].net - prev : 0;
    const rate = prev ? (delta / Math.abs(prev)) * 100 : 0;
    return (
      <Hero
        label={`純資産（${m.asOf === td ? '今日' : projected ? `${m.asOf} 見込み` : m.asOf}${set ? `・${set.name}` : ''}）`}
        value={faBal(net)}
        negative={net < 0}
        // 前月の純資産が0（使い始めの月）なら前月比は出さない。開始残高の全額が「＋」に見えるため（2026-10-15 決定）
        sub={hasTrend && prev ? (hidden ? `前月比 ${MASK_RATE}` : `前月比 ${fas(delta)}（${rate >= 0 ? '+' : ''}${rate.toFixed(1)}%）`) : undefined}
        right={(
          // 目のボタンと「科目を選ぶ」の押せる範囲（hitSlop）が重ならない間を取る（重なると目を押して画面が移った）
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 24 }}>
            <TouchableOpacity onPress={() => setHideAmounts(!hidden)} hitSlop={10} accessibilityRole="button"
              accessibilityLabel={hidden ? '金額を表示する' : '金額を隠す'}>
              <Ionicons name={hidden ? 'eye-off-outline' : 'eye-outline'} size={20} color={t.heroTx} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push('/settings/networth')} hitSlop={8} accessibilityRole="button">
              <Text style={{ color: t.heroTx, fontSize: 13, fontWeight: '700' }}>科目を選ぶ ›</Text>
            </TouchableOpacity>
          </View>
        )}
      >
        {hasTrend ? (
          <View style={{ marginTop: 6 }}>
            <Sparkline data={worth.map((w) => ({ label: w.label, value: w.net }))}
              color={t.heroTx} labelColor={t.heroSub} />
          </View>
        ) : null}
      </Hero>
    );
  };

  // カードの部品。並びと出す・出さないは layout（設定の「ホームの表示」）で決まる。
  // 対象が無いカード（未記帳・予算など）は、出す設定でも出ない（これまでと同じ）。
  const blocks = {
    networth: () => (
      <>
        <View ref={netWorthRef} collapsable={false} style={{ gap: 8 }}>
          {nw.length > 1 ? (
            <Animated.ScrollView ref={heroPager} horizontal pagingEnabled showsHorizontalScrollIndicator={false}
              contentOffset={{ x: nwIndex * heroW, y: 0 }}
              onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: heroX } } }], { useNativeDriver: false })}
              scrollEventThrottle={16}
              onMomentumScrollEnd={(e) => {
                const i = Math.round(e.nativeEvent.contentOffset.x / heroW);
                const set = nwPages[i];
                if (i !== nwIndex) setNetWorthSets(selectSet(nwState, set ? set.id : null));
              }}
              // Screen の左右の余白の分だけ広げ、画面の端から端までを送る
              style={{ marginHorizontal: -13 }}>
              {nw.map((p) => (
                <View key={p.set ? p.set.id : 'all'} style={{ width: heroW, paddingHorizontal: 13 }}>{heroPage(p)}</View>
              ))}
            </Animated.ScrollView>
          ) : heroPage(nw[0])}
          <PageDots count={nw.length} x={heroX} step={heroW} />
        </View>
      </>
    ),
    pending: () => (dueCards.length || dueRec.length ? (
          <View ref={pendingRef} collapsable={false}>
          <Card title="未記帳の自動取引">
            {dueCards.length ? (
              <Text style={{ color: t.red, fontSize: 15 }}>
                カードの引き落とし {dueCards.length} 件（{fa(dueCards.reduce((s, x) => s + x.cycle.usage, 0))}）
              </Text>
            ) : null}
            {dueRec.length ? (
              <Text style={{ color: t.tx2, fontSize: 15 }}>定期取引 {dueRec.length} 件</Text>
            ) : null}
            <Text style={{ color: t.tx3, fontSize: 13 }}>記帳しないと残高が実態とずれます。</Text>
            {dueCards.length ? <Button label="クレジットを開く" onPress={() => router.push('/credit')} /> : null}
            {dueRec.length ? (
              <View ref={openRecRef} collapsable={false}>
                <Button label="定期取引を開く" variant="ghost" onPress={() => router.push('/manage/recurring')} />
              </View>
            ) : null}
          </Card>
          </View>
        ) : null),
    period: () => (
      <>
        <PeriodBar period={period} />
      </>
    ),
    flow: () => (
      <>
        <Card title={`${period.label}の収支`}>
          <KpiRow>
            <Kpi label="収入" value={fa(m.income)} color={t.grn} />
            <Kpi label="支出" value={fa(m.expense)} color={t.red} />
            <Kpi label="収支" value={fas(m.balance)} color={m.balance >= 0 ? t.grn : t.red} />
          </KpiRow>
        </Card>
      </>
    ),
    breakdown: () => (
      <>
        <View ref={breakdownRef} collapsable={false}>
        <Card title="支出内訳">
          <Breakdown pie hide={hidden} centerSub={`${period.label}の支出`}
            items={m.expenses.map((x) => ({ label: x.name, value: x.amount }))}
            emptyText="この期間の支出はまだありません" />
        </Card>
        </View>
      </>
    ),
    accounts: () => (byAccount.length ? (
          <View ref={accountsRef} collapsable={false}>
          <Card title="口座の残高">
            {byAccount.map((x) => (
              <View key={x.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, flex: 1 }}>
                  <View style={{
                    width: 7, height: 7, borderRadius: 4,
                    backgroundColor: x.type === 'asset' ? t.ac : t.red,
                  }} />
                  <Text style={{ color: t.tx2, fontSize: 14 }} numberOfLines={1}>{x.name}</Text>
                </View>
                <Text style={{ color: t.tx, fontSize: 14.5, fontWeight: '600' }}>{faBal(x.amount)}</Text>
              </View>
            ))}
            <Text style={{ color: t.tx3, fontSize: 13 }}>
              {m.asOf === td ? '今日時点の残高です。'
                : projected ? `${m.asOf} 時点の見込みです。今日より先の日付の仕訳も含みます。`
                : `${m.asOf} 時点の残高です。`}
            </Text>
          </Card>
          </View>
        ) : null),
    // 口座のお金を目的（タグ）ごとに。タグを使っていなければ出ない
    tags: () => <TagUsage />,
    trend: () => (trend.some((x) => x.expense > 0) ? (
          <Card title="支出の推移（6か月）">
            <Bars data={trend.map((x) => ({ label: x.label, value: x.expense }))} color={t.red} />
          </Card>
        ) : null),
    budget: () => (budget.rows.length ? (
          <Card title={budget.months === 1 ? '予算の消化' : `予算の消化（月予算 × ${budget.months}ヶ月）`}>
            {budget.rows.map((b) => {
              const pct = Math.min((b.used / b.budget) * 100, 100);
              const over = b.used > b.budget;
              return (
                <View key={b.name} style={{ gap: 4 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ color: t.tx2, fontSize: 14 }}>{b.name}</Text>
                    <Text style={{ color: over ? t.red : t.tx2, fontSize: 14 }}>{fa(b.used)} / {fa(b.budget)}</Text>
                  </View>
                  <View style={{ height: 5, borderRadius: 3, backgroundColor: t.bg3, overflow: 'hidden' }}>
                    <View style={{ width: `${pct}%`, height: '100%', backgroundColor: over ? t.red : t.ac }} />
                  </View>
                </View>
              );
            })}
          </Card>
        ) : null),
    investments: () => (investments.length ? (
          <Card title="投資資産">
            {investments.map((r) => (
              <View key={r.account.id} style={{ gap: 2 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: t.tx2, fontSize: 14 }}>{r.account.name}</Text>
                  <Text style={{ color: t.tx, fontSize: 15, fontWeight: '700' }}>{faBal(r.value)}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: t.tx3, fontSize: 13 }}>元本 {faBal(r.principal)}</Text>
                  <Text style={{ color: r.gain >= 0 ? t.grn : t.red, fontSize: 13 }}>
                    {fas(r.gain)}{hidden ? '' : `（${(r.rate * 100).toFixed(1)}%）`}
                  </Text>
                </View>
              </View>
            ))}
          </Card>
        ) : null),
  };
  // ツアーが純資産を指している間は、消していても出す（指す先が無いと案内が宙に浮く）
  const forced = { networth: 'networth', 'home-breakdown': 'breakdown', 'tag-usage': 'tags', 'home-accounts': 'accounts' }[tour?.step?.target] || null;

  return (
    <View style={{ flex: 1 }}>
    <Screen onScrolling={onScrolling}>
      {layout.filter((x) => x.on || x.id === forced).map((x) => (
        <Fragment key={x.id}>{blocks[x.id]?.()}</Fragment>
      ))}

      <TouchableOpacity onPress={() => router.push('/settings/home')} style={{ alignSelf: 'center', padding: 8 }}>
        <Text style={{ color: t.ac, fontSize: 14, fontWeight: '600' }}>ホームの表示を編集</Text>
      </TouchableOpacity>

      {/* 一番下の広告。オンボーディング中は覆いの下に隠れるので読み込まない（TabBar と同じ理由）。
          画面に近づくまでは要求しない（LazyAd） */}
      {onboarding?.active ? null : <LazyAd placement="homeBottom" />}
    </Screen>
    {/* 右下の「広告を消す」。動画広告を見られない人には出ない（HomeAdFree） */}
    <HomeAdFree scrolling={scrolling} />
    </View>
  );
}

// 前月比の伏せ字（率からも額の見当がつくので、率も伏せる）
const MASK_RATE = '•••';

/** 縦棒。値の大小だけ分かればよいので、軸やラベルは持たせない。 */
function Bars({ data, color }) {
  const t = useTheme();
  const max = Math.max(...data.map((d) => Math.abs(d.value)), 1);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 84 }}>
      {data.map((d) => (
        <View key={d.label} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
          <View style={{
            width: '64%',
            height: Math.max((Math.abs(d.value) / max) * 58, 2),
            backgroundColor: d.value < 0 ? t.red : color,
            borderRadius: 3,
          }} />
          <Text style={{ color: t.tx3, fontSize: 13 }}>{d.label}</Text>
        </View>
      ))}
    </View>
  );
}
