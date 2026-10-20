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
import { Button, Card, Field, Input } from './ui';
import DateField from './DateField';
import AccountPicker from './AccountPicker';
import { fa, fas, today, uid } from '../utils/format';
import { selectable } from '../utils/hiddenAccounts';
import {
  carryLine, presetLineSplits, ratioRows, rowsToSplits, splitsToRows, tagRowsProblem,
} from '../utils/journalTags';
import TagSplitPicker from './TagSplitPicker';

const newLine = (side) => ({ key: uid(), accountId: '', side, amount: '', tagRows: [] });

/** 既存の仕訳を編集用の形へ。行の並びは借方→貸方に揃える。 */
export function toSplitForm(journal) {
  // orig は保存時に、入力欄に無い項目（税率など）を引き継ぐための元の行
  const conv = (l) => ({ key: uid(), accountId: l.accountId, side: l.side, amount: String(l.amount), tagRows: splitsToRows(l), orig: l });
  return {
    date: journal.date,
    desc: journal.desc || '',
    lines: [
      ...journal.lines.filter((l) => l.side === 'dr').map(conv),
      ...journal.lines.filter((l) => l.side === 'cr').map(conv),
    ],
  };
}

/** 借方か貸方のどちらかが2行以上あるプリセット（給与を2つの口座へ分けて入れる、など）。簡易フォームでは表せない */
export const isMultiPreset = (p) =>
  (p?.lines || []).filter((l) => l.side === 'dr').length > 1 || (p?.lines || []).filter((l) => l.side === 'cr').length > 1;

/** プリセットから記帳の初期値を作る。金額が0（都度入力）の行は空欄のまま出し、ここで入れてもらう。
 * 貸借が合っているかは記帳の保存時に確かめる（プリセットの保存時には見ない）。 */
export function presetToSplitForm(preset, date) {
  const conv = (l) => {
    // プリセットのタグ。金額を決めていない行の複数タグは比率なので、入れた金額に合わせて分ける
    const ps = presetLineSplits(l);
    const fixed = Number(l.amount) > 0;
    const tags = ps.length >= 2 && !fixed ? { tagRows: [], tagRatio: ps }
      : { tagRows: ps.length === 1 ? [{ tagId: ps[0].tagId, amount: '' }] : ps.map((x) => ({ tagId: x.tagId, amount: String(x.amount) })) };
    return {
      key: uid(), accountId: l.accountId, side: l.side,
      amount: fixed ? String(l.amount) : '', ...tags, orig: l,
    };
  };
  return {
    date: date || today(),
    desc: preset.desc || '',
    lines: [
      ...preset.lines.filter((l) => l.side === 'dr').map(conv),
      ...preset.lines.filter((l) => l.side === 'cr').map(conv),
    ],
  };
}

export default function SplitForm({ initial, date, onSubmit, submitLabel = '保存', onDelete, dateLabel = '日付', descLabel = '摘要', canSubmit = true }) {
  const t = useTheme();
  const { accounts, tags } = useData();

  const [f, setF] = useState(() => initial || {
    date: date || today(), desc: '',
    lines: [newLine('dr'), newLine('cr')],
  });

  const num = (v) => Number(String(v).replace(/[^0-9]/g, '')) || 0;

  const drTotal = f.lines.filter((l) => l.side === 'dr').reduce((s, l) => s + num(l.amount), 0);
  const crTotal = f.lines.filter((l) => l.side === 'cr').reduce((s, l) => s + num(l.amount), 0);
  const diff = drTotal - crTotal;

  // 行のタグ欄。金額を決めていないプリセットの複数タグは比率で持ち、入れた金額に合わせて分ける
  const rowsOf = (l) => (l.tagRatio ? ratioRows(l.tagRatio, num(l.amount)) : (l.tagRows || []));

  const filled = f.lines.filter((l) => l.accountId && num(l.amount) > 0);
  const tagOk = filled.every((l) => !tagRowsProblem(rowsOf(l)));
  const ok = diff === 0 && drTotal > 0 && tagOk
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
    lines: filled.map((l) => {
      const out = carryLine(l.orig, { accountId: l.accountId, side: l.side, amount: num(l.amount) });
      if (out.taxRate === undefined) out.taxRate = 0;
      // タグはウェブと同じ splits の形で持つ。⚠ 行の tagId には入れない（タグごとの残りに入らない）
      delete out.tagId;
      const splits = rowsToSplits(rowsOf(l), num(l.amount));
      if (splits.length) out.splits = splits; else delete out.splits;
      return out;
    }),
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
              <TagSplitPicker tags={tags} rows={rowsOf(l)} amount={num(l.amount)}
                onChange={(v) => setLine(l.key, { tagRows: v, tagRatio: null })} />
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
        <Field label={dateLabel}>
          <DateField value={f.date} onChangeText={(v) => setF((p) => ({ ...p, date: v }))} />
        </Field>
        <Field label={descLabel}>
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

      <Button label={submitLabel} onPress={submit} disabled={!ok || !canSubmit} />
      {onDelete ? <Button label="この仕訳を削除" variant="ghost" onPress={onDelete} /> : null}
    </>
  );
}
