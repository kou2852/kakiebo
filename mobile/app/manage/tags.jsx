import { useState } from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';
import { useData } from '../../src/store/DataProvider';
import { useTheme } from '../../src/theme';
import { Button, Card, Empty, Field, Input, Screen, sep } from '../../src/components/ui';
import { uid } from '../../src/utils/format';
import { useTourTarget } from '../../src/store/TourProvider';

// Web 版 utils/format.js の TAG_COLORS と同じ並び
const COLORS = ['#0d9488', '#14b8a6', '#10b981', '#5eb0e8', '#8b5cf6', '#f08a3c',
  '#e0a020', '#f43f5e', '#2bb673', '#4ad0a0', '#a78bfa', '#7fd1c4'];

export default function Tags() {
  const listRef = useTourTarget('tag-list');
  const t = useTheme();
  const { tags, journals, save, del } = useData();
  const [editing, setEditing] = useState(null);

  const remove = (g) => {
    const inUse = journals.some((j) => j.lines.some((l) => l.tagId === g.id));
    if (inUse) return Alert.alert('削除できません', 'このタグを使っている仕訳があります');
    Alert.alert('削除しますか？', g.name, [
      { text: 'キャンセル', style: 'cancel' },
      { text: '削除', style: 'destructive', onPress: () => del('tags', g.id) },
    ]);
  };

  const commit = () => {
    const name = editing.name.trim();
    if (!name) return;
    // 元のタグの項目を引き継ぐ。ウェブで入れた備考（note）を保存で消さないため。
    save('tags', { ...tags.find((g) => g.id === editing.id), id: editing.id || uid(), name, color: editing.color });
    setEditing(null);
  };

  if (editing) {
    return (
      <Screen>
        <Card title={editing.id ? 'タグを編集' : 'タグを追加'}>
          <Field label="名称">
            <Input value={editing.name} onChangeText={(v) => setEditing((e) => ({ ...e, name: v }))} placeholder="例: 生活費" />
          </Field>
          <Field label="色">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {COLORS.map((c) => (
                <TouchableOpacity key={c} onPress={() => setEditing((e) => ({ ...e, color: c }))}
                  style={{
                    width: 34, height: 34, borderRadius: 17, backgroundColor: c,
                    borderWidth: editing.color === c ? 3 : 0, borderColor: t.tx,
                  }} />
              ))}
            </View>
          </Field>
        </Card>
        <Button label="保存" onPress={commit} disabled={!editing.name.trim()} />
        <Button label="キャンセル" variant="ghost" onPress={() => setEditing(null)} />
      </Screen>
    );
  }

  return (
    <Screen>
      <View ref={listRef} collapsable={false}>
        <Button label="タグを追加" onPress={() => setEditing({ name: '', color: COLORS[0] })} />
      </View>
      <Card>
        {tags.length === 0 ? <Empty text="タグがありません" /> : tags.map((g) => (
          <TouchableOpacity key={g.id} onPress={() => setEditing({ ...g })} onLongPress={() => remove(g)}
            style={[{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11 }, sep(t)]}>
            <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: g.color || t.ac }} />
            <Text style={{ color: t.tx, fontSize: 16 }}>{g.name}</Text>
          </TouchableOpacity>
        ))}
      </Card>
      <Text style={{ color: t.tx3, fontSize: 13, textAlign: 'center' }}>タップで編集・長押しで削除</Text>
    </Screen>
  );
}
