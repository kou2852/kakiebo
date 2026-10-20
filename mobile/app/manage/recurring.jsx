import { useMemo, useState } from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';
import { useData } from '../../src/store/DataProvider';
import { useTheme } from '../../src/theme';
import { Button, Card, ChipRow, Empty, Field, Input, Screen, sep } from '../../src/components/ui';
import ReorderList, { ReorderToggle } from '../../src/components/ReorderList';
import { setListOrder } from '../../src/store/listOrder';
import DateField from '../../src/components/DateField';
import { fa, today, uid } from '../../src/utils/format';
import { dueRecurring, generateRecurring, nextAhead, skipNext } from '../../src/utils/autoGen';
import SwipeRow from '../../src/components/SwipeRow';
import { useTour, useTourTarget } from '../../src/store/TourProvider';
import { selectable } from '../../src/utils/hiddenAccounts';
import { carryLine, rowsToSplits, sameTagRows, splitsToRows, storeLineTags, tagRowsProblem } from '../../src/utils/journalTags';
import SplitForm, { toSplitForm } from '../../src/components/SplitForm';
import TagSplitPicker from '../../src/components/TagSplitPicker';
import { useToast } from '../../src/store/ToastProvider';

const FREQ = [
  { value: 'monthly', label: '毎月' },
  { value: 'weekly', label: '毎週' },
  { value: 'yearly', label: '毎年' },
];
const TYPES = [
  { value: 'out', label: '支出', dr: ['expense'], cr: ['asset', 'liability'] },
  { value: 'in', label: '収入', dr: ['asset'], cr: ['income'] },
];

export default function Recurring() {
  const listRef = useTourTarget('recurring-list');
  const saveRef = useTourTarget('recurring-save');
  const genRef = useTourTarget('recurring-gen');
  const tour = useTour();
  const t = useTheme();
  const toast = useToast();
  const { recurring, journals, accounts, tags, save, del, setAll } = useData();
  const [sorting, setSorting] = useState(false);
  const [editing, setEditing] = useState(null);

  const due = useMemo(() => dueRecurring(recurring, journals), [recurring, journals]);
  const name = (id) => accounts.find((a) => a.id === id)?.name || '?';
  const opts = (types) => selectable(accounts, [editing?.drId, editing?.crId])
    .filter((a) => types.includes(a.type)).map((a) => ({ value: a.id, label: a.name }));

  // 期日が来た分をまとめて記帳する。Web 版の autoGen をそのまま使う。
  const generate = async () => {
    const n = await generateRecurring({
      recurring,
      journals,
      addJournal: (d) => { const j = { id: uid(), ...d }; save('journals', j); return j; },
      saveRecurring: (list) => setAll('recurring', list),
    });
    if (n) tour?.saved('recurring-gen');
    Alert.alert(n ? '記帳しました' : '対象がありません', n ? `${n} 件の仕訳を作成しました` : '期日が来ている定期取引はありません');
  };

  // 次の予定日を記帳せずに飛ばす。次回予定日だけを1周期進める（記帳はしない）
  const skip = (id) => {
    const r = recurring.find((x) => x.id === id);
    if (!r) return;
    const k = skipNext(r, journals);
    Alert.alert('この回を飛ばしますか？', `${r.name}（${k.skipped}）は記帳せずに飛ばし、次回を ${k.next} にします。`, [
      { text: 'キャンセル', style: 'cancel' },
      { text: '飛ばす', onPress: () => { save('recurring', k.r); setEditing(null); toast(`${k.skipped} の「${r.name}」を飛ばしました`); } },
    ]);
  };

  // 期日の前に、次の予定日付きで先に記帳する。押すたびに次の回へ進む。消すと次回予定は元に戻る
  const early = async (id) => {
    const r = recurring.find((x) => x.id === id);
    const a = r && nextAhead(r, journals);
    if (!a) return;
    const n = await generateRecurring({
      recurring,
      journals,
      addJournal: (d) => { const j = { id: uid(), ...d }; save('journals', j); return j; },
      saveRecurring: (list) => setAll('recurring', list),
      preGenerate: true,
      onlyId: id,
    });
    setEditing(null);
    toast(n ? `${a.date} の「${r.name}」を先に記帳しました` : '先に記帳できる予定がありません');
  };

  // 行を左へスライドしたときの操作。期日が来た未記帳がある行は「先に記帳」を出さない（そちらは上のカードで記帳する）
  const rowActions = (r) => {
    const ahead = nextAhead(r, journals);
    return [
      { label: '飛ばす', color: t.tx2, textColor: t.bg1, onPress: () => skip(r.id) },
      ...(ahead ? [{ label: '先に記帳', color: t.ac, textColor: t.acTx, onPress: () => early(r.id) }] : []),
    ];
  };

  const num = (v) => Number(String(v || '').replace(/[^0-9]/g, '')) || 0;

  const startNew = () => setEditing({
    name: '', desc: '', type: 'out', frequency: 'monthly', nextDate: today(), amount: '', multi: false, tagRows: [],
    drId: accounts.find((a) => a.type === 'expense' && !a.hidden)?.id || '',
    crId: accounts.find((a) => a.type === 'asset' && !a.hidden)?.id || '',
  });

  // ⚠ 借方・貸方が2行以上の定期取引（ウェブで作ったものを含む）は、必ず明細の形で開く。
  //   以前は借方・貸方の先頭1行ずつで作り直していたため、保存すると残りの明細が消えていた。
  const startEdit = (r) => {
    const drs = r.lines.filter((l) => l.side === 'dr');
    const crs = r.lines.filter((l) => l.side === 'cr');
    if (drs.length !== 1 || crs.length !== 1) {
      setEditing({
        id: r.id, name: r.name, frequency: r.frequency || 'monthly', multi: true,
        split: toSplitForm({ date: r.nextDate || today(), desc: r.desc || '', lines: r.lines }),
      });
      return;
    }
    const dr = drs[0];
    const cr = crs[0];
    const drType = accounts.find((a) => a.id === dr?.accountId)?.type;
    // タグは借方・貸方のどちらに付いていても同じ意味。別々のタグが付いている行は、この形では直せないのでそのまま引き継ぐ
    const dRows = splitsToRows(dr);
    const cRows = splitsToRows(cr);
    setEditing({
      id: r.id, name: r.name, desc: r.desc || '',
      type: drType === 'expense' ? 'out' : 'in',
      frequency: r.frequency || 'monthly', nextDate: r.nextDate || today(),
      amount: String(dr?.amount || ''), drId: dr?.accountId || '', crId: cr?.accountId || '',
      multi: false, tagRows: dRows.length ? dRows : cRows, tagLocked: !sameTagRows(dRows, cRows),
    });
  };

  // 1対1の入力から明細の形へ。いま選んでいる科目・金額・タグを、借方1行・貸方1行として引き継ぐ
  const toMulti = () => setEditing((e) => {
    const n = num(e.amount);
    const prev = recurring.find((r) => r.id === e.id);
    const splits = rowsToSplits(e.tagRows, n);
    const mk = (side, accountId) => {
      const out = carryLine(prev?.lines?.find((l) => l.side === side), { accountId, side, amount: n });
      if (!e.tagLocked) { delete out.tagId; if (splits.length) out.splits = splits; else delete out.splits; }
      return out;
    };
    const split = toSplitForm({ date: e.nextDate, desc: e.desc, lines: [mk('dr', e.drId), mk('cr', e.crId)] });
    return { ...e, multi: true, split: { ...split, lines: split.lines.map((l) => ({ ...l, amount: n > 0 ? String(n) : '' })) } };
  });

  const commit = () => {
    const n = num(editing.amount);
    const nm = editing.name.trim();
    if (!nm || !n || !editing.drId || !editing.crId) return;
    if (!editing.tagLocked && tagRowsProblem(editing.tagRows)) return;
    const splits = rowsToSplits(editing.tagRows, n);
    // ⚠ 元の定期取引の項目を引き継ぐ。以前は行を作り直していたため、ウェブで付けたタグが
    //   保存のたびに消えていた（生成される仕訳にもタグが付かなくなる）。
    const prev = recurring.find((r) => r.id === editing.id);
    const prevLine = (side) => prev?.lines?.find((l) => l.side === side);
    save('recurring', {
      ...prev,
      id: editing.id || uid(),
      name: nm, desc: editing.desc.trim(),
      frequency: editing.frequency,
      // 日付そのものが次回予定。day は Web 版が月次の日付保持に使うので合わせて持つ。
      day: Number(editing.nextDate.slice(8, 10)),
      nextDate: editing.nextDate,
      lines: [['dr', editing.drId], ['cr', editing.crId]].map(([side, accountId]) => {
        const out = carryLine(prevLine(side), { accountId, side, amount: n });
        // タグは借方・貸方の両方の行に付ける（二重には数えない）。別々のタグが付いていた行は触らない
        return editing.tagLocked ? out : storeLineTags(out, splits, n);
      }),
    });
    setEditing(null);
    toast('保存しました');
  };

  // 明細の形（複数の科目・タグの分割）で保存する。貸借が合うことは SplitForm が保証する
  const commitMulti = (j) => {
    const nm = editing.name.trim();
    if (!nm) return;
    const prev = recurring.find((r) => r.id === editing.id);
    save('recurring', {
      ...prev,
      id: editing.id || uid(),
      name: nm, desc: j.desc,
      frequency: editing.frequency,
      day: Number(j.date.slice(8, 10)),
      nextDate: j.date,
      lines: j.lines.map((l) => storeLineTags({ ...l }, l.splits || [], l.amount)),
    });
    setEditing(null);
    toast('保存しました');
    tour?.saved('recurring');
  };

  const remove = (r) => Alert.alert('削除しますか？', r.name, [
    { text: 'キャンセル', style: 'cancel' },
    { text: '削除', style: 'destructive', onPress: () => del('recurring', r.id) },
  ]);

  if (editing) {
    const editingRec = editing.id ? recurring.find((x) => x.id === editing.id) : null;
    const set = (k) => (v) => setEditing((e) => ({ ...e, [k]: v }));
    const nextCard = editingRec ? (
      <Card title="次回の予定">
        <Text style={{ color: t.tx2, fontSize: 14, lineHeight: 21 }}>
          次回は {skipNext(editingRec, journals).skipped}。記帳せずに飛ばすか、期日の前に先に記帳できます（上の入力は保存されません）。
        </Text>
        <Button label="この回を飛ばす" variant="ghost" onPress={() => skip(editingRec.id)} />
        {nextAhead(editingRec, journals) ? (
          <Button label={`${nextAhead(editingRec, journals).date} の分を先に記帳する`} variant="ghost" onPress={() => early(editingRec.id)} />
        ) : null}
      </Card>
    ) : null;

    if (editing.multi) {
      return (
        <Screen>
          <Card title={editing.id ? '定期取引を編集（明細）' : '定期取引を追加（明細）'}>
            <Field label="名称">
              <Input value={editing.name} onChangeText={set('name')} placeholder="例: 給与" />
            </Field>
            <Field label="頻度">
              <ChipRow options={FREQ} value={editing.frequency} onChange={set('frequency')} />
            </Field>
          </Card>
          {nextCard}
          <SplitForm initial={editing.split} dateLabel="次回の予定日" descLabel="摘要（任意・空なら名称を使う）"
            canSubmit={!!editing.name.trim()} submitLabel="保存" onSubmit={commitMulti} />
          <Button label="キャンセル" variant="ghost" onPress={() => setEditing(null)} />
        </Screen>
      );
    }

    const spec = TYPES.find((x) => x.value === editing.type);
    return (
      <Screen>
        <Card title={editing.id ? '定期取引を編集' : '定期取引を追加'}>
          <Field label="名称">
            <Input value={editing.name} onChangeText={set('name')} placeholder="例: 家賃" />
          </Field>
          <Field label="金額">
            <Input value={String(editing.amount)} onChangeText={set('amount')} keyboardType="number-pad"
              style={{ fontSize: 22, fontWeight: '700', textAlign: 'right' }} />
          </Field>
          <Field label="頻度">
            <ChipRow options={FREQ} value={editing.frequency} onChange={set('frequency')} />
          </Field>
          <Field label="次回の予定日">
            <DateField value={editing.nextDate} onChangeText={set('nextDate')} />
          </Field>
          <Field label="摘要（任意・空なら名称を使う）">
            <Input value={editing.desc} onChangeText={set('desc')} />
          </Field>
          <Field label="種別">
            <ChipRow options={TYPES.map(({ value, label }) => ({ value, label }))} value={editing.type} onChange={set('type')} />
          </Field>
        </Card>
        <Card title={editing.type === 'in' ? '入金先' : '費目'}>
          <ChipRow options={opts(spec.dr)} value={editing.drId} onChange={set('drId')} />
        </Card>
        <Card title={editing.type === 'in' ? '収入元' : '支払方法'}>
          <ChipRow options={opts(spec.cr)} value={editing.crId} onChange={set('crId')} />
        </Card>
        {editing.tagLocked ? (
          <Card title="タグ">
            <Text style={{ color: t.tx3, fontSize: 13, lineHeight: 20 }}>
              この定期取引は、増える側と減る側に別のタグが付いています。「明細を分ける」で直せます。ここで保存してもタグは消えません。
            </Text>
          </Card>
        ) : tags.length ? (
          <Card title="タグ">
            <TagSplitPicker tags={tags} rows={editing.tagRows} amount={num(editing.amount)} onChange={set('tagRows')} />
          </Card>
        ) : null}
        <Button label="明細を分ける（複数の科目・タグの分割へ）" variant="ghost" onPress={toMulti} />
        {nextCard}
        <View ref={saveRef} collapsable={false}>
          <Button label="保存" onPress={() => { commit(); tour?.saved('recurring'); }} disabled={!editing.name.trim() || !editing.amount || (!editing.tagLocked && !!tagRowsProblem(editing.tagRows))} />
        </View>
        <Button label="キャンセル" variant="ghost" onPress={() => setEditing(null)} />
      </Screen>
    );
  }

  // 通常の行と、並び替え中の行で、同じ中身を使う
  const rowBody = (r) => (
    <>
            <Text style={{ color: t.tx, fontSize: 16 }}>
              {r.name}
              <Text style={{ color: t.tx2, fontWeight: '400' }}>  {fa(r.lines.filter((l) => l.side === 'dr').reduce((x, l) => x + (l.amount || 0), 0))}</Text>
            </Text>
            <Text style={{ color: t.tx3, fontSize: 13 }}>
              {FREQ.find((f) => f.value === r.frequency)?.label || r.frequency} · 次回 {r.nextDate} ·{' '}
              {r.lines.filter((l) => l.side === 'dr').map((l) => name(l.accountId)).join('・')} ← {r.lines.filter((l) => l.side === 'cr').map((l) => name(l.accountId)).join('・')}
            </Text>
    </>
  );

  return (
    <Screen>
      {due.length ? (
        <Card title="期日が来ています">
          {due.map((d) => (
            <View key={d.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ color: t.tx2, fontSize: 15, flex: 1 }}>
                {d.name}（{d.dates.length <= 2 ? d.dates.join('・') : `${d.dates[0]} ほか${d.dates.length - 1}回`}）
              </Text>
              <TouchableOpacity onPress={() => skip(d.id)} accessibilityRole="button" style={{ paddingVertical: 6 }}>
                <Text style={{ color: t.ac, fontSize: 15, fontWeight: '600' }}>{d.dates[0].slice(5)} を飛ばす</Text>
              </TouchableOpacity>
            </View>
          ))}
          <View ref={genRef} collapsable={false}>
            <Button label={`${due.length} 件を記帳する`} onPress={generate} />
          </View>
        </Card>
      ) : null}

      <View ref={listRef} collapsable={false}>
        <Button label="定期取引を追加" onPress={startNew} />
      </View>
      <ReorderToggle active={sorting} onPress={() => setSorting((v) => !v)} count={recurring.length} />
      <Card>
        {recurring.length === 0 ? <Empty text="定期取引がありません" /> : sorting ? (
          <ReorderList items={recurring} onChange={(ids) => setListOrder('recurring', ids)}
            renderRow={(r) => <View style={{ paddingVertical: 11 }}>{rowBody(r)}</View>} />
        ) : recurring.map((r) => (
          <SwipeRow key={r.id} actions={rowActions(r)}>
            {/* 背景を塗る。塗らないと、スライド中に後ろのボタンが透けて見える */}
            <TouchableOpacity onPress={() => startEdit(r)} onLongPress={() => remove(r)}
              style={[{ paddingVertical: 11, backgroundColor: t.bg1 }, sep(t)]}>
              {rowBody(r)}
            </TouchableOpacity>
          </SwipeRow>
        ))}
      </Card>
      <Text style={{ color: t.tx3, fontSize: 13, textAlign: 'center' }}>{sorting ? '≡ をドラッグして並び替えます。終わったら「完了」を押します' : 'タップで編集・左へスライドで「飛ばす」「先に記帳」・長押しで削除'}</Text>
    </Screen>
  );
}
