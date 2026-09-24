// 自動仕訳ルール。摘要にキーワードが含まれていたら、借方・貸方を自動で決める。
//
// 一行入力・CSV取込・レシート読み取りの3つすべてがここを参照する。
// 使うほど記帳が速くなる仕組みで、この画面が無いと3機能とも本来の速さが出ない。
import { useState } from 'react';
import { Alert, Text, TouchableOpacity } from 'react-native';
import { useData } from '../../src/store/DataProvider';
import { useTheme } from '../../src/theme';
import { Button, Card, ChipRow, Empty, Field, Input, Screen, sep } from '../../src/components/ui';
import { uid } from '../../src/utils/format';
import { selectable } from '../../src/utils/hiddenAccounts';

export default function Rules() {
  const t = useTheme();
  const { rules, accounts, journals, save, del } = useData();
  const [editing, setEditing] = useState(null);

  const name = (id) => accounts.find((a) => a.id === id)?.name || '?';
  const pickable = selectable(accounts, [editing?.drAccountId, editing?.crAccountId]);
  const drOpts = pickable.filter((a) => a.type === 'expense' || a.type === 'asset')
    .map((a) => ({ value: a.id, label: a.name }));
  const crOpts = pickable.filter((a) => a.type === 'asset' || a.type === 'liability' || a.type === 'income')
    .map((a) => ({ value: a.id, label: a.name }));

  // 既存の仕訳から、まだルールが無い摘要をよく使う順に出す。ゼロから考えるより速い。
  const suggestions = (() => {
    const counts = {};
    journals.forEach((j) => {
      const d = (j.desc || '').trim();
      if (d.length < 2) return;
      if ((rules || []).some((r) => r.keyword && d.includes(r.keyword))) return;
      counts[d] = (counts[d] || 0) + 1;
    });
    return Object.entries(counts).filter(([, n]) => n >= 2)
      .sort((a, b) => b[1] - a[1]).slice(0, 8);
  })();

  const startNew = (keyword = '') => setEditing({
    keyword,
    drAccountId: accounts.find((a) => a.type === 'expense' && !a.hidden)?.id || '',
    crAccountId: accounts.find((a) => a.type === 'asset' && !a.hidden)?.id || '',
  });

  const commit = () => {
    const k = editing.keyword.trim();
    if (!k || !editing.drAccountId || !editing.crAccountId) return;
    // 元のルールの項目を引き継ぐ。ウェブで設定したタグ（tagId）を保存で消さないため。
    save('rules', {
      ...rules.find((r) => r.id === editing.id),
      id: editing.id || uid(),
      keyword: k,
      drAccountId: editing.drAccountId,
      crAccountId: editing.crAccountId,
    });
    setEditing(null);
  };

  const remove = (r) => Alert.alert('削除しますか？', r.keyword, [
    { text: 'キャンセル', style: 'cancel' },
    { text: '削除', style: 'destructive', onPress: () => del('rules', r.id) },
  ]);

  if (editing) {
    const set = (k) => (v) => setEditing((e) => ({ ...e, [k]: v }));
    return (
      <Screen>
        <Card title={editing.id ? 'ルールを編集' : 'ルールを追加'}>
          <Text style={{ color: t.tx3, fontSize: 13, lineHeight: 20 }}>
            摘要にこの文字が含まれていれば、下の組み合わせで記帳します。部分一致です。
          </Text>
          <Field label="キーワード">
            <Input value={editing.keyword} onChangeText={set('keyword')} placeholder="例: セブン" autoCapitalize="none" />
          </Field>
        </Card>
        <Card title="借方（費目・入金先）">
          <ChipRow options={drOpts} value={editing.drAccountId} onChange={set('drAccountId')} />
        </Card>
        <Card title="貸方（支払方法・収入元）">
          <ChipRow options={crOpts} value={editing.crAccountId} onChange={set('crAccountId')} />
        </Card>
        <Button label="保存" onPress={commit} disabled={!editing.keyword.trim()} />
        <Button label="キャンセル" variant="ghost" onPress={() => setEditing(null)} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Card>
        <Text style={{ color: t.tx2, fontSize: 14, lineHeight: 21 }}>
          一行入力・CSV取込・レシート読み取りが、ここのルールを見て科目を決めます。
          登録するほど入力が速くなります。
        </Text>
        <Button label="ルールを追加" onPress={() => startNew()} />
      </Card>

      {suggestions.length ? (
        <Card title="よく使う摘要（ルール未登録）">
          <Text style={{ color: t.tx3, fontSize: 13 }}>タップするとキーワードに入れて作成します。</Text>
          <ChipRow
            options={suggestions.map(([d, n]) => ({ value: d, label: `${d} (${n})` }))}
            value={null}
            onChange={(d) => startNew(d)}
          />
        </Card>
      ) : null}

      <Card>
        {(rules || []).length === 0 ? <Empty text="ルールがありません" /> : rules.map((r) => (
          <TouchableOpacity key={r.id} onPress={() => setEditing({ ...r })} onLongPress={() => remove(r)}
            style={[{ paddingVertical: 11 }, sep(t)]}>
            <Text style={{ color: t.tx, fontSize: 16 }}>{r.keyword}</Text>
            <Text style={{ color: t.tx3, fontSize: 13 }}>
              {name(r.drAccountId)} ← {name(r.crAccountId)}
            </Text>
          </TouchableOpacity>
        ))}
      </Card>
      <Text style={{ color: t.tx3, fontSize: 13, textAlign: 'center' }}>タップで編集・長押しで削除</Text>
    </Screen>
  );
}
