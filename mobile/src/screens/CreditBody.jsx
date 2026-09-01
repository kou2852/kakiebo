// クレジットカードの本体。Web 版 components/Credit/CreditPage.jsx の移植。
// レポートの「カード」タブと、単独ルート /credit の両方から使う。
//
// カード払いは「使った日」と「口座から出る日」が最大2か月ずれる。その間、負債として
// 帳簿に残り続けるので、締めサイクルごとに利用額・引落予定日・引落済みかを1画面で追えないと
// 未払残高が実態と合っているか判断できない。レポート内の一覧では足りず、専用画面が要る。
import { useMemo, useState } from 'react';
import { Alert, Dimensions, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useData } from '../store/DataProvider';
import { useTheme, PIE_COLORS } from '../theme';
import { Button, Card, Empty, sep } from '../components/ui';
import PeriodBar, { usePeriod } from '../components/PeriodBar';
import Breakdown from '../components/Breakdown';
import { fa, uid } from '../utils/format';
import { accountBalance, calcBalances } from '../utils/bookkeeping';
import { creditCardCycles, creditUsageByCategory, isCreditCard, todayYmd } from '../utils/creditCard';
import { pendingCC, postCCSettlements } from '../utils/autoGen';

const STATUS = {
  open: { label: '利用中', key: 'tx2' },
  unsettled: { label: '未引落', key: 'red' },
  settled: { label: '引落済', key: 'grn' },
  none: { label: '利用なし', key: 'tx3' },
};

export default function CreditBody() {
  const t = useTheme();
  const router = useRouter();
  const { accounts, journals, save, loading } = useData();

  // 既定は「今年」。カードは締めと引落が月をまたぐので、今月だけ見ても全体が掴めない。
  const period = usePeriod('year');
  const [open, setOpen] = useState({}); // サイクルの明細を開いているか
  const [page, setPage] = useState(0);   // 横スライドで見ているカード
  // Screen の左右パディング(13)を引いた幅を1ページとし、ページ間に余白を挟む。
  // 余白が無いと隣のカードと地続きに見え、どこまでが同じカードか分からない。
  const GAP = 14;
  const pageW = Dimensions.get('window').width - 26;

  const cards = useMemo(() => accounts.filter(isCreditCard), [accounts]);
  const balances = useMemo(() => calcBalances(journals, accounts), [journals, accounts]);
  const pending = useMemo(() => pendingCC(accounts, journals), [accounts, journals]);
  const today = todayYmd();
  const name = (id) => accounts.find((a) => a.id === id)?.name || '(不明)';

  const settle = (items, cardName) => {
    const total = items.reduce((s, x) => s + x.cycle.usage, 0);
    Alert.alert(
      `${items.length} 件を引き落としとして記帳しますか？`,
      `${cardName}\n合計 ${fa(total)}\nカードの残高が減り、引落口座から同額が出ます。`,
      [
        { text: 'キャンセル', style: 'cancel' },
        { text: '記帳', onPress: () => postCCSettlements(items, (d) => save('journals', { id: uid(), ...d })) },
      ]
    );
  };

  if (loading) return <Empty text="読み込み中…" />;

  if (!cards.length) {
    return (
      <Card title="クレジットカードが未設定です">
          <Text style={{ color: t.tx2, fontSize: 14, lineHeight: 20 }}>
            負債の勘定科目に「締め日・引落日・引落口座」を設定すると、利用と引き落としのサイクルが
            ここにまとまります。
          </Text>
        <Button label="勘定科目へ" onPress={() => router.push('/manage/accounts')} />
      </Card>
    );
  }

  return (
    <>
      <PeriodBar period={period} />

      {cards.length > 1 ? (
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, paddingBottom: 2 }}>
          {cards.map((c, i) => (
            <View key={c.id} style={{
              width: i === page ? 18 : 6, height: 6, borderRadius: 3,
              backgroundColor: i === page ? t.ac : t.bd2,
            }} />
          ))}
        </View>
      ) : null}

      <ScrollView
        horizontal pagingEnabled showsHorizontalScrollIndicator={false}
        // 1枚ずつ止める。カードごとに情報がまとまっているので、途中で切れると読めない。
        onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / (pageW + GAP)))}
        style={{ marginHorizontal: -13 }}
        contentContainerStyle={{ paddingHorizontal: 13 }}
        snapToInterval={pageW + GAP}
        decelerationRate="fast"
      >
      {cards.map((c) => {
        const all = creditCardCycles(c, journals, accounts);
        // 期間の絞り込みは「引落日」で行う。利用日で切ると、締め済みで引落待ちの分が
        // 期間外に消えてしまい、次にいくら出ていくのか分からなくなる。
        const cycles = all.filter((cy) => cy.settleDate >= period.start && cy.settleDate <= period.end);
        const outstanding = Math.max(0, accountBalance(c.id, accounts, balances));
        const upcoming = all
          .filter((cy) => cy.status === 'unsettled' && cy.settleDate >= today)
          .sort((a, b) => a.settleDate.localeCompare(b.settleDate))[0];
        const current = all.find((cy) => cy.status === 'open');

        const rangeStart = cycles.length ? cycles[cycles.length - 1].periodStart : period.start;
        const rangeEnd = cycles.length ? cycles[0].periodEnd : period.end;
        const cats = creditUsageByCategory(c, journals, accounts, rangeStart, rangeEnd)
          .map((x, i) => ({ label: x.name, value: x.value, color: PIE_COLORS[i % PIE_COLORS.length] }));

        const cardPending = pending.filter((x) => x.card.id === c.id);
        const due = cardPending.filter((x) => x.due);
        const maxUsage = Math.max(...cycles.map((cy) => cy.usage), 1);

        return (
          <View key={c.id} style={{ width: pageW, gap: 9, marginRight: GAP }}>
            {/* カード本体。締め・引落の条件と未払残高を1枚に収める */}
            <View style={{ borderRadius: 16, padding: 15, backgroundColor: '#26314e' }}>
              <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }} numberOfLines={1}>{c.name}</Text>
              <Text style={{ color: 'rgba(255,255,255,.65)', fontSize: 12, marginTop: 3 }}>
                {c.ccClose}日締 → {(c.ccDelay || 1) > 1 ? '翌々月' : '翌月'}{c.ccDay}日引落
              </Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 18 }}>
                <View>
                  <Text style={{ color: 'rgba(255,255,255,.6)', fontSize: 12 }}>未払残高</Text>
                  <Text style={{ color: '#fff', fontSize: 24, fontWeight: '800' }}>{fa(outstanding)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ color: 'rgba(255,255,255,.6)', fontSize: 12 }}>引落口座</Text>
                  <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>{name(c.ccFrom)}</Text>
                </View>
              </View>
            </View>

            <Card>
              <View style={{ flexDirection: 'row' }}>
                <Stat label="今サイクル利用" value={fa(current?.usage || 0)} />
                <Stat label="未払残高" value={fa(outstanding)} />
                <Stat
                  label={`次回引落${upcoming ? `（${upcoming.settleDate.slice(5).replace('-', '/')}）` : ''}`}
                  value={upcoming ? fa(upcoming.usage) : '—'}
                  color={upcoming ? t.red : t.tx}
                />
              </View>
            </Card>

            {cardPending.length ? (
              <Button
                label={due.length
                  ? `引落日が来た ${due.length} 件を記帳`
                  : `引落前の ${cardPending.length} 件を先に記帳`}
                onPress={() => settle(due.length ? due : cardPending, c.name)}
              />
            ) : null}
            {cardPending.length > due.length && due.length ? (
              <Button label={`引落前も含めて ${cardPending.length} 件を記帳`} variant="ghost"
                onPress={() => settle(cardPending, c.name)} />
            ) : null}

            <Card title="サイクル別 利用額（締め月）">
              {cycles.length === 0 ? (
                <Empty text="この期間に引き落とされるサイクルはありません" />
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 92 }}>
                  {[...cycles].reverse().map((cy) => (
                    <View key={cy.periodEnd} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
                      <Text style={{ color: t.tx3, fontSize: 12 }} numberOfLines={1}>
                        {cy.usage >= 10000 ? `${Math.round(cy.usage / 1000)}k` : cy.usage}
                      </Text>
                      <View style={{
                        width: '72%',
                        height: Math.max((cy.usage / maxUsage) * 56, 2),
                        borderRadius: 3,
                        backgroundColor: cy.status === 'unsettled' ? t.red : cy.status === 'open' ? t.tx3 : t.ac,
                      }} />
                      <Text style={{ color: t.tx3, fontSize: 12 }}>{Number(cy.periodEnd.slice(5, 7))}月</Text>
                    </View>
                  ))}
                </View>
              )}
            </Card>

            {cats.length ? (
              <Card title={`科目別 利用内訳（${cycles.length}サイクル）`}>
                <Breakdown items={cats} />
              </Card>
            ) : null}

            <Card title="サイクル一覧" style={{ paddingHorizontal: 0, paddingBottom: 0 }}>
              {cycles.length === 0 ? (
                <Empty text="対象のサイクルがありません" />
              ) : cycles.map((cy) => {
                const st = STATUS[cy.status];
                const isOpen = open[`${c.id}:${cy.periodEnd}`];
                return (
                  <View key={cy.periodEnd}>
                    <TouchableOpacity
                      onPress={() => setOpen((o) => ({ ...o, [`${c.id}:${cy.periodEnd}`]: !isOpen }))}
                      style={[{ paddingVertical: 10, paddingHorizontal: 14, gap: 3 }, sep(t)]}
                    >
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ color: t.tx2, fontSize: 12.5 }}>{cy.periodStart} 〜 {cy.periodEnd}</Text>
                        <Text style={{ color: t.tx, fontSize: 14, fontWeight: '700' }}>{fa(cy.usage)}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ color: t[st.key], fontSize: 12 }}>
                          {st.label}
                          {cy.items.length ? <Text style={{ color: t.tx3 }}>{`  ${cy.items.length}件 ${isOpen ? '▲' : '▼'}`}</Text> : null}
                        </Text>
                        <Text style={{ color: t.tx3, fontSize: 12 }}>引落 {cy.settleDate}</Text>
                      </View>
                    </TouchableOpacity>

                    {isOpen ? cy.items.map((it, i) => (
                      <View key={i} style={[{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, paddingHorizontal: 14, backgroundColor: t.bg0 }, sep(t)]}>
                        <Text style={{ color: t.tx3, fontSize: 12, width: 62 }}>{it.date.slice(5)}</Text>
                        <Text style={{ color: t.tx2, fontSize: 12.5, flex: 1 }} numberOfLines={1}>{it.desc || '(摘要なし)'}</Text>
                        <Text style={{ color: t.tx, fontSize: 12.5 }}>{fa(it.amount)}</Text>
                      </View>
                    )) : null}
                  </View>
                );
              })}
            </Card>
          </View>
        );
      })}
      </ScrollView>
    </>
  );
}

function Stat({ label, value, color }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, gap: 3 }}>
      <Text style={{ color: t.tx3, fontSize: 12 }} numberOfLines={1}>{label}</Text>
      <Text style={{ color: color || t.tx, fontSize: 16, fontWeight: '800' }} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}
