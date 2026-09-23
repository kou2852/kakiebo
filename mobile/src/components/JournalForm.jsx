// 仕訳の入力フォーム。新規入力（タブ）と編集（モーダル）で共用する。
// 家計の入力を速くするため、借方/貸方を直接選ばせず「支出・収入・振替」に置き換えている。
// 3行以上の複合仕訳はこの形では表現できないので、その場合は編集を断って Web 版へ誘導する。
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { useData } from '../store/DataProvider';
import { useTheme } from '../theme';
import { Button, Card, ChipRow, Field, Input } from './ui';
import AccountPicker from './AccountPicker';
import { today, uid } from '../utils/format';
import { selectable } from '../utils/hiddenAccounts';

const TYPES = [
  { value: 'out', label: '支出', dr: ['expense'], cr: ['asset', 'liability'] },
  { value: 'in', label: '収入', dr: ['asset'], cr: ['income'] },
  { value: 'mv', label: '振替', dr: ['asset', 'liability'], cr: ['asset', 'liability'] },
];

const pick = (accounts, types) => accounts.filter((a) => types.includes(a.type));

/** 既存の仕訳から入力欄の初期値を復元する。判別できなければ null（＝編集不可）。 */
export function toForm(journal, accounts) {
  const dr = journal.lines.filter((l) => l.side === 'dr');
  const cr = journal.lines.filter((l) => l.side === 'cr');
  if (dr.length !== 1 || cr.length !== 1) return null;
  const typeOf = (id) => accounts.find((a) => a.id === id)?.type;
  const d = typeOf(dr[0].accountId);
  const c = typeOf(cr[0].accountId);
  const type = TYPES.find((t) => t.dr.includes(d) && t.cr.includes(c))?.value;
  if (!type) return null;
  return {
    type, date: journal.date, desc: journal.desc || '',
    amount: String(dr[0].amount), drId: dr[0].accountId, crId: cr[0].accountId,
    tagId: dr[0].tagId || cr[0].tagId || '',
  };
}

export default function JournalForm({ initial, onSubmit, submitLabel = '保存', onDelete }) {
  const t = useTheme();
  const { accounts, tags, presets } = useData();

  const [f, setF] = useState(() => initial || {
    type: 'out', date: today(), desc: '', amount: '', drId: '', crId: '', tagId: '',
  });
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }));

  const spec = TYPES.find((x) => x.value === f.type);
  // 非表示の科目は候補から外す。いま選ばれている科目（編集中の仕訳・当てたプリセット）は残す。
  const drOpts = useMemo(() => pick(selectable(accounts, [f.drId]), spec.dr), [accounts, spec.dr, f.drId]);
  const crOpts = useMemo(() => pick(selectable(accounts, [f.crId]), spec.cr), [accounts, spec.cr, f.crId]);

  // 型を変えると選べる科目が変わる。選択が範囲外なら先頭に戻す。
  const dr = drOpts.some((o) => o.id === f.drId) ? f.drId : drOpts[0]?.id;
  const cr = crOpts.some((o) => o.id === f.crId) ? f.crId : crOpts[0]?.id;

  const n = Number(String(f.amount).replace(/[^0-9]/g, ''));
  const ok = n > 0 && dr && cr && dr !== cr && /^\d{4}-\d{2}-\d{2}$/.test(f.date);

  // プリセットは科目の組み合わせを一発で入れる。既定の金額があればそれも入れる。
  const applyPreset = (id) => {
    const p = presets.find((x) => x.id === id);
    if (!p) return;
    const d = p.lines.find((l) => l.side === 'dr');
    const c = p.lines.find((l) => l.side === 'cr');
    const fixed = d?.amount || 0;
    setF((prev) => ({
      ...prev,
      type: p.type === 'in' ? 'in' : 'out',
      amount: fixed > 0 ? String(fixed) : prev.amount,
      drId: d?.accountId || prev.drId,
      crId: c?.accountId || prev.crId,
      desc: prev.desc || p.desc || '',
      tagId: d?.tagId || c?.tagId || prev.tagId,
    }));
  };

  const submit = () => onSubmit({
    id: initial?.id || uid(),
    date: f.date,
    desc: f.desc.trim(),
    lines: [
      { accountId: dr, side: 'dr', amount: n, taxRate: 0, ...(f.tagId ? { tagId: f.tagId } : {}) },
      { accountId: cr, side: 'cr', amount: n, taxRate: 0, ...(f.tagId ? { tagId: f.tagId } : {}) },
    ],
  });

  return (
    <>
      {presets.length ? (
        <Card title="プリセット">
          <ChipRow options={presets.map((p) => ({ value: p.id, label: p.name }))} value={null} onChange={applyPreset} />
        </Card>
      ) : null}

      <Card>
        <ChipRow options={TYPES.map(({ value, label }) => ({ value, label }))} value={f.type} onChange={set('type')} />

        <Field label="金額">
          <Input value={String(f.amount)} onChangeText={set('amount')} keyboardType="number-pad" placeholder="0"
            style={{ fontSize: 28, fontWeight: '800', textAlign: 'right' }} />
        </Field>
        <Field label="日付">
          <Input value={f.date} onChangeText={set('date')} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" />
        </Field>
        <Field label="摘要">
          <Input value={f.desc} onChangeText={set('desc')} placeholder="コンビニ など" />
        </Field>
      </Card>

      <Card title="科目" style={{ paddingVertical: 4 }}>
        <AccountPicker
          label={f.type === 'in' ? '入金先' : f.type === 'out' ? '費目' : '振替先（入る側）'}
          accounts={drOpts} value={dr} onChange={set('drId')}
        />
        <View style={{ height: 1, backgroundColor: t.bd }} />
        <AccountPicker
          label={f.type === 'in' ? '収入元' : f.type === 'out' ? '支払方法' : '振替元（出る側）'}
          accounts={crOpts} value={cr} onChange={set('crId')}
        />
      </Card>

      {tags.length ? (
        <Card title="タグ">
          <ChipRow
            options={[{ value: '', label: 'なし' }, ...tags.map((g) => ({ value: g.id, label: g.name }))]}
            value={f.tagId} onChange={set('tagId')}
          />
        </Card>
      ) : null}

      <Button label={submitLabel} onPress={submit} disabled={!ok} />
      {onDelete ? <Button label="この仕訳を削除" variant="ghost" onPress={onDelete} /> : null}
      <Text style={{ color: t.tx3, fontSize: 13, textAlign: 'center' }}>
        オフラインでも保存されます（端末内 → 接続時に自動同期）
      </Text>
    </>
  );
}
