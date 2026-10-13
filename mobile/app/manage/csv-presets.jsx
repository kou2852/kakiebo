// CSV 取り込みの「保存した割り当て」を管理する画面。名前の変更・列の項目の変更・削除ができる。
// 追加は CSV の画面で行う（CSV を読み込み、列の項目を選んで、名前を付けて取り込む）。
// 保存先は端末（src/utils/csvMapping.js の kk_csv_presets）。
import { useEffect, useState } from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useData } from '../../src/store/DataProvider';
import { useTheme } from '../../src/theme';
import { Button, Card, ChipRow, Empty, Field, Input, Screen, sep } from '../../src/components/ui';
import { selectable } from '../../src/utils/hiddenAccounts';
import { COLUMN_ROLES, loadCsvPresets, saveCsvPresets } from '../../src/utils/csvMapping';

const ROLE_LABEL = Object.fromEntries(COLUMN_ROLES.map((r) => [r.value, r.label]));
const ROLE_OPTS = COLUMN_ROLES.map((r) => ({ value: r.value, label: r.label }));
const SIGNS = [
  { value: 'positive', label: '支出が正の数' },
  { value: 'negative', label: '支出が負の数' },
];

/** 保存した見出し（署名）から列の名前を出す。見出し無しの CSV は「n列目」 */
const columnNames = (p) => {
  const n = p.roles?.length || 0;
  const heads = p.headerless ? [] : String(p.sig || '').split('|');
  return Array.from({ length: n }, (_, i) => heads[i] || `${i + 1}列目`);
};

export default function CsvPresets() {
  const t = useTheme();
  const router = useRouter();
  const { accounts } = useData();
  const [presets, setPresets] = useState(null);
  const [editing, setEditing] = useState(null); // 編集中のプリセット（写し）
  useEffect(() => { loadCsvPresets().then(setPresets); }, []);

  const persist = (next) => { setPresets(next); saveCsvPresets(next); };
  const name = (id) => accounts.find((a) => a.id === id)?.name || '—';
  const opts = (types, cur) => selectable(accounts, [cur]).filter((a) => types.includes(a.type)).map((a) => ({ value: a.id, label: a.name }));

  const remove = (p) => Alert.alert('この割り当てを削除しますか？', p.name || '（名前なし）', [
    { text: 'キャンセル', style: 'cancel' },
    { text: '削除', style: 'destructive', onPress: () => { persist(presets.filter((x) => x.id !== p.id)); setEditing(null); } },
  ]);

  if (!presets) return <Screen><Empty text="読み込み中…" /></Screen>;

  if (editing) {
    const cols = columnNames(editing);
    const set = (patch) => setEditing((e) => ({ ...e, ...patch }));
    const has = (r) => (editing.roles || []).includes(r);
    return (
      <Screen>
        <Card title="割り当てを編集">
          <Field label="名前">
            <Input value={editing.name} onChangeText={(v) => set({ name: v })} placeholder="例: 三井住友カード" />
          </Field>
        </Card>
        <Card title="列の項目">
          <Text style={{ color: t.tx3, fontSize: 13 }}>保存したときの CSV の見出しです。それぞれの列が何かを選び直せます。</Text>
          {cols.map((c, i) => (
            <View key={i} style={{ gap: 4 }}>
              <Text style={{ color: t.tx2, fontSize: 14, fontWeight: '700' }}>{`${i + 1}. ${c}`}</Text>
              <ChipRow options={ROLE_OPTS} value={editing.roles[i]}
                onChange={(v) => set({ roles: editing.roles.map((r, j) => (j === i ? v : r)) })} />
            </View>
          ))}
        </Card>
        {has('amount') ? (
          <Card title="金額の符号">
            <ChipRow options={SIGNS} value={editing.sign || 'positive'} onChange={(v) => set({ sign: v })} />
          </Card>
        ) : null}
        <Card title="科目が決まらない行に使う科目">
          <Field label="費目（支出の借方）">
            <ChipRow options={opts(['expense'], editing.expenseId)} value={editing.expenseId} onChange={(v) => set({ expenseId: v })} />
          </Field>
          <Field label="口座・カード・支払方法">
            <ChipRow options={opts(['asset', 'liability'], editing.accountId)} value={editing.accountId} onChange={(v) => set({ accountId: v })} />
          </Field>
          {has('in') ? (
            <Field label="入金の科目（貸方）">
              <ChipRow options={opts(['income'], editing.incomeId)} value={editing.incomeId} onChange={(v) => set({ incomeId: v })} />
            </Field>
          ) : null}
        </Card>
        <Button label="保存" onPress={() => { persist(presets.map((x) => (x.id === editing.id ? editing : x))); setEditing(null); }} />
        <Button label="この割り当てを削除" variant="ghost" onPress={() => remove(editing)} />
        <Button label="キャンセル" variant="ghost" onPress={() => setEditing(null)} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Card>
        {presets.length === 0 ? <Empty text="保存した割り当てはありません" /> : presets.map((p, i) => (
          <TouchableOpacity key={p.id} onPress={() => setEditing({ ...p, roles: [...(p.roles || [])] })} onLongPress={() => remove(p)}
            style={[{ paddingVertical: 11, gap: 3 }, i < presets.length - 1 ? sep(t) : null]}>
            <Text style={{ color: t.tx, fontSize: 16 }}>{p.name || '（名前なし）'}</Text>
            <Text style={{ color: t.tx3, fontSize: 13 }} numberOfLines={2}>
              {(p.roles || []).map((r, j) => (r === 'none' ? null : `${columnNames(p)[j]}→${ROLE_LABEL[r]}`)).filter(Boolean).join('・') || '列の項目が未設定'}
            </Text>
            <Text style={{ color: t.tx3, fontSize: 12.5 }}>{`費目 ${name(p.expenseId)} ／ 支払方法 ${name(p.accountId)}`}</Text>
          </TouchableOpacity>
        ))}
      </Card>
      <Text style={{ color: t.tx3, fontSize: 13, textAlign: 'center' }}>タップで編集・長押しで削除</Text>
      <Card title="割り当てを追加する">
        <Text style={{ color: t.tx2, fontSize: 14, lineHeight: 21 }}>
          CSV の画面で CSV を読み込み、列の項目を選んでから、「この割り当てに名前を付けて保存」に名前を入れて取り込むと追加されます。
        </Text>
        <Button label="CSV の画面を開く" variant="ghost" onPress={() => router.back()} />
      </Card>
    </Screen>
  );
}
