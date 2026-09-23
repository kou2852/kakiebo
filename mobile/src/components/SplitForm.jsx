// 複合仕訳（借方・貸方が複数行になる仕訳）の入力。
//
// 簡易フォーム（支出・収入・振替）は1対1の仕訳しか作れない。
// 「1万円払って、うち食費6千・日用品4千」「給与から社会保険料と税を引いて手取りが入る」
// といった取引はこちらでないと表せず、これまでは編集を断っていた。
//
// 複式簿記の原則どおり、借方合計と貸方合計が一致しないと保存できない。
// 一致していない帳簿は貸借対照表が壊れるので、ここは緩めない。
import { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useData } from '../store/DataProvider';
import { useTheme } from '../theme';
import { Button, Card, ChipRow, Field, Input } from './ui';
import AccountPicker from './AccountPicker';
import { fa, fas, today, uid } from '../utils/format';
import { selectable } from '../utils/hiddenAccounts';

const newLine = (side) => ({ key: uid(), accountId: '', side, amount: '' });

/** 既存の仕訳を編集用の形へ。行の並びは借方→貸方に揃える。 */
export function toSplitForm(journal) {
  const conv = (l) => ({ key: uid(), accountId: l.accountId, side: l.side, amount: String(l.amount), tagId: l.tagId || '' });
  return {
    date: journal.date,
    desc: journal.desc || '',
    lines: [
      ...journal.lines.filter((l) => l.side === 'dr').map(conv),
      ...journal.lines.filter((l) => l.side === 'cr').map(conv),
    ],
  };
}

export default function SplitForm({ initial, onSubmit, submitLabel = '保存', onDelete }) {
  const t = useTheme();
  const { accounts, tags } = useData();

  const [f, setF] = useState(() => initial || {
    date: today(), desc: '',
    lines: [newLine('dr'), newLine('cr')],
  });

  const num = (v) => Number(String(v).replace(/[^0-9]/g, '')) || 0;

  const drTotal = f.lines.filter((l) => l.side === 'dr').reduce((s, l) => s + num(l.amount), 0);
  const crTotal = f.lines.filter((l) => l.side === 'cr').reduce((s, l) => s + num(l.amount), 0);
  const diff = drTotal - crTotal;

  const filled = f.lines.filter((l) => l.accountId && num(l.amount) > 0);
  const ok = diff === 0 && drTotal > 0
    && filled.some((l) => l.side === 'dr') && filled.some((l) => l.side === 'cr')
    && /^\d{4}-\d{2}-\d{2}$/.test(f.date);

  const setLine = (key, patch) =>
    setF((p) => ({ ...p, lines: p.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) }));
  const addLine = (side) => setF((p) => ({ ...p, lines: [...p.lines, newLine(side)] }));
  const removeLine = (key) => setF((p) => ({ ...p, lines: p.lines.filter((l) => l.key !== key) }));

  // 片側にだけ金額を入れた状態から、反対側の1行に差額を入れる。手計算を避けるため。
  const fillDiff = (key) => setLine(key, { amount: String(num(f.lines.find((l) => l.key === key)?.amount) + Math.abs(diff)) });

  const submit = () => onSubmit({
    id: initial?.id || uid(),
    date: f.date,
    desc: f.desc.trim(),
    lines: filled.map((l) => ({
      accountId: l.accountId, side: l.side, amount: num(l.amount), taxRate: 0,
      ...(l.tagId ? { tagId: l.tagId } : {}),
    })),
  });

  // JSX ではなく関数として呼ぶ（コンポーネント化するとレンダーごとに作り直され、入力欄のフォーカスが飛ぶ）
  const sideBlock = (side, label) => {
    const rows = f.lines.filter((l) => l.side === side);
    return (
      <Card title={label}>
        {rows.map((l) => (
          <View key={l.key} style={{ gap: 6, paddingBottom: 8, borderBottomWidth: rows.length > 1 ? 1 : 0, borderBottomColor: t.bd }}>
            <AccountPicker label="科目" accounts={selectable(accounts, [l.accountId])} value={l.accountId}
              onChange={(v) => setLine(l.key, { accountId: v })} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Input
                value={String(l.amount)} onChangeText={(v) => setLine(l.key, { amount: v })}
                keyboardType="number-pad" placeholder="0"
                style={{ flex: 1, textAlign: 'right', fontSize: 18, fontWeight: '700' }}
              />
              {diff !== 0 && ((side === 'dr' && diff < 0) || (side === 'cr' && diff > 0)) ? (
                <TouchableOpacity onPress={() => fillDiff(l.key)}
                  style={{ borderWidth: 1, borderColor: t.ac, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 11 }}>
                  <Text style={{ color: t.ac, fontSize: 13, fontWeight: '700' }}>差額 {fa(diff)}</Text>
                </TouchableOpacity>
              ) : null}
              {rows.length > 1 ? (
                <TouchableOpacity onPress={() => removeLine(l.key)} style={{ padding: 7 }}>
                  <Text style={{ color: t.red, fontSize: 17 }}>×</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            {tags.length ? (
              <ChipRow
                options={[{ value: '', label: 'タグなし' }, ...tags.map((g) => ({ value: g.id, label: g.name }))]}
                value={l.tagId || ''} onChange={(v) => setLine(l.key, { tagId: v })}
              />
            ) : null}
          </View>
        ))}
        <Button label={`${label}に行を追加`} variant="ghost" onPress={() => addLine(side)} />
      </Card>
    );
  };

  return (
    <>
      <Card>
        <Field label="日付">
          <Input value={f.date} onChangeText={(v) => setF((p) => ({ ...p, date: v }))}
            placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" />
        </Field>
        <Field label="摘要">
          <Input value={f.desc} onChangeText={(v) => setF((p) => ({ ...p, desc: v }))} placeholder="給与 など" />
        </Field>
      </Card>

      {sideBlock('dr', '借方（増える側・費用）')}
      {sideBlock('cr', '貸方（減る側・収益）')}

      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ color: t.tx2, fontSize: 15 }}>借方合計</Text>
          <Text style={{ color: t.tx, fontSize: 15, fontWeight: '700' }}>{fa(drTotal)}</Text>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ color: t.tx2, fontSize: 15 }}>貸方合計</Text>
          <Text style={{ color: t.tx, fontSize: 15, fontWeight: '700' }}>{fa(crTotal)}</Text>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: t.bd, paddingTop: 8 }}>
          <Text style={{ color: t.tx2, fontSize: 15 }}>差額</Text>
          <Text style={{ color: diff === 0 ? t.grn : t.red, fontSize: 16, fontWeight: '800' }}>
            {diff === 0 ? '一致' : fas(diff)}
          </Text>
        </View>
        {diff !== 0 ? (
          <Text style={{ color: t.tx3, fontSize: 13 }}>
            借方と貸方が一致しないと保存できません。複式簿記では必ず同額になります。
          </Text>
        ) : null}
      </Card>

      <Button label={submitLabel} onPress={submit} disabled={!ok} />
      {onDelete ? <Button label="この仕訳を削除" variant="ghost" onPress={onDelete} /> : null}
    </>
  );
}
