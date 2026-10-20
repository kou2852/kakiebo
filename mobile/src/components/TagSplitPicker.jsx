// 記帳のタグ欄。1つの科目（行）に、タグを複数付けられる（ウェブ版のタグ分割と同じ考え方）。
//
// ・タグを選ぶと、タグごとの金額の欄が出る。1つだけのときは空欄のまま＝全額（いちばん多い使い方なので手数を増やさない）
// ・1つでも金額を入れれば、その金額だけに付く（記帳の金額のうち一部だけを目的に充てられる）
// ・2つ以上のときは、すべてのタグに金額を入れる
// ・タグの金額の合計は、記帳の金額と合わせなくてよい（超えても止めない・2026-10-20）
// 行の形と保存の形（splits）の変換は utils/journalTags.js（rowsToSplits / splitsToRows）。
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../theme';
import { Input } from './ui';
import { fa } from '../utils/format';
import { tagRowsProblem } from '../utils/journalTags';

const yenOf = (v) => Number(String(v ?? '').replace(/[^0-9]/g, '')) || 0;

export default function TagSplitPicker({ tags, rows, amount, onChange }) {
  const t = useTheme();
  const on = new Set(rows.map((r) => r.tagId));

  const toggle = (id) => {
    if (on.has(id)) {
      onChange(rows.filter((r) => r.tagId !== id));
    } else {
      onChange([...rows, { tagId: id, amount: '' }]);
    }
  };
  const setAmount = (id, v) => onChange(rows.map((r) => (r.tagId === id ? { ...r, amount: v } : r)));

  const sum = rows.reduce((s, r) => s + yenOf(r.amount), 0);
  const problem = tagRowsProblem(rows);
  const byId = new Map(tags.map((g) => [g.id, g]));

  return (
    <View style={{ gap: 10 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }} keyboardShouldPersistTaps="handled">
        {tags.map((g) => {
          const sel = on.has(g.id);
          return (
            <TouchableOpacity key={g.id} onPress={() => toggle(g.id)}
              accessibilityRole="checkbox" accessibilityState={{ checked: sel }}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                backgroundColor: sel ? t.ac : t.bg3, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 12,
              }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: g.color || t.tx3, borderWidth: sel ? 1 : 0, borderColor: t.acTx }} />
              <Text style={{ color: sel ? t.acTx : t.tx2, fontSize: 14.5, fontWeight: sel ? '700' : '500' }}>{g.name}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {rows.length === 1 && String(rows[0].amount ?? '') === '' ? (
        <Text style={{ color: t.tx3, fontSize: 13 }}>空欄なら記帳の金額の全額に付きます。一部だけ付けるときは金額を入れてください。</Text>
      ) : null}

      {rows.length ? (
        <View style={{ gap: 8 }}>
          {rows.map((r) => (
            <View key={r.tagId} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: byId.get(r.tagId)?.color || t.tx3 }} />
              <Text style={{ color: t.tx2, fontSize: 15, flex: 1 }} numberOfLines={1}>{byId.get(r.tagId)?.name || '?'}</Text>
              <Input value={String(r.amount ?? '')} onChangeText={(v) => setAmount(r.tagId, v)}
                keyboardType="number-pad" placeholder={rows.length === 1 ? '全額' : '0'}
                style={{ width: 132, textAlign: 'right', paddingVertical: 7 }} />
            </View>
          ))}
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 16 }}>
            <Text style={{ color: t.tx3, fontSize: 13 }}>合計 {fa(sum)}</Text>
            {amount > 0 && sum > 0 ? (
              <Text style={{ color: t.tx3, fontSize: 13 }}>記帳の金額との差 {fa(amount - sum)}</Text>
            ) : null}
          </View>
        </View>
      ) : null}

      {problem ? <Text style={{ color: t.red, fontSize: 13 }}>{problem}</Text> : null}
    </View>
  );
}
