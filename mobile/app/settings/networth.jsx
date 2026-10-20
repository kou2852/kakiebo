// 純資産に入れる科目を選ぶ画面（2026-10-17 追加）。組み合わせに名前を付けて複数保存し、ホームの純資産のカードに出すもの
// （「すべての科目」を含めて最大5つ。カードを横にスライドして見比べる。2026-10-18 指示）を選ぶ。
// 変わるのはホームの純資産（数字・推移・前月比）だけ。貸借対照表は全部の科目のまま。保存は端末ごと（store/netWorthSets.js）。
import { useState } from 'react';
import { Alert, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../src/theme';
import { Button, Card, Field, Input, Screen, sep } from '../../src/components/ui';
import { useData } from '../../src/store/DataProvider';
import { useToast } from '../../src/store/ToastProvider';
import { setNetWorthSets, useNetWorthSets } from '../../src/store/netWorthSets';
import { ALL, MAX_SHOWN, removeSet, toggleShown, upsertSet } from '../../src/utils/netWorthSets';
import { isHidden } from '../../src/utils/hiddenAccounts';
import { uid } from '../../src/utils/format';

const TYPE = { asset: '資産', liability: '負債' };

export default function NetWorthSettings() {
  const t = useTheme();
  const toast = useToast();
  const { accounts } = useData();
  const state = useNetWorthSets();
  const nameOf = (id) => accounts.find((a) => a.id === id)?.name;
  // 編集中の組み合わせ。null＝編集していない
  const [editing, setEditing] = useState(null); // { id?, name, exclude: string[] }

  // 選べるのは資産と負債。非表示の科目も、純資産には入っているので並べる
  const rows = accounts.filter((a) => a.type === 'asset' || a.type === 'liability');

  const startNew = () => setEditing({ name: '', exclude: [] });
  const startEdit = (s) => setEditing({ id: s.id, name: s.name, exclude: [...s.exclude] });
  const toggle = (id) => setEditing((e) => ({
    ...e, exclude: e.exclude.includes(id) ? e.exclude.filter((x) => x !== id) : [...e.exclude, id],
  }));

  const commit = () => {
    const name = editing.name.trim();
    if (!name) return;
    setNetWorthSets(upsertSet(state, { id: editing.id || uid(), name, exclude: editing.exclude }));
    setEditing(null);
    toast('保存しました');
  };
  const remove = () => Alert.alert('削除しますか？', editing.name, [
    { text: 'キャンセル', style: 'cancel' },
    { text: '削除', style: 'destructive', onPress: () => { setNetWorthSets(removeSet(state, editing.id)); setEditing(null); } },
  ]);

  if (editing) {
    return (
      <Screen>
        <Card title={editing.id ? '組み合わせを編集' : '組み合わせを作る'}>
          <Field label="名前">
            <Input value={editing.name} onChangeText={(v) => setEditing((e) => ({ ...e, name: v }))} placeholder="例: 仮口座を除く" />
          </Field>
        </Card>
        <Card title="純資産に入れる科目">
          {rows.map((a, i) => {
            const on = !editing.exclude.includes(a.id);
            return (
              <View key={a.id} style={[{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 }, i < rows.length - 1 ? sep(t) : null]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: on ? t.tx : t.tx3, fontSize: 16 }}>{a.name}</Text>
                  <Text style={{ color: t.tx3, fontSize: 12.5 }}>{TYPE[a.type]}{isHidden(a) ? '・非表示' : ''}</Text>
                </View>
                <Switch value={on} onValueChange={() => toggle(a.id)} trackColor={{ true: t.ac }} accessibilityLabel={`${a.name}を純資産に入れる`} />
              </View>
            );
          })}
        </Card>
        <Button label="保存" onPress={commit} disabled={!editing.name.trim()} />
        {editing.id ? <Button label="この組み合わせを削除" variant="danger" onPress={remove} /> : null}
        <Button label="キャンセル" variant="ghost" onPress={() => setEditing(null)} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={{ color: t.tx2, fontSize: 14, lineHeight: 21 }}>
        ホームの純資産に入れる科目を選びます。仮口座や投資を外した純資産などを、名前を付けて保存しておけます。貸借対照表は変わりません。
      </Text>
      <Card title={`ホームに出す組み合わせ（${state.shown.length}／${MAX_SHOWN}）`}>
        <Text style={{ color: t.tx3, fontSize: 13, lineHeight: 20 }}>
          選んだものが、ホームの純資産のカードに並びます。カードを横にスライドして見比べられます。{MAX_SHOWN}つまで選べます。
        </Text>
        {[{ id: ALL, name: 'すべての科目', exclude: [] }, ...state.sets].map((s) => {
          const on = state.shown.includes(s.id);
          const full = !on && state.shown.length >= MAX_SHOWN;
          return (
            <TouchableOpacity key={s.id} disabled={full} onPress={() => setNetWorthSets(toggleShown(state, s.id))}
              accessibilityRole="checkbox" accessibilityState={{ checked: on, disabled: full }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, opacity: full ? 0.4 : 1 }}>
              <View style={{
                width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: on ? t.ac : t.bd2,
                backgroundColor: on ? t.ac : 'transparent', alignItems: 'center', justifyContent: 'center',
              }}>
                {on ? <Text style={{ color: t.acTx, fontSize: 14, fontWeight: '800' }}>✓</Text> : null}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.tx, fontSize: 16 }}>{s.name}</Text>
                {s.id !== ALL ? (
                  <Text style={{ color: t.tx3, fontSize: 12.5 }} numberOfLines={1}>
                    外す科目: {s.exclude.map(nameOf).filter(Boolean).join('・') || 'なし'}
                  </Text>
                ) : null}
              </View>
            </TouchableOpacity>
          );
        })}
      </Card>
      {state.sets.length ? (
        <Card title="保存した組み合わせ">
          {state.sets.map((s, i) => (
            <Text key={s.id} onPress={() => startEdit(s)}
              style={[{ color: t.tx, fontSize: 16, paddingVertical: 11 }, i < state.sets.length - 1 ? sep(t) : null]}>
              {s.name}
            </Text>
          ))}
          <Text style={{ color: t.tx3, fontSize: 13 }}>タップで編集・削除</Text>
        </Card>
      ) : null}
      <Button label="組み合わせを作る" onPress={startNew} />
    </Screen>
  );
}
