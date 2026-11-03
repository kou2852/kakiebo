// タグ配分（口座の残高を用途タグへ割り当てる）。残高そのものは動かさない予算取り。
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useData } from '../../src/store/DataProvider';
import { useTheme } from '../../src/theme';
import { Button, Card, Empty, Input, Screen } from '../../src/components/ui';
import { faBal, fas } from '../../src/utils/format';
import { computeTagBalances, tagAllocation } from '../../src/utils/bookkeeping';
import { useToast } from '../../src/store/ToastProvider';
import { useTour, useTourTarget } from '../../src/store/TourProvider';

// 全角数字も受ける。数字以外は落とす。先頭の - は残す（マイナスの配分＝他のタグからの借り。タグ付け替えで付く）
const toAmount = (v) => {
  const s = String(v ?? '').normalize('NFKC').trim();
  const n = Number(s.replace(/[^0-9]/g, '')) || 0;
  return /^[-−]/.test(s) ? -n : n;
};

export default function Allocations() {
  const t = useTheme();
  const firstRef = useTourTarget('alloc-first');
  const saveRef = useTourTarget('alloc-save');
  const tour = useTour();
  const toast = useToast();
  const router = useRouter();
  const { accounts, journals, tags, allocs, wallets, setAll } = useData();

  const rows = useMemo(
    () => tagAllocation(journals, accounts, tags, allocs, wallets),
    [journals, accounts, tags, allocs, wallets]
  );
  // 記帳でタグを付けた分の、口座ごと・タグごとの増減。配分（ここで入れる額）と足したものが「残り」
  const flows = useMemo(() => computeTagBalances(journals, accounts).byAccount, [journals, accounts]);

  // 編集中の値は accountId#tagId をキーに持つ。allocs は id を持たないので全置換で保存する。
  const [draft, setDraft] = useState(() =>
    Object.fromEntries((allocs || []).map((a) => [`${a.accountId}#${a.tagId}`, String(a.amount)]))
  );
  const val = (accountId, tagId) => draft[`${accountId}#${tagId}`] ?? '';
  const setVal = (accountId, tagId, v) => setDraft((d) => ({ ...d, [`${accountId}#${tagId}`]: v }));

  const commit = () => setAll('allocs', Object.entries(draft)
    .map(([k, v]) => {
      const [accountId, tagId] = k.split('#');
      return { accountId, tagId, amount: toAmount(v) };
    })
    .filter((a) => a.amount !== 0));

  if (!tags.length) return <Screen><Empty text="先にタグを作ってください" /></Screen>;
  if (!rows.length) return <Screen><Empty text="配分できる口座がありません" /></Screen>;

  return (
    <Screen>
      {rows.map((r, ri) => {
        // ⚠ 未配分は、入れた配分だけでなく記帳でタグを付けた分も引く。配分だけで引くと、
        //   使った分が未配分に戻ったように見える（2026-10-15 まではそうなっていた）。
        const flow = flows[r.account.id] || {};
        const used = Object.values(flow).reduce((s, v) => s + v, 0);
        const allocated = tags.reduce((s, g) => s + toAmount(val(r.account.id, g.id)), 0);
        const free = r.bal - allocated - used;
        return (
          <View key={r.account.id} ref={ri === 0 ? firstRef : undefined} collapsable={false}>
          <Card title={r.account.name}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: t.tx2, fontSize: 14 }}>残高</Text>
              <Text style={{ color: t.tx, fontSize: 15, fontWeight: '700' }}>{faBal(r.bal)}</Text>
            </View>
            {tags.map((g) => (
              <View key={g.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: g.color || t.ac }} />
                <View style={{ flex: 1, gap: 1 }}>
                  <Text style={{ color: t.tx2, fontSize: 15 }}>{g.name}</Text>
                  {/* 記帳で増減があれば、配分と合わせた残りを出す */}
                  {flow[g.id] ? (() => {
                    const left = toAmount(val(r.account.id, g.id)) + flow[g.id];
                    return (
                      <Text style={{ color: left < 0 ? t.red : t.tx3, fontSize: 12.5 }}>
                        残り {faBal(left)}（記帳 {fas(flow[g.id])}）
                      </Text>
                    );
                  })() : null}
                </View>
                <Input
                  value={val(r.account.id, g.id)}
                  onChangeText={(v) => setVal(r.account.id, g.id, v)}
                  keyboardType="number-pad" placeholder="0"
                  style={{ width: 132, textAlign: 'right', paddingVertical: 7 }}
                />
              </View>
            ))}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: t.bd, paddingTop: 8 }}>
              <Text style={{ color: t.tx2, fontSize: 14 }}>未配分</Text>
              <Text style={{ color: free < 0 ? t.red : t.tx, fontSize: 15, fontWeight: '700' }}>
                {faBal(free)}{free < 0 ? '（配分超過）' : ''}
              </Text>
            </View>
          </Card>
          </View>
        );
      })}

      <View ref={saveRef} collapsable={false}>
        <Button label="保存" onPress={() => { commit(); toast('保存しました'); tour?.saved('alloc'); }} />
      </View>
      <Button label="タグ間で付け替え" variant="ghost" onPress={() => router.push('/manage/tag-move')} />
      <Text style={{ color: t.tx3, fontSize: 13, lineHeight: 20 }}>
        配分は残高を動かしません。「この口座のうち、いくらを何に取っておくか」という目安です。記帳でタグを付けると、そのタグの残りが増減します。
      </Text>
    </Screen>
  );
}
