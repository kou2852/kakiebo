import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { useData } from '../../src/store/DataProvider';
import { useTheme } from '../../src/theme';
import { Button, Card, Empty, Input, Screen } from '../../src/components/ui';
import { fa, ymd, today } from '../../src/utils/format';
import { accountBalance, calcBalances, filterByPeriod } from '../../src/utils/bookkeeping';
import { isHidden, mergeBudgets } from '../../src/utils/hiddenAccounts';

// 予算は { accountId, amount } で id を持たないため、コレクションごと差し替える。
export default function Budgets() {
  const t = useTheme();
  const { budgets, accounts, journals, setAll } = useData();

  const expenses = useMemo(() => accounts.filter((a) => a.type === 'expense' && !isHidden(a)), [accounts]);
  const [draft, setDraft] = useState(() =>
    Object.fromEntries(expenses.map((a) => [a.id, String(budgets.find((b) => b.accountId === a.id)?.amount || '')]))
  );

  // 実績は当月分。予算は月額として扱う。
  const spent = useMemo(() => {
    const now = new Date();
    const start = ymd(new Date(now.getFullYear(), now.getMonth(), 1));
    const bal = calcBalances(filterByPeriod(journals, start, today()), accounts);
    return Object.fromEntries(expenses.map((a) => [a.id, accountBalance(a.id, accounts, bal)]));
  }, [journals, accounts, expenses]);

  // ⚠ 予算はコレクションごと差し替えるので、画面の入力だけで作り直すと、非表示の費目に
  //   付いていた予算が保存のたびに消える。画面に出していない費目の分は引き継ぐ。
  const commit = () => setAll('budgets', mergeBudgets(budgets, expenses.map((a) => a.id), expenses
    .map((a) => ({ accountId: a.id, amount: Number(String(draft[a.id]).replace(/[^0-9]/g, '')) }))
    .filter((b) => b.amount > 0)));

  if (!expenses.length) return <Screen><Empty text="費用の勘定科目がありません" /></Screen>;

  return (
    <Screen>
      <Card title="今月の予算と実績">
        {expenses.map((a) => {
          const budget = Number(String(draft[a.id]).replace(/[^0-9]/g, '')) || 0;
          const used = spent[a.id] || 0;
          const pct = budget ? Math.min((used / budget) * 100, 100) : 0;
          const over = budget && used > budget;
          return (
            <View key={a.id} style={{ gap: 5, paddingVertical: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text style={{ color: t.tx, fontSize: 15, flex: 1 }}>{a.name}</Text>
                <Input
                  value={draft[a.id]}
                  onChangeText={(v) => setDraft((d) => ({ ...d, [a.id]: v }))}
                  keyboardType="number-pad" placeholder="0"
                  style={{ width: 132, textAlign: 'right', paddingVertical: 7 }}
                />
              </View>
              {budget ? (
                <>
                  <View style={{ height: 5, borderRadius: 3, backgroundColor: t.bg3, overflow: 'hidden' }}>
                    <View style={{ width: `${pct}%`, height: '100%', backgroundColor: over ? t.red : t.ac }} />
                  </View>
                  <Text style={{ color: over ? t.red : t.tx3, fontSize: 13 }}>
                    実績 {fa(used)} / 予算 {fa(budget)}{over ? `  ${fa(used - budget)} 超過` : ''}
                  </Text>
                </>
              ) : null}
            </View>
          );
        })}
      </Card>
      <Button label="保存" onPress={commit} />
      <Text style={{ color: t.tx3, fontSize: 13, textAlign: 'center' }}>0 にすると予算なしになります</Text>
    </Screen>
  );
}
