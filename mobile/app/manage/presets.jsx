import { useRef, useState } from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';
import { useData } from '../../src/store/DataProvider';
import { useTheme } from '../../src/theme';
import { Button, Card, ChipRow, Empty, Field, Input, Screen, sep } from '../../src/components/ui';
import AccountPicker from '../../src/components/AccountPicker';
import { isMultiPreset } from '../../src/components/SplitForm';
import { fa, uid } from '../../src/utils/format';
import { useTourTarget } from '../../src/store/TourProvider';
import { selectable } from '../../src/utils/hiddenAccounts';
import { carryLine } from '../../src/utils/journalTags';
import { useToast } from '../../src/store/ToastProvider';

// 入力画面で1タップで呼び出す科目の組み合わせ。金額と日付は都度入力なので持たない。
//
// 「明細を分ける」にすると、借方・貸方を何行でも持てる（給与を「口座Aへ手取り」「口座Bへ積立分」と分けて入れる、など）。
// このときの金額は空でもよい（毎月変わる給与など）。空の行は記帳画面で入れてもらう。
// 保存時に貸借の合計は確かめない（2026-10-11 指示）。プリセットは毎回記帳画面で確かめてから保存するので、
// 貸借の一致は記帳画面（SplitForm）が保証する。
const TYPES = [
  { value: 'out', label: '支出', dr: ['expense'], cr: ['asset', 'liability'] },
  { value: 'in', label: '収入', dr: ['asset'], cr: ['income'] },
];

export default function Presets() {
  const listRef = useTourTarget('preset-list');
  const t = useTheme();
  const toast = useToast();
  const { presets, accounts, tags, save, del } = useData();
  const [editing, setEditing] = useState(null);

  const name = (id) => accounts.find((a) => a.id === id)?.name || '?';
  const spec = editing ? TYPES.find((x) => x.value === editing.type) : null;
  const opts = (types) => selectable(accounts, [editing?.drId, editing?.crId])
    .filter((a) => types.includes(a.type)).map((a) => ({ value: a.id, label: a.name }));

  const lineKey = useRef(0);
  const toLine = (l) => ({
    key: ++lineKey.current, side: l.side, accountId: l.accountId || '',
    amount: Number(l.amount) > 0 ? String(l.amount) : '', tagId: l.tagId || '',
    // 元の行（保存時に、入力欄に無い項目を引き継ぐ）。明示して渡されたらそれを使い、無ければ行そのもの
    orig: 'orig' in l ? l.orig : l,
  });

  const startNew = () => setEditing({
    name: '', desc: '', type: 'out', amount: '', multi: false, lines: [],
    drId: accounts.find((a) => a.type === 'expense' && !a.hidden)?.id || '',
    crId: accounts.find((a) => a.type === 'asset' && !a.hidden)?.id || '',
  });

  // ⚠ 明細が複数あるプリセット（ウェブで作ったものを含む）は、必ず明細の形で開く。
  //   以前は借方・貸方の先頭1行ずつで作り直していたため、保存すると残りの明細が消えていた。
  const startEdit = (p) => setEditing({
    id: p.id, name: p.name, desc: p.desc || '', type: p.type === 'in' ? 'in' : 'out',
    amount: String(p.lines.find((l) => l.side === 'dr')?.amount || ''),
    drId: p.lines.find((l) => l.side === 'dr')?.accountId || '',
    crId: p.lines.find((l) => l.side === 'cr')?.accountId || '',
    multi: isMultiPreset(p),
    lines: isMultiPreset(p)
      ? [...p.lines.filter((l) => l.side === 'dr'), ...p.lines.filter((l) => l.side === 'cr')].map(toLine)
      : [],
  });

  // 1対1の入力から明細の形へ。いま選んでいる科目と金額を、借方1行・貸方1行として引き継ぐ
  const toMulti = () => setEditing((e) => {
    const prev = presets.find((x) => x.id === e.id);
    const orig = (side) => prev?.lines?.find((l) => l.side === side);
    return {
      ...e, multi: true,
      lines: [
        toLine({ ...orig('dr'), side: 'dr', accountId: e.drId, amount: e.amount, orig: orig('dr') }),
        toLine({ ...orig('cr'), side: 'cr', accountId: e.crId, amount: e.amount, orig: orig('cr') }),
      ],
    };
  });
  const setLine = (key, patch) => setEditing((e) => ({ ...e, lines: e.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) }));
  const addLine = (side) => setEditing((e) => ({ ...e, lines: [...e.lines, toLine({ side })] }));
  const removeLine = (key) => setEditing((e) => ({ ...e, lines: e.lines.filter((l) => l.key !== key) }));
  const num = (v) => Number(String(v || '').replace(/[^0-9]/g, '')) || 0;
  // 明細の形で保存できるのは、借方と貸方にそれぞれ科目の入った行が1つ以上あるとき（金額は空でもよい）
  const multiOk = (e) => e.lines.some((l) => l.side === 'dr' && l.accountId) && e.lines.some((l) => l.side === 'cr' && l.accountId);

  const commit = () => {
    const n = editing.name.trim();
    if (editing.multi) {
      if (!n || !multiOk(editing)) return;
      const prev = presets.find((p) => p.id === editing.id);
      save('presets', {
        ...prev,
        id: editing.id || uid(),
        walletId: prev?.walletId || '',
        type: editing.type, name: n, desc: editing.desc.trim(),
        lines: editing.lines.filter((l) => l.accountId).map((l) => {
          // 元の行の項目（ウェブで付けた複数タグの配分など）を引き継ぐ
          const out = carryLine(l.orig?.accountId ? l.orig : undefined, { accountId: l.accountId, side: l.side, amount: num(l.amount) });
          if (out.taxRate === undefined) out.taxRate = 0;
          if (!out.splits?.length) { if (l.tagId) out.tagId = l.tagId; else delete out.tagId; }
          delete out.orig; delete out.key;
          return out;
        }),
      });
      setEditing(null);
      toast('保存しました');
      return;
    }
    if (!n || !editing.drId || !editing.crId) return;
    // 金額まで決めておくと、ホーム画面から開いた時点で入力が終わっている状態になる。
    const fixed = Number(String(editing.amount || '').replace(/[^0-9]/g, '')) || 0;
    // ⚠ 元のプリセットの項目を引き継ぐ。以前は行を作り直していたため、ウェブで付けたタグ
    //   （複数タグの配分 splits）が保存のたびに消えていた。
    const prev = presets.find((p) => p.id === editing.id);
    const prevLine = (side) => prev?.lines?.find((l) => l.side === side);
    save('presets', {
      ...prev,
      id: editing.id || uid(),
      // walletId は Web 版の項目。モバイルからは設定しないので既存値を壊さないよう空で持つ。
      walletId: presets.find((p) => p.id === editing.id)?.walletId || '',
      type: editing.type, name: n, desc: editing.desc.trim(),
      lines: [
        carryLine(prevLine('dr'), { accountId: editing.drId, side: 'dr', amount: fixed }),
        carryLine(prevLine('cr'), { accountId: editing.crId, side: 'cr', amount: fixed }),
      ],
    });
    setEditing(null);
    toast('保存しました');
  };

  const remove = (p) => Alert.alert('削除しますか？', p.name, [
    { text: 'キャンセル', style: 'cancel' },
    { text: '削除', style: 'destructive', onPress: () => del('presets', p.id) },
  ]);

  // 明細の形の、借方か貸方の一覧。JSX ではなく関数として呼ぶ（コンポーネント化すると入力欄のフォーカスが飛ぶ）
  const linesBlock = (side, label) => {
    const rows = editing.lines.filter((l) => l.side === side);
    return (
      <Card title={label}>
        {rows.map((l) => (
          <View key={l.key} style={{ gap: 6, paddingBottom: 8, borderBottomWidth: rows.length > 1 ? 1 : 0, borderBottomColor: t.bd }}>
            <AccountPicker label="科目" accounts={selectable(accounts, [l.accountId])} value={l.accountId}
              onChange={(v) => setLine(l.key, { accountId: v })} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Input value={String(l.amount)} onChangeText={(v) => setLine(l.key, { amount: v })}
                keyboardType="number-pad" placeholder="金額（空なら毎回入力）"
                style={{ flex: 1, textAlign: 'right', fontSize: 16 }} />
              {rows.length > 1 ? (
                <TouchableOpacity onPress={() => removeLine(l.key)} style={{ padding: 7 }}>
                  <Text style={{ color: t.red, fontSize: 17 }}>×</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            {l.orig?.splits?.length ? (
              <Text style={{ color: t.tx3, fontSize: 13 }}>複数のタグ（ウェブ版で編集できます。保存しても消えません）</Text>
            ) : tags.length ? (
              <ChipRow options={[{ value: '', label: 'タグなし' }, ...tags.map((g) => ({ value: g.id, label: g.name }))]}
                value={l.tagId || ''} onChange={(v) => setLine(l.key, { tagId: v })} />
            ) : null}
          </View>
        ))}
        <Button label={`${side === 'dr' ? '借方' : '貸方'}に行を追加`} variant="ghost" onPress={() => addLine(side)} />
      </Card>
    );
  };

  if (editing) {
    return (
      <Screen>
        <Card title={editing.id ? 'プリセットを編集' : 'プリセットを追加'}>
          <Field label="名称">
            <Input value={editing.name} onChangeText={(v) => setEditing((e) => ({ ...e, name: v }))} placeholder="例: 食費（カード払い）" />
          </Field>
          {editing.multi ? null : (
            <Field label="既定の金額（任意）">
              <Input value={String(editing.amount || '')} keyboardType="number-pad"
                onChangeText={(v) => setEditing((e) => ({ ...e, amount: v }))} placeholder="毎回同じ額なら入れておく" />
            </Field>
          )}
          <Field label="既定の摘要（任意）">
            <Input value={editing.desc} onChangeText={(v) => setEditing((e) => ({ ...e, desc: v }))} />
          </Field>
          <Field label="種別">
            <ChipRow options={TYPES.map(({ value, label }) => ({ value, label }))} value={editing.type}
              onChange={(v) => setEditing((e) => ({ ...e, type: v }))} />
          </Field>
        </Card>
        {editing.multi ? (
          <>
            {linesBlock('dr', '借方（入る側・費用）')}
            {linesBlock('cr', '貸方（出る側・収入）')}
            <Text style={{ color: t.tx3, fontSize: 13, lineHeight: 20 }}>
              金額は空のままでも保存できます。記帳するときに入れて、借方と貸方の合計がそろってから保存します。
            </Text>
          </>
        ) : (
          <>
            <Card title={editing.type === 'in' ? '入金先' : '費目'}>
              <ChipRow options={opts(spec.dr)} value={editing.drId} onChange={(v) => setEditing((e) => ({ ...e, drId: v }))} />
            </Card>
            <Card title={editing.type === 'in' ? '収入元' : '支払方法'}>
              <ChipRow options={opts(spec.cr)} value={editing.crId} onChange={(v) => setEditing((e) => ({ ...e, crId: v }))} />
            </Card>
            <Button label="明細を分ける（複数の口座・科目へ）" variant="ghost" onPress={toMulti} />
          </>
        )}
        <Button label="保存" onPress={commit} disabled={!editing.name.trim() || (editing.multi && !multiOk(editing))} />
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
              {isMultiPreset(p) ? `（明細${p.lines.length}行）` : ''}
            </Text>
          </TouchableOpacity>
        ))}
      </Card>
      <Text style={{ color: t.tx3, fontSize: 13, textAlign: 'center' }}>タップで編集・長押しで削除</Text>
    </Screen>
  );
}
