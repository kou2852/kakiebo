import { useState } from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';
import { useData } from '../../src/store/DataProvider';
import { useTheme } from '../../src/theme';
import { Button, Card, Empty, Field, Input, Screen, sep } from '../../src/components/ui';
import ReorderList, { ReorderToggle } from '../../src/components/ReorderList';
import { setListOrder } from '../../src/store/listOrder';
import { uid } from '../../src/utils/format';
import { useTour, useTourTarget } from '../../src/store/TourProvider';
import { useToast } from '../../src/store/ToastProvider';

// Web 版 utils/format.js の TAG_COLORS と同じ並び
const COLORS = ['#0d9488', '#14b8a6', '#10b981', '#5eb0e8', '#8b5cf6', '#f08a3c',
  '#e0a020', '#f43f5e', '#2bb673', '#4ad0a0', '#a78bfa', '#7fd1c4'];

export default function Tags() {
  const listRef = useTourTarget('tag-list');
  const saveRef = useTourTarget('tag-save');
  const tour = useTour();
  const t = useTheme();
  const toast = useToast();
  const { tags, journals, save, del } = useData();
  const [sorting, setSorting] = useState(false);
  const [editing, setEditing] = useState(null);

  const remove = (g) => {
    // タグは splits（ウェブ・2026-10-15 以降のアプリ）と、古い形の tagId のどちらにも入っている
    const inUse = journals.some((j) => j.lines.some((l) => l.tagId === g.id || (l.splits || []).some((x) => x.tagId === g.id)));
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
    toast('保存しました');
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
        <View ref={saveRef} collapsable={false}>
          <Button label="保存" onPress={() => { commit(); tour?.saved('tag'); }} disabled={!editing.name.trim()} />
        </View>
        <Button label="キャンセル" variant="ghost" onPress={() => setEditing(null)} />
      </Screen>
    );
  }

  // 通常の行と、並び替え中の行で、同じ中身を使う
  const rowBody = (g) => (
    <>
            <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: g.color || t.ac }} />
            <Text style={{ color: t.tx, fontSize: 16 }}>{g.name}</Text>
    </>
  );

  return (
    <Screen>
      <View ref={listRef} collapsable={false}>
        <Button label="タグを追加" onPress={() => setEditing({ name: '', color: COLORS[0] })} />
      </View>
      <ReorderToggle active={sorting} onPress={() => setSorting((v) => !v)} count={tags.length} />
      <Card>
        {tags.length === 0 ? <Empty text="タグがありません" /> : sorting ? (
          <ReorderList items={tags} onChange={(ids) => setListOrder('tags', ids)}
            renderRow={(g) => <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11 }}>{rowBody(g)}</View>} />
        ) : tags.map((g) => (
          <TouchableOpacity key={g.id} onPress={() => setEditing({ ...g })} onLongPress={() => remove(g)}
            style={[{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11 }, sep(t)]}>
            {rowBody(g)}
          </TouchableOpacity>
        ))}
      </Card>
      <Text style={{ color: t.tx3, fontSize: 13, textAlign: 'center' }}>{sorting ? '≡ をドラッグして並び替えます。終わったら「完了」を押します' : 'タップで編集・長押しで削除'}</Text>
    </Screen>
  );
}
