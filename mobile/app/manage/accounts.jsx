import { useMemo, useState } from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';
import { useData } from '../../src/store/DataProvider';
import { useTheme } from '../../src/theme';
import { Button, Card, ChipRow, Field, Input, Screen, sep } from '../../src/components/ui';
import { ACCOUNT_TYPES, faBal, uid } from '../../src/utils/format';
import { accountBalance, calcBalances } from '../../src/utils/bookkeeping';
import { nextCode } from '../../src/utils/accountCode';
import { useTourTarget } from '../../src/store/TourProvider';

const TYPE_OPTS = Object.entries(ACCOUNT_TYPES).map(([value, label]) => ({ value, label }));

export default function Accounts() {
  const listRef = useTourTarget('account-list');
  const addRef = useTourTarget('account-add');
  const t = useTheme();
  const { accounts, journals, save, del } = useData();
  const [editing, setEditing] = useState(null); // { id?, name, code, type }

  const balances = useMemo(() => calcBalances(journals, accounts), [journals, accounts]);
  const used = useMemo(() => {
    const s = new Set();
    journals.forEach((j) => j.lines.forEach((l) => s.add(l.accountId)));
    return s;
  }, [journals]);

  const startNew = () => setEditing({ name: '', code: nextCode(accounts, 'expense'), type: 'expense' });

  // 引落口座に選べるのは資産科目（現金・預金など）。
  const settleOpts = accounts.filter((a) => a.type === 'asset').map((a) => ({ value: a.id, label: a.name }));

  const commit = () => {
    const name = editing.name.trim();
    if (!name) return;
    // 区分を変えたのにコードが前の体系のままだと一覧の並びが崩れる。作り直す。
    const code = editing.code || nextCode(accounts, editing.type, editing.id);
    const cc = editing.type === 'liability' && editing.ccClose && editing.ccDay && editing.ccFrom
      ? {
        ccClose: Number(editing.ccClose),
        ccDay: Number(editing.ccDay),
        ccDelay: Number(editing.ccDelay) || 1,
        ccFrom: editing.ccFrom,
      }
      : {};
    save('accounts', { id: editing.id || uid(), name, code, type: editing.type, ...cc });
    setEditing(null);
  };

  const remove = (a) => {
    if (a.sys) return Alert.alert('削除できません', '既定の勘定科目は削除できません');
    if (used.has(a.id)) return Alert.alert('削除できません', 'この科目を使っている仕訳があります');
    Alert.alert('削除しますか？', a.name, [
      { text: 'キャンセル', style: 'cancel' },
      { text: '削除', style: 'destructive', onPress: () => del('accounts', a.id) },
    ]);
  };

  if (editing) {
    return (
      <Screen>
        <Card title={editing.id ? '勘定科目を編集' : '勘定科目を追加'}>
          <Field label="名称">
            <Input value={editing.name} onChangeText={(v) => setEditing((e) => ({ ...e, name: v }))} placeholder="例: 交際費" />
          </Field>
          <Field label="区分">
            <ChipRow options={TYPE_OPTS} value={editing.type}
              onChange={(v) => setEditing((e) => ({ ...e, type: v, code: nextCode(accounts, v, e.id) }))} />
          </Field>
          <Field label="コード">
            <Input value={editing.code} onChangeText={(v) => setEditing((e) => ({ ...e, code: v }))} keyboardType="number-pad" />
          </Field>
        </Card>

        {editing.type === 'liability' ? (
          <Card title="クレジットカードの設定（任意）">
            <Text style={{ color: t.tx3, fontSize: 13, lineHeight: 20 }}>
              締め日・引落日・引落口座をすべて入れると、レポートの「カード」に締めから引き落としまでのサイクルが出ます。
            </Text>
            <Field label="締め日（1〜31）">
              <Input value={String(editing.ccClose || '')} keyboardType="number-pad"
                onChangeText={(v) => setEditing((e) => ({ ...e, ccClose: v }))} placeholder="例: 15" />
            </Field>
            <Field label="引落日（1〜31）">
              <Input value={String(editing.ccDay || '')} keyboardType="number-pad"
                onChangeText={(v) => setEditing((e) => ({ ...e, ccDay: v }))} placeholder="例: 10" />
            </Field>
            <Field label="引き落とし月">
              <ChipRow
                options={[{ value: 1, label: '締めの翌月' }, { value: 2, label: '翌々月' }]}
                value={Number(editing.ccDelay) || 1}
                onChange={(v) => setEditing((e) => ({ ...e, ccDelay: v }))}
              />
            </Field>
            <Field label="引落口座">
              <ChipRow options={settleOpts} value={editing.ccFrom}
                onChange={(v) => setEditing((e) => ({ ...e, ccFrom: v }))} />
            </Field>
          </Card>
        ) : null}
        <Button label="保存" onPress={commit} disabled={!editing.name.trim()} />
        <Button label="キャンセル" variant="ghost" onPress={() => setEditing(null)} />
      </Screen>
    );
  }

  return (
    <Screen>
      <View ref={addRef} collapsable={false}>
        <Button label="勘定科目を追加" onPress={startNew} />
      </View>
      {/* 一覧は種別ごとに分かれているので、囲みは最初の塊だけに付ける。
          ツアーは「科目は自由に足せる」と伝えるのが目的で、全部を囲む必要はない。 */}
      {TYPE_OPTS.map(({ value, label }, typeIndex) => {
        const rows = accounts.filter((a) => a.type === value).sort((a, b) => (a.code > b.code ? 1 : -1));
        if (!rows.length) return null;
        return (
          <View key={value} ref={typeIndex === 0 ? listRef : undefined} collapsable={false}>
          <Card title={label}>
            {rows.map((a) => (
              <TouchableOpacity key={a.id} onPress={() => setEditing({ ...a })} onLongPress={() => remove(a)}
                style={[{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9 }, sep(t)]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.tx, fontSize: 15 }}>{a.name}</Text>
                  <Text style={{ color: t.tx3, fontSize: 13 }}>{a.code}{a.sys ? ' · 既定' : ''}</Text>
                </View>
                <Text style={{ color: t.tx2, fontSize: 15 }}>{faBal(accountBalance(a.id, accounts, balances))}</Text>
              </TouchableOpacity>
            ))}
          </Card>
          </View>
        );
      })}
      <Text style={{ color: t.tx3, fontSize: 13, textAlign: 'center' }}>タップで編集・長押しで削除</Text>
    </Screen>
  );
}
