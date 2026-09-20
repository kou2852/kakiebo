// ダッシュボード。デザイン案「ダッシュボード型」の構成。
//
// 主役は純資産。濃いヒーローカード＋推移の折れ線を最上部に置き、それ以外は白いカードに落とす。
// 資産管理がテーマなので、いくら使ったかより「いま資産がいくらで、増えているか」が先に来る。
import { useMemo } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useData } from '../../src/store/DataProvider';
import { useTheme } from '../../src/theme';
import { Button, Card, Empty, Hero, Kpi, KpiRow, Screen } from '../../src/components/ui';
import PeriodBar, { usePeriod } from '../../src/components/PeriodBar';
import Breakdown from '../../src/components/Breakdown';
import Sparkline from '../../src/components/Sparkline';
import { fa, faBal, fas, today } from '../../src/utils/format';
import {
  accountBalance, balanceDate, balanceSheet, calcBalances, filterByPeriod, getPeriodRange,
  isCashAccount, investmentSummary, monthlyTrend, netWorthTrend,
} from '../../src/utils/bookkeeping';
import { dueRecurring, pendingCC } from '../../src/utils/autoGen';
import { useTourTarget } from '../../src/store/TourProvider';
import { useOnboarding } from '../../src/store/OnboardingProvider';
import Ad from '../../src/components/Ad';

export default function Dashboard() {
  // ツアーで指し示す位置。要素そのものではなく囲みの View に付ける
  // （Hero や PeriodBar は ref を受け取らないため）。
  const netWorthRef = useTourTarget('networth');
  const periodRef = useTourTarget('period-bar');
  const t = useTheme();
  const router = useRouter();
  const onboarding = useOnboarding();
  const { loading, accounts, journals, budgets, recurring, wallets } = useData();

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

    // 借方残の負債は資産側へ振り替えて集計する（詳細は balanceSheet のコメント）
    const bs = balanceSheet(journals, accounts, asOf);
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
    return { netWorth: bs.netWorth, income, expense, balance: income - expense, expenses, asOf };
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
    const target = (a) => a.type === 'asset' && (walletIds.size ? walletIds.has(a.id) : isCashAccount(a));
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
  const worth = useMemo(() => netWorthTrend(journals, accounts, 6, m.asOf), [journals, accounts, m.asOf]);
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

  const hasTrend = worth.some((w) => w.net !== 0);
  const prev = hasTrend ? worth[worth.length - 2].net : 0;
  const delta = hasTrend ? worth[worth.length - 1].net - prev : 0;
  const rate = prev ? (delta / Math.abs(prev)) * 100 : 0;

  // 残高が「いつ時点」かを必ず出す。今日より先なら、実際の残高ではなく見込みだと明記する。
  const td = today();
  const projected = m.asOf > td;

  return (
    <Screen>
      <View ref={netWorthRef} collapsable={false}>
      <Hero
        label={`純資産（${m.asOf === td ? '今日' : projected ? `${m.asOf} 見込み` : m.asOf}）`}
        value={faBal(m.netWorth)}
        negative={m.netWorth < 0}
        sub={hasTrend ? `前月比 ${fas(delta)}（${rate >= 0 ? '+' : ''}${rate.toFixed(1)}%）` : undefined}
      >
        {hasTrend ? (
          <View style={{ marginTop: 6 }}>
            <Sparkline data={worth.map((w) => ({ label: w.label, value: w.net }))}
              color={t.heroTx} labelColor={t.heroSub} />
          </View>
        ) : null}
      </Hero>
      </View>

      {dueCards.length || dueRec.length ? (
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
          {dueRec.length ? <Button label="定期取引を開く" variant="ghost" onPress={() => router.push('/manage/recurring')} /> : null}
        </Card>
      ) : null}

      <View ref={periodRef} collapsable={false}>
        <PeriodBar period={period} />
      </View>

      <Card title={`${period.label}の収支`}>
        <KpiRow>
          <Kpi label="収入" value={fa(m.income)} color={t.grn} />
          <Kpi label="支出" value={fa(m.expense)} color={t.red} />
          <Kpi label="収支" value={fas(m.balance)} color={m.balance >= 0 ? t.grn : t.red} />
        </KpiRow>
      </Card>

      <Card title="支出内訳">
        <Breakdown pie centerSub={`${period.label}の支出`}
          items={m.expenses.map((x) => ({ label: x.name, value: x.amount }))}
          emptyText="この期間の支出はまだありません" />
      </Card>

      {byAccount.length ? (
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
      ) : null}

      {trend.some((x) => x.expense > 0) ? (
        <Card title="支出の推移（6か月）">
          <Bars data={trend.map((x) => ({ label: x.label, value: x.expense }))} color={t.red} />
        </Card>
      ) : null}

      {budget.rows.length ? (
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
      ) : null}

      {investments.length ? (
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
                  {fas(r.gain)}（{(r.rate * 100).toFixed(1)}%）
                </Text>
              </View>
            </View>
          ))}
        </Card>
      ) : null}

      {/* 一番下の広告。オンボーディング中は覆いの下に隠れるので読み込まない（TabBar と同じ理由） */}
      {onboarding?.active ? null : <Ad placement="homeBottom" />}
    </Screen>
  );
}

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
