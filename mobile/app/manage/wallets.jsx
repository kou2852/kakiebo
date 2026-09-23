import { useState } from 'react';
import { Alert, Text, TouchableOpacity } from 'react-native';
import { useData } from '../../src/store/DataProvider';
import { useTheme } from '../../src/theme';
import { Button, Card, ChipRow, Empty, Field, Input, Screen, sep } from '../../src/components/ui';
import { uid } from '../../src/utils/format';
import { selectable } from '../../src/utils/hiddenAccounts';

export default function Wallets() {
  const t = useTheme();
  const { wallets, accounts, save, del } = useData();
  const [editing, setEditing] = useState(null);

  // 口座は「資産または負債の科目」に紐づく支払い手段の別名。
  const opts = selectable(accounts, [editing?.accountId])
    .filter((a) => a.type === 'asset' || a.type === 'liability')
    .map((a) => ({ value: a.id, label: a.name }));

  const commit = () => {
    const name = editing.name.trim();
    if (!name || !editing.accountId) return;
    save('wallets', { id: editing.id || uid(), name, accountId: editing.accountId });
    setEditing(null);
  };

  const remove = (w) => Alert.alert('削除しますか？', w.name, [
    { text: 'キャンセル', style: 'cancel' },
    { text: '削除', style: 'destructive', onPress: () => del('wallets', w.id) },
  ]);

  if (editing) {
    return (
      <Screen>
        <Card title={editing.id ? '口座を編集' : '口座を追加'}>
          <Field label="名称">
            <Input value={editing.name} onChangeText={(v) => setEditing((e) => ({ ...e, name: v }))} placeholder="例: 日常口座" />
          </Field>
          <Field label="紐づける科目">
            <ChipRow options={opts} value={editing.accountId} onChange={(v) => setEditing((e) => ({ ...e, accountId: v }))} />
          </Field>
        </Card>
        <Button label="保存" onPress={commit} disabled={!editing.name.trim() || !editing.accountId} />
        <Button label="キャンセル" variant="ghost" onPress={() => setEditing(null)} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Button label="口座を追加" onPress={() => setEditing({ name: '', accountId: opts[0]?.value || '' })} />
      <Card>
        {wallets.length === 0 ? <Empty text="口座がありません" /> : wallets.map((w) => (
          <TouchableOpacity key={w.id} onPress={() => setEditing({ ...w })} onLongPress={() => remove(w)}
            style={[{ paddingVertical: 11 }, sep(t)]}>
            <Text style={{ color: t.tx, fontSize: 16 }}>{w.name}</Text>
            <Text style={{ color: t.tx3, fontSize: 13 }}>
              {accounts.find((a) => a.id === w.accountId)?.name || '(科目なし)'}
            </Text>
          </TouchableOpacity>
        ))}
      </Card>
      <Text style={{ color: t.tx3, fontSize: 13, textAlign: 'center' }}>タップで編集・長押しで削除</Text>
    </Screen>
  );
}
