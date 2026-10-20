// 仕訳の入力フォーム。新規入力（タブ）と編集（モーダル）で共用する。
// 家計の入力を速くするため、借方/貸方を直接選ばせず「支出・収入・振替」に置き換えている。
// 3行以上の複合仕訳はこの形では表現できないので、その場合は編集を断って Web 版へ誘導する。
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { useData } from '../store/DataProvider';
import { useTheme } from '../theme';
import { Button, Card, ChipRow, Field, Input } from './ui';
import DateField from './DateField';
import AccountPicker from './AccountPicker';
import { today, uid } from '../utils/format';
import { selectable } from '../utils/hiddenAccounts';
import {
  carryLine, presetLineSplits, ratioRows, rowsToSplits, sameTagRows, scalePresetSplits, splitsToRows, tagRowsProblem,
} from '../utils/journalTags';
import TagSplitPicker from './TagSplitPicker';
import { useTour, useTourTarget } from '../store/TourProvider';
import { isMultiPreset } from './SplitForm';

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
  // タグは借方・貸方のどちらに付いていても同じ意味（bookkeeping.js の computeTagBalances）。
  // ウェブで借方と貸方に別のタグを付けた仕訳だけは、この形では直せないのでそのまま引き継ぐ。
  const dRows = splitsToRows(dr[0]);
  const cRows = splitsToRows(cr[0]);
  return {
    type, date: journal.date, desc: journal.desc || '',
    amount: String(dr[0].amount), drId: dr[0].accountId, crId: cr[0].accountId,
    tagRows: dRows.length ? dRows : cRows,
    tagLocked: !sameTagRows(dRows, cRows),
    orig: journal.lines, // 保存時に、入力欄に無い項目（税率など）を引き継ぐ
  };
}

export default function JournalForm({ initial, date, onSubmit, submitLabel = '保存', onDelete, onMultiPreset }) {
  const t = useTheme();
  const headRef = useTourTarget('entry-head');
  const accountsRef = useTourTarget('entry-accounts');
  const presetsRef = useTourTarget('entry-presets');
  const tagsRef = useTourTarget('entry-tags');
  const { accounts, tags, presets, wallets } = useData();

  const [f, setF] = useState(() => {
    const base = initial || { type: 'out', date: date || today(), desc: '', amount: '', drId: '', crId: '' };
    // 呼び出し元によっては tagId（タグ1つ）で渡してくる。タグ欄の行の形にそろえる
    return { ...base, tagRows: base.tagRows || (base.tagId ? [{ tagId: base.tagId, amount: '' }] : []) };
  });
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }));
  // 記帳のツアー③は、金額を入れた・費目を選んだ・支払方法を選んだ、を本人の操作で見て先へ進める（2026-10-19）
  const tour = useTour();
  const setTour = (k, signal, ok) => (v) => { set(k)(v); if (ok(v)) tour?.saved(signal); };

  const spec = TYPES.find((x) => x.value === f.type);
  // 非表示の科目は候補から外す。いま選ばれている科目（編集中の仕訳・当てたプリセット）は残す。
  const drOpts = useMemo(() => pick(selectable(accounts, [f.drId]), spec.dr), [accounts, spec.dr, f.drId]);
  const crOpts = useMemo(() => pick(selectable(accounts, [f.crId]), spec.cr), [accounts, spec.cr, f.crId]);

  // 型を変えると選べる科目が変わる。選択が範囲外なら先頭に戻す。
  // 口座・カードを登録していれば、その先頭を初めの値にする（支払方法の一覧も口座が先に並ぶ）
  const firstWallet = (opts) => (wallets || []).map((w) => w.accountId).find((id) => opts.some((o) => o.id === id));
  const dr = drOpts.some((o) => o.id === f.drId) ? f.drId : (firstWallet(drOpts) || drOpts[0]?.id);
  const cr = crOpts.some((o) => o.id === f.crId) ? f.crId : (firstWallet(crOpts) || crOpts[0]?.id);

  const n = Number(String(f.amount).replace(/[^0-9]/g, ''));
  // 金額を決めていないプリセットの複数タグは比率で持ち、入れた金額に合わせて分ける
  const tagRows = f.tagRatio ? ratioRows(f.tagRatio, n) : f.tagRows;
  const tagProblem = f.tagLocked ? null : tagRowsProblem(tagRows);
  const ok = n > 0 && dr && cr && dr !== cr && /^\d{4}-\d{2}-\d{2}$/.test(f.date) && !tagProblem;

  // プリセットは科目の組み合わせを一発で入れる。既定の金額があればそれも入れる。
  // 明細が複数あるプリセットはこのフォームでは表せないので、複合仕訳の入力へ渡す（onMultiPreset）。
  const applyPreset = (id) => {
    const p = presets.find((x) => x.id === id);
    if (!p) return;
    if (onMultiPreset && isMultiPreset(p)) { onMultiPreset(p); return; }
    const d = p.lines.find((l) => l.side === 'dr');
    const c = p.lines.find((l) => l.side === 'cr');
    const fixed = d?.amount || 0;
    // プリセットのタグ。1つなら全額に付ける。2つ以上は、金額を決めてあればその額、都度入力なら比率として持つ
    const fromD = presetLineSplits(d);
    const tagSrc = fromD.length ? fromD : presetLineSplits(c);
    const tagPatch = !tagSrc.length ? {}
      : tagSrc.length === 1 ? { tagRows: [{ tagId: tagSrc[0].tagId, amount: '' }], tagRatio: null }
        : fixed > 0 ? { tagRows: scalePresetSplits(tagSrc, fixed, fixed).map((x) => ({ tagId: x.tagId, amount: String(x.amount) })), tagRatio: null }
          : { tagRows: [], tagRatio: tagSrc };
    setF((prev) => ({
      ...prev,
      type: p.type === 'in' ? 'in' : 'out',
      amount: fixed > 0 ? String(fixed) : prev.amount,
      drId: d?.accountId || prev.drId,
      crId: c?.accountId || prev.crId,
      desc: prev.desc || p.desc || '',
      ...tagPatch,
    }));
  };

  // タグはウェブと同じ splits の形で、借方・貸方の両方の行に付ける（二重には数えない）。
  // ⚠ 行の tagId には入れない。タグごとの残りの計算は splits しか読まない。
  const splits = rowsToSplits(tagRows, n);
  const line = (side, accountId) => {
    const out = carryLine((f.orig || []).find((l) => l.side === side), { accountId, side, amount: n });
    if (out.taxRate === undefined) out.taxRate = 0;
    if (!f.tagLocked) {
      delete out.tagId;
      if (splits.length) out.splits = splits; else delete out.splits;
    }
    return out;
  };

  const submit = () => onSubmit({
    id: initial?.id || uid(),
    date: f.date,
    desc: f.desc.trim(),
    lines: [line('dr', dr), line('cr', cr)],
  });

  return (
    <>
      {presets.length ? (
        <View ref={presetsRef} collapsable={false}>
        <Card title="プリセット">
          <ChipRow options={presets.map((p) => ({ value: p.id, label: p.name }))} value={null} onChange={applyPreset} />
        </Card>
        </View>
      ) : null}

      <View ref={headRef} collapsable={false}>
      <Card>
        <ChipRow options={TYPES.map(({ value, label }) => ({ value, label }))} value={f.type} onChange={set('type')} />

        <Field label="金額">
          <Input value={String(f.amount)} onChangeText={setTour('amount', 'amount', (v) => /[1-9]/.test(String(v)))} keyboardType="number-pad" placeholder="0"
            style={{ fontSize: 28, fontWeight: '800', textAlign: 'right' }} />
        </Field>
        <Field label="日付">
          <DateField value={f.date} onChangeText={set('date')} />
        </Field>
        <Field label="摘要">
          <Input value={f.desc} onChangeText={set('desc')} placeholder="コンビニ など" />
        </Field>
      </Card>
      </View>

      <View ref={accountsRef} collapsable={false}>
      <Card title="科目" style={{ paddingVertical: 4 }}>
        <AccountPicker
          label={f.type === 'in' ? '入金先' : f.type === 'out' ? '費目' : '振替先（入る側）'}
          accounts={drOpts} value={dr} onChange={setTour('drId', 'expense', () => true)} wallets={wallets}
        />
        <View style={{ height: 1, backgroundColor: t.bd }} />
        <AccountPicker
          label={f.type === 'in' ? '収入元' : f.type === 'out' ? '支払方法' : '振替元（出る側）'}
          accounts={crOpts} value={cr} onChange={setTour('crId', 'payment', () => true)} wallets={wallets}
        />
      </Card>
      </View>

      {f.tagLocked ? (
        <Card title="タグ">
          <Text style={{ color: t.tx3, fontSize: 13, lineHeight: 20 }}>
            この仕訳は、増える側と減る側に別のタグが付いています。複合仕訳で直せます。ここで保存してもタグは消えません。
          </Text>
        </Card>
      ) : tags.length ? (
        <View ref={tagsRef} collapsable={false}>
        <Card title="タグ">
          <TagSplitPicker tags={tags} rows={tagRows} amount={n}
            onChange={(v) => setF((p) => ({ ...p, tagRows: v, tagRatio: null }))} />
        </Card>
        </View>
      ) : null}

      <Button label={submitLabel} onPress={submit} disabled={!ok} />
      {onDelete ? <Button label="この仕訳を削除" variant="ghost" onPress={onDelete} /> : null}
      <Text style={{ color: t.tx3, fontSize: 13, textAlign: 'center' }}>
        オフラインでも保存されます（端末内 → 接続時に自動同期）
      </Text>
    </>
  );
}
