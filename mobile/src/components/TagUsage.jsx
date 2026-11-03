// ホームの「資産の使いみち」。口座ごとに、そのお金がどのタグ（目的）のものかを帯で見せる。
// ウェブ版 Dashboard/TagAllocationPanel.jsx の移植（2026-10-15）。
//
// 帯の中には文字を書かない（細くて読めない）。口座の行をタップすると、タグごとの額と割合を開く。
// 凡例は置かない（2026-10-16 指示）。タグの名前と色は、口座を開いた中の一覧で分かる。
// 帯にはマイナスを描けないので、使いすぎ（マイナス）と配分超過は帯の下に赤で書く。出さないと数字が合わない。
// カード払いのように口座から引き落とされていない分は、引き落とし日まで帯に出ない（集計の仕様。ウェブと同じ）。
import { useMemo, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useData } from '../store/DataProvider';
import { useTheme } from '../theme';
import { Card } from './ui';
import { useMoney } from '../store/hideAmounts';
import { isInvestmentAsset, tagAllocation } from '../utils/bookkeeping';
import { useTourTarget } from '../store/TourProvider';

export default function TagUsage({ asOf }) {
  const t = useTheme();
  const router = useRouter();
  const { journals: all, accounts, tags, allocs, wallets } = useData();
  // 時点は「口座の残高」のカードと同じ。先の日付の仕訳まで入れると、口座の額がカードとずれる（2026-10-21）
  const journals = useMemo(() => (asOf ? all.filter((j) => j.date <= asOf) : all), [all, asOf]);
  const [open, setOpen] = useState(() => new Set());
  // ホームの「金額を隠す」に合わせる
  const { faBal } = useMoney();
  const ref = useTourTarget('tag-usage');

  // 投資用の口座（有価証券・固定資産など）は出さない（2026-10-24 指示）。資産合計も、出している口座の合計になる
  const rows = useMemo(
    () => tagAllocation(journals, accounts, tags, allocs, wallets).filter((r) => !isInvestmentAsset(r.account)),
    [journals, accounts, tags, allocs, wallets]
  );

  // タグを使っていない、または配分が1件も無いなら出さない（ウェブと同じ）
  if (!(tags || []).length || !rows.some((r) => r.items.length)) return null;

  const total = rows.reduce((s, r) => s + r.bal, 0);
  const toggle = (id) => setOpen((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <View ref={ref} collapsable={false}>
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ color: t.tx3, fontSize: 13.5, letterSpacing: 0.3, fontWeight: '700' }}>資産の使いみち</Text>
        <TouchableOpacity onPress={() => router.push('/manage/tag-move')} accessibilityRole="link" hitSlop={8}>
          <Text style={{ color: t.ac, fontSize: 13.5, fontWeight: '600' }}>タグ付け替え ›</Text>
        </TouchableOpacity>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Text style={{ color: t.tx3, fontSize: 13 }}>資産合計</Text>
        <Text style={{ color: t.tx, fontSize: 16, fontWeight: '800' }}>{faBal(total)}</Text>
      </View>

      {rows.map((r) => {
        const isOpen = open.has(r.account.id);
        const segs = [
          ...r.items.filter((i) => i.amount > 0).map((i) => ({ ...i, key: i.tagId })),
          ...(r.free > 0 ? [{ key: '__free', name: r.defaultTag, color: r.defaultColor, amount: r.free }] : []),
        ];
        const negatives = r.items.filter((i) => i.amount < 0);
        const pct = (v) => (r.bal ? `${((v / r.bal) * 100).toFixed(1)}%` : '—');

        return (
          <View key={r.account.id} style={{ gap: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: t.bd }}>
            <TouchableOpacity onPress={() => toggle(r.account.id)} accessibilityRole="button"
              accessibilityState={{ expanded: isOpen }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name={isOpen ? 'chevron-down' : 'chevron-forward'} size={15} color={isOpen ? t.ac : t.tx3} />
              <Text style={{ color: t.tx, fontSize: 15, fontWeight: '600', flex: 1 }} numberOfLines={1}>{r.account.name}</Text>
              <Text style={{ color: r.bal < 0 ? t.red : t.tx2, fontSize: 14.5 }}>{faBal(r.bal)}</Text>
            </TouchableOpacity>

            <View style={{ flexDirection: 'row', height: 18, borderRadius: 5, overflow: 'hidden', backgroundColor: t.bg4, marginLeft: 23 }}>
              {segs.map((s) => <View key={s.key} style={{ flex: s.amount, backgroundColor: s.color }} />)}
            </View>

            {negatives.length || r.free < 0 ? (
              <Text style={{ color: t.red, fontSize: 12.5, marginLeft: 23 }}>
                {[
                  ...negatives.map((i) => `${i.name} ${faBal(i.amount)}（使いすぎ）`),
                  ...(r.free < 0 ? [`配分超過 ${faBal(r.free)}`] : []),
                ].join('　')}
              </Text>
            ) : null}

            {isOpen ? (
              <View style={{ marginLeft: 23, backgroundColor: t.bg3, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10 }}>
                {r.items.map((i) => (
                  <View key={i.tagId} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: i.color }} />
                    <Text style={{ color: t.tx2, fontSize: 14, flex: 1 }} numberOfLines={1}>{i.name}</Text>
                    <Text style={{ color: i.amount < 0 ? t.red : t.tx, fontSize: 14, fontWeight: '600' }}>{faBal(i.amount)}</Text>
                    <Text style={{ color: t.tx3, fontSize: 12.5, minWidth: 48, textAlign: 'right' }}>{pct(i.amount)}</Text>
                  </View>
                ))}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: r.defaultColor }} />
                  <Text style={{ color: r.free < 0 ? t.red : t.tx3, fontSize: 14, flex: 1 }}>{r.free < 0 ? '配分超過' : r.defaultTag}</Text>
                  <Text style={{ color: r.free < 0 ? t.red : t.tx3, fontSize: 14 }}>{faBal(r.free)}</Text>
                  <Text style={{ color: t.tx3, fontSize: 12.5, minWidth: 48, textAlign: 'right' }}>{pct(r.free)}</Text>
                </View>
              </View>
            ) : null}
          </View>
        );
      })}
    </Card>
    </View>
  );
}
