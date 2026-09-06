import { useState } from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';
import { useData } from '../../src/store/DataProvider';
import { useTheme } from '../../src/theme';
import { Button, Card, ChipRow, Empty, Field, Input, Screen, sep } from '../../src/components/ui';
import { fa, uid } from '../../src/utils/format';
import { useTourTarget } from '../../src/store/TourProvider';

// 入力画面で1タップで呼び出す科目の組み合わせ。金額と日付は都度入力なので持たない。
const TYPES = [
  { value: 'out', label: '支出', dr: ['expense'], cr: ['asset', 'liability'] },
  { value: 'in', label: '収入', dr: ['asset'], cr: ['income'] },
];

export default function Presets() {
  const listRef = useTourTarget('preset-list');
  const t = useTheme();
  const { presets, accounts, save, del } = useData();
  const [editing, setEditing] = useState(null);

  const name = (id) => accounts.find((a) => a.id === id)?.name || '?';
  const spec = editing ? TYPES.find((x) => x.value === editing.type) : null;
  const opts = (types) => accounts.filter((a) => types.includes(a.type)).map((a) => ({ value: a.id, label: a.name }));

  const startNew = () => setEditing({
    name: '', desc: '', type: 'out', amount: '',
    drId: accounts.find((a) => a.type === 'expense')?.id || '',
    crId: accounts.find((a) => a.type === 'asset')?.id || '',
  });

  const startEdit = (p) => setEditing({
    id: p.id, name: p.name, desc: p.desc || '', type: p.type === 'in' ? 'in' : 'out',
    amount: String(p.lines.find((l) => l.side === 'dr')?.amount || ''),
    drId: p.lines.find((l) => l.side === 'dr')?.accountId || '',
    crId: p.lines.find((l) => l.side === 'cr')?.accountId || '',
  });

  const commit = () => {
    const n = editing.name.trim();
    if (!n || !editing.drId || !editing.crId) return;
    // 金額まで決めておくと、ホーム画面から開いた時点で入力が終わっている状態になる。
    const fixed = Number(String(editing.amount || '').replace(/[^0-9]/g, '')) || 0;
    save('presets', {
      id: editing.id || uid(),
      // walletId は Web 版の項目。モバイルからは設定しないので既存値を壊さないよう空で持つ。
      walletId: presets.find((p) => p.id === editing.id)?.walletId || '',
      type: editing.type, name: n, desc: editing.desc.trim(),
      lines: [
        { accountId: editing.drId, side: 'dr', amount: fixed, tagId: '' },
        { accountId: editing.crId, side: 'cr', amount: fixed, tagId: '' },
      ],
    });
    setEditing(null);
  };

  const remove = (p) => Alert.alert('削除しますか？', p.name, [
    { text: 'キャンセル', style: 'cancel' },
    { text: '削除', style: 'destructive', onPress: () => del('presets', p.id) },
  ]);

  if (editing) {
    return (
      <Screen>
        <Card title={editing.id ? 'プリセットを編集' : 'プリセットを追加'}>
          <Field label="名称">
            <Input value={editing.name} onChangeText={(v) => setEditing((e) => ({ ...e, name: v }))} placeholder="例: 食費（カード払い）" />
          </Field>
          <Field label="既定の金額（任意）">
            <Input value={String(editing.amount || '')} keyboardType="number-pad"
              onChangeText={(v) => setEditing((e) => ({ ...e, amount: v }))} placeholder="毎回同じ額なら入れておく" />
          </Field>
          <Field label="既定の摘要（任意）">
            <Input value={editing.desc} onChangeText={(v) => setEditing((e) => ({ ...e, desc: v }))} />
          </Field>
          <Field label="種別">
            <ChipRow options={TYPES.map(({ value, label }) => ({ value, label }))} value={editing.type}
              onChange={(v) => setEditing((e) => ({ ...e, type: v }))} />
          </Field>
        </Card>
        <Card title={editing.type === 'in' ? '入金先' : '費目'}>
          <ChipRow options={opts(spec.dr)} value={editing.drId} onChange={(v) => setEditing((e) => ({ ...e, drId: v }))} />
        </Card>
        <Card title={editing.type === 'in' ? '収入元' : '支払方法'}>
          <ChipRow options={opts(spec.cr)} value={editing.crId} onChange={(v) => setEditing((e) => ({ ...e, crId: v }))} />
        </Card>
        <Button label="保存" onPress={commit} disabled={!editing.name.trim()} />
        <Button label="キャンセル" variant="ghost" onPress={() => setEditing(null)} />
      </Screen>
    );
  }

  return (
    <Screen>
      <View ref={listRef} collapsable={false}>
        <Button label="プリセットを追加" onPress={startNew} />
      </View>
      <Card>
        {presets.length === 0 ? <Empty text="プリセットがありません" /> : presets.map((p) => (
          <TouchableOpacity key={p.id} onPress={() => startEdit(p)} onLongPress={() => remove(p)}
            style={[{ paddingVertical: 11 }, sep(t)]}>
            <Text style={{ color: t.tx, fontSize: 16 }}>
              {p.name}
              {p.lines.find((l) => l.side === 'dr')?.amount
                ? <Text style={{ color: t.tx2, fontWeight: '400' }}>{`  ${fa(p.lines.find((l) => l.side === 'dr').amount)}`}</Text>
                : null}
            </Text>
            <Text style={{ color: t.tx3, fontSize: 13 }}>
              {name(p.lines.find((l) => l.side === 'dr')?.accountId)}
              {'  ←  '}
              {name(p.lines.find((l) => l.side === 'cr')?.accountId)}
            </Text>
          </TouchableOpacity>
        ))}
      </Card>
      <Text style={{ color: t.tx3, fontSize: 13, textAlign: 'center' }}>タップで編集・長押しで削除</Text>
    </Screen>
  );
}
