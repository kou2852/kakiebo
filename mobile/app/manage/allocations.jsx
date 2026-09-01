// タグ配分（口座の残高を用途タグへ割り当てる）。残高そのものは動かさない予算取り。
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { useData } from '../../src/store/DataProvider';
import { useTheme } from '../../src/theme';
import { Button, Card, Empty, Input, Screen } from '../../src/components/ui';
import { faBal } from '../../src/utils/format';
import { tagAllocation } from '../../src/utils/bookkeeping';

export default function Allocations() {
  const t = useTheme();
  const { accounts, journals, tags, allocs, wallets, setAll } = useData();

  const rows = useMemo(
    () => tagAllocation(journals, accounts, tags, allocs, wallets),
    [journals, accounts, tags, allocs, wallets]
  );

  // 編集中の値は accountId#tagId をキーに持つ。allocs は id を持たないので全置換で保存する。
  const [draft, setDraft] = useState(() =>
    Object.fromEntries((allocs || []).map((a) => [`${a.accountId}#${a.tagId}`, String(a.amount)]))
  );
  const val = (accountId, tagId) => draft[`${accountId}#${tagId}`] ?? '';
  const setVal = (accountId, tagId, v) => setDraft((d) => ({ ...d, [`${accountId}#${tagId}`]: v }));

  const commit = () => setAll('allocs', Object.entries(draft)
    .map(([k, v]) => {
      const [accountId, tagId] = k.split('#');
      return { accountId, tagId, amount: Number(String(v).replace(/[^0-9]/g, '')) };
    })
    .filter((a) => a.amount > 0));

  if (!tags.length) return <Screen><Empty text="先にタグを作ってください" /></Screen>;
  if (!rows.length) return <Screen><Empty text="配分できる口座がありません" /></Screen>;

  return (
    <Screen>
      {rows.map((r) => {
        const allocated = tags.reduce((s, g) => s + (Number(String(val(r.account.id, g.id)).replace(/[^0-9]/g, '')) || 0), 0);
        const free = r.bal - allocated;
        return (
          <Card key={r.account.id} title={r.account.name}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: t.tx2, fontSize: 13 }}>残高</Text>
              <Text style={{ color: t.tx, fontSize: 14, fontWeight: '700' }}>{faBal(r.bal)}</Text>
            </View>
            {tags.map((g) => (
              <View key={g.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: g.color || t.ac }} />
                <Text style={{ color: t.tx2, fontSize: 14, flex: 1 }}>{g.name}</Text>
                <Input
                  value={val(r.account.id, g.id)}
                  onChangeText={(v) => setVal(r.account.id, g.id, v)}
                  keyboardType="number-pad" placeholder="0"
                  style={{ width: 110, textAlign: 'right', paddingVertical: 7 }}
                />
              </View>
            ))}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: t.bd, paddingTop: 8 }}>
              <Text style={{ color: t.tx2, fontSize: 13 }}>未配分</Text>
              <Text style={{ color: free < 0 ? t.red : t.tx, fontSize: 14, fontWeight: '700' }}>
                {faBal(free)}{free < 0 ? '（配分超過）' : ''}
              </Text>
            </View>
          </Card>
        );
      })}

      <Button label="保存" onPress={commit} />
      <Text style={{ color: t.tx3, fontSize: 12, lineHeight: 18 }}>
        配分は残高を動かしません。「この口座のうち、いくらを何に取っておくか」という目安です。
      </Text>
    </Screen>
  );
}
