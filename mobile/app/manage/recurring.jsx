import { useMemo, useState } from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';
import { useData } from '../../src/store/DataProvider';
import { useTheme } from '../../src/theme';
import { Button, Card, ChipRow, Empty, Field, Input, Screen, sep } from '../../src/components/ui';
import { fa, today, uid } from '../../src/utils/format';
import { dueRecurring, generateRecurring } from '../../src/utils/autoGen';
import { useTourTarget } from '../../src/store/TourProvider';
import { selectable } from '../../src/utils/hiddenAccounts';
import { carryLine } from '../../src/utils/journalTags';

const FREQ = [
  { value: 'monthly', label: '毎月' },
  { value: 'weekly', label: '毎週' },
  { value: 'yearly', label: '毎年' },
];
const TYPES = [
  { value: 'out', label: '支出', dr: ['expense'], cr: ['asset', 'liability'] },
  { value: 'in', label: '収入', dr: ['asset'], cr: ['income'] },
];

export default function Recurring() {
  const listRef = useTourTarget('recurring-list');
  const t = useTheme();
  const { recurring, journals, accounts, save, del, setAll } = useData();
  const [editing, setEditing] = useState(null);

  const due = useMemo(() => dueRecurring(recurring, journals), [recurring, journals]);
  const name = (id) => accounts.find((a) => a.id === id)?.name || '?';
  const opts = (types) => selectable(accounts, [editing?.drId, editing?.crId])
    .filter((a) => types.includes(a.type)).map((a) => ({ value: a.id, label: a.name }));

  // 期日が来た分をまとめて記帳する。Web 版の autoGen をそのまま使う。
  const generate = async () => {
    const n = await generateRecurring({
      recurring,
      journals,
      addJournal: (d) => { const j = { id: uid(), ...d }; save('journals', j); return j; },
      saveRecurring: (list) => setAll('recurring', list),
    });
    Alert.alert(n ? '記帳しました' : '対象がありません', n ? `${n} 件の仕訳を作成しました` : '期日が来ている定期取引はありません');
  };

  const startNew = () => setEditing({
    name: '', desc: '', type: 'out', frequency: 'monthly', nextDate: today(), amount: '',
    drId: accounts.find((a) => a.type === 'expense' && !a.hidden)?.id || '',
    crId: accounts.find((a) => a.type === 'asset' && !a.hidden)?.id || '',
  });

  const startEdit = (r) => {
    const dr = r.lines.find((l) => l.side === 'dr');
    const cr = r.lines.find((l) => l.side === 'cr');
    const drType = accounts.find((a) => a.id === dr?.accountId)?.type;
    setEditing({
      id: r.id, name: r.name, desc: r.desc || '',
      type: drType === 'expense' ? 'out' : 'in',
      frequency: r.frequency || 'monthly', nextDate: r.nextDate || today(),
      amount: String(dr?.amount || ''), drId: dr?.accountId || '', crId: cr?.accountId || '',
    });
  };

  const commit = () => {
    const n = Number(String(editing.amount).replace(/[^0-9]/g, ''));
    const nm = editing.name.trim();
    if (!nm || !n || !editing.drId || !editing.crId) return;
    // ⚠ 元の定期取引の項目を引き継ぐ。以前は行を作り直していたため、ウェブで付けたタグが
    //   保存のたびに消えていた（生成される仕訳にもタグが付かなくなる）。
    const prev = recurring.find((r) => r.id === editing.id);
    const prevLine = (side) => prev?.lines?.find((l) => l.side === side);
    save('recurring', {
      ...prev,
      id: editing.id || uid(),
      name: nm, desc: editing.desc.trim(),
      frequency: editing.frequency,
      // 日付そのものが次回予定。day は Web 版が月次の日付保持に使うので合わせて持つ。
      day: Number(editing.nextDate.slice(8, 10)),
      nextDate: editing.nextDate,
      lines: [
        carryLine(prevLine('dr'), { accountId: editing.drId, side: 'dr', amount: n }),
        carryLine(prevLine('cr'), { accountId: editing.crId, side: 'cr', amount: n }),
      ],
    });
    setEditing(null);
  };

  const remove = (r) => Alert.alert('削除しますか？', r.name, [
    { text: 'キャンセル', style: 'cancel' },
    { text: '削除', style: 'destructive', onPress: () => del('recurring', r.id) },
  ]);

  if (editing) {
    const spec = TYPES.find((x) => x.value === editing.type);
    const set = (k) => (v) => setEditing((e) => ({ ...e, [k]: v }));
    return (
      <Screen>
        <Card title={editing.id ? '定期取引を編集' : '定期取引を追加'}>
          <Field label="名称">
            <Input value={editing.name} onChangeText={set('name')} placeholder="例: 家賃" />
          </Field>
          <Field label="金額">
            <Input value={String(editing.amount)} onChangeText={set('amount')} keyboardType="number-pad"
              style={{ fontSize: 22, fontWeight: '700', textAlign: 'right' }} />
          </Field>
          <Field label="頻度">
            <ChipRow options={FREQ} value={editing.frequency} onChange={set('frequency')} />
          </Field>
          <Field label="次回の予定日">
            <Input value={editing.nextDate} onChangeText={set('nextDate')} placeholder="YYYY-MM-DD"
              keyboardType="numbers-and-punctuation" />
          </Field>
          <Field label="摘要（任意・空なら名称を使う）">
            <Input value={editing.desc} onChangeText={set('desc')} />
          </Field>
          <Field label="種別">
            <ChipRow options={TYPES.map(({ value, label }) => ({ value, label }))} value={editing.type} onChange={set('type')} />
          </Field>
        </Card>
        <Card title={editing.type === 'in' ? '入金先' : '費目'}>
          <ChipRow options={opts(spec.dr)} value={editing.drId} onChange={set('drId')} />
        </Card>
        <Card title={editing.type === 'in' ? '収入元' : '支払方法'}>
          <ChipRow options={opts(spec.cr)} value={editing.crId} onChange={set('crId')} />
        </Card>
        <Button label="保存" onPress={commit} disabled={!editing.name.trim() || !editing.amount} />
        <Button label="キャンセル" variant="ghost" onPress={() => setEditing(null)} />
      </Screen>
    );
  }

  return (
    <Screen>
      {due.length ? (
        <Card title="期日が来ています">
          {due.map((d) => (
            <Text key={d.id} style={{ color: t.tx2, fontSize: 15 }}>{d.name}（{d.date}）</Text>
          ))}
          <Button label={`${due.length} 件を記帳する`} onPress={generate} />
        </Card>
      ) : null}

      <View ref={listRef} collapsable={false}>
        <Button label="定期取引を追加" onPress={startNew} />
      </View>
      <Card>
        {recurring.length === 0 ? <Empty text="定期取引がありません" /> : recurring.map((r) => (
          <TouchableOpacity key={r.id} onPress={() => startEdit(r)} onLongPress={() => remove(r)}
            style={[{ paddingVertical: 11 }, sep(t)]}>
            <Text style={{ color: t.tx, fontSize: 16 }}>
              {r.name}
              <Text style={{ color: t.tx2, fontWeight: '400' }}>  {fa(r.lines.find((l) => l.side === 'dr')?.amount || 0)}</Text>
            </Text>
            <Text style={{ color: t.tx3, fontSize: 13 }}>
              {FREQ.find((f) => f.value === r.frequency)?.label || r.frequency} · 次回 {r.nextDate} ·{' '}
              {name(r.lines.find((l) => l.side === 'dr')?.accountId)} ← {name(r.lines.find((l) => l.side === 'cr')?.accountId)}
            </Text>
          </TouchableOpacity>
        ))}
      </Card>
      <Text style={{ color: t.tx3, fontSize: 13, textAlign: 'center' }}>タップで編集・長押しで削除</Text>
    </Screen>
  );
}
