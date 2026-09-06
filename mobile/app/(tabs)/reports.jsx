import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { useData } from '../../src/store/DataProvider';
import { useTheme } from '../../src/theme';
import { Card, Empty, Screen, UnderlineTabs } from '../../src/components/ui';
import PeriodBar, { usePeriod } from '../../src/components/PeriodBar';
import Breakdown from '../../src/components/Breakdown';
import CreditBody from '../../src/screens/CreditBody';
import { faBal, fas } from '../../src/utils/format';
import {
  accountBalance, balanceSheet, balancesAsOf, calcBalances, computeCashFlow, filterByPeriod,
} from '../../src/utils/bookkeeping';
import { useTourTarget } from '../../src/store/TourProvider';

const MODES = [
  { value: 'bs', label: '貸借対照表' },
  { value: 'pl', label: '損益計算書' },
  { value: 'cf', label: 'キャッシュフロー' },
  { value: 'cc', label: 'カード' },
];

export default function Reports() {
  const tabsRef = useTourTarget('report-tabs');
  const [mode, setMode] = useState('bs');
  const { accounts, journals } = useData();

  // BS は「期間末の時点」、PL と CF は「期間中の増減」。同じ期間指定から両方を出す。
  const period = usePeriod('month');

  const r = useMemo(() => {
    const { start, end } = period;
    // 借方残の負債は資産側へ振り替える。ダッシュボードと同じ集計にそろえる。
    const bs = balanceSheet(journals, accounts, end);
    const inPeriod = filterByPeriod(journals, start, end);
    const flow = calcBalances(inPeriod, accounts);

    const pick = (type, bal) => accounts
      .map((a) => ({ id: a.id, name: a.name, type: a.type, amount: accountBalance(a.id, accounts, bal) }))
      .filter((x) => x.type === type && x.amount !== 0)
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
    const sum = (rows) => rows.reduce((s, x) => s + x.amount, 0);

    const eq = pick('equity', balancesAsOf(journals, accounts, end));
    const inc = pick('income', flow), exp = pick('expense', flow);
    return {
      asset: bs.assets, liab: bs.liabilities, eq, inc, exp,
      assetT: bs.asset, liabT: bs.liability, netWorth: bs.netWorth, eqT: sum(eq),
      incT: sum(inc), expT: sum(exp),
      // CF も期間内の仕訳だけで計算する。全期間固定だと期間バーと食い違って見える。
      cf: computeCashFlow(inPeriod, accounts),
    };
  }, [accounts, journals, period]);

  return (
    <Screen>
      <View ref={tabsRef} collapsable={false}>
        <UnderlineTabs options={MODES} value={mode} onChange={setMode} />
      </View>
      {mode === 'cc' ? null : <PeriodBar period={period} />}

      {mode === 'bs' ? <BS r={r} end={period.end} />
        : mode === 'pl' ? <PL r={r} />
        : mode === 'cf' ? <CF cf={r.cf} accounts={accounts} />
        : <CreditBody />}
    </Screen>
  );
}

// ── 貸借対照表（期間末の時点） ──
function BS({ r, end }) {
  const t = useTheme();
  if (!r.asset.length && !r.liab.length && !r.eq.length) return <Empty text="表示できるデータがありません" />;
  return (
    <>
      <Text style={{ color: t.tx3, fontSize: 13 }}>{end === '2999-12-31' ? '今日時点' : `${end} 時点`}</Text>
      <Section title="資産" rows={r.asset} total={r.assetT} totalLabel="資産合計" />
      {r.asset.length ? (
        <Card title="資産の構成">
          <Breakdown pie centerSub="資産合計" items={r.asset.map((x) => ({ label: x.name, value: x.amount }))} />
        </Card>
      ) : null}
      <Section title="負債" rows={r.liab} total={r.liabT} totalLabel="負債合計" />
      <Section title="純資産" rows={r.eq} total={r.eqT} totalLabel="純資産合計" />
      <Card title="差引純資産">
        <Text style={{ color: t.tx, fontSize: 26, fontWeight: '800' }}>{faBal(r.netWorth)}</Text>
        {r.liab.some((x) => x.reclassified) ? (
          <Text style={{ color: t.tx3, fontSize: 13.5, lineHeight: 20 }}>
            残高がマイナスの資産（引き落とし超過など）は、実質の借金なので負債に振り替えて
            表示しています。
          </Text>
        ) : null}
      </Card>
    </>
  );
}

// ── 損益計算書（期間中の増減） ──
function PL({ r }) {
  const t = useTheme();
  if (!r.inc.length && !r.exp.length) return <Empty text="表示できるデータがありません" />;
  return (
    <>
      <Section title="収益" rows={r.inc} total={r.incT} totalLabel="収益合計" />
      <Section title="費用" rows={r.exp} total={r.expT} totalLabel="費用合計" />
      {r.exp.length ? (
        <Card title="費用の内訳">
          <Breakdown pie centerSub="費用合計" items={r.exp.map((x) => ({ label: x.name, value: x.amount }))} />
        </Card>
      ) : null}
      <Card title="当期損益">
        <Text style={{ color: r.incT - r.expT >= 0 ? t.grn : t.red, fontSize: 26, fontWeight: '800' }}>
          {faBal(r.incT - r.expT)}
        </Text>
      </Card>
    </>
  );
}

// ── キャッシュフロー計算書（簡易直接法） ──
const CF_LABELS = { operating: '営業活動', investing: '投資活動', financing: '財務活動' };

function CF({ cf, accounts }) {
  const t = useTheme();
  const name = (id) => accounts.find((a) => a.id === id)?.name || '?';
  const has = cf.items.operating.length || cf.items.investing.length || cf.items.financing.length;
  if (!has) return <Empty text="表示できるデータがありません" />;

  return (
    <>
      {Object.entries(CF_LABELS).map(([k, label]) => (
        <Card key={k} title={label}>
          {cf.items[k].length === 0 ? (
            <Text style={{ color: t.tx3, fontSize: 14 }}>該当なし</Text>
          ) : cf.items[k].map((x) => (
            <View key={x.accountId} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: t.tx2, fontSize: 15 }}>{name(x.accountId)}</Text>
              <Text style={{ color: x.amount >= 0 ? t.grn : t.red, fontSize: 15, fontWeight: '600' }}>{fas(x.amount)}</Text>
            </View>
          ))}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: t.bd, paddingTop: 8 }}>
            <Text style={{ color: t.tx, fontSize: 15, fontWeight: '700' }}>小計</Text>
            <Text style={{ color: t.ac, fontSize: 16, fontWeight: '800' }}>{fas(cf[k])}</Text>
          </View>
        </Card>
      ))}
      <Card title="現金の増減">
        <Text style={{ color: cf.net >= 0 ? t.grn : t.red, fontSize: 26, fontWeight: '800' }}>{fas(cf.net)}</Text>
      </Card>
    </>
  );
}

function Section({ title, rows, total, totalLabel }) {
  const t = useTheme();
  if (!rows.length) return null;
  return (
    <Card title={title}>
      {rows.map((r) => (
        <View key={r.id} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
          <Text style={{ color: t.tx2, fontSize: 15, flex: 1 }} numberOfLines={1}>
            {r.name}
            {r.reclassified ? <Text style={{ color: t.tx3, fontSize: 13 }}>（振替）</Text> : null}
          </Text>
          <Text style={{ color: t.tx, fontSize: 15, fontWeight: '600' }}>{faBal(r.amount)}</Text>
        </View>
      ))}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: t.bd, paddingTop: 8, marginTop: 2 }}>
        <Text style={{ color: t.tx, fontSize: 15, fontWeight: '700' }}>{totalLabel}</Text>
        <Text style={{ color: t.ac, fontSize: 16, fontWeight: '800' }}>{faBal(total)}</Text>
      </View>
    </Card>
  );
}
