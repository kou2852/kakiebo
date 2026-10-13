// CSV の取込と書き出し。
//
// 取込の流れ（2026-10-13 作り直し）:
//   1. マネーフォワード / Zaim は既存の判定（csv.js）でそのまま読む
//   2. それ以外（本アプリの書き出し・カード会社・銀行の明細）は、CSV の行はそのままカンマで区切った表にして見せ、
//      列（縦）ごとに「この列は何か」を選んでもらう（日付・摘要・金額・出金額・入金額・借方科目・貸方科目・使わない）。
//      最初は見出しの辞書（無ければ中身）から推測しておき、違っていれば選び直してもらう
//   3. 選んだ割り当ては名前を付けて保存でき、同じ見出しの CSV では自動で選ばれる（端末ごと）
// LLM に列を推論させる案は採らない。誤りが静かに紛れ込む形になるため（csvMapping.js 参照）。
import { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Share, Text, TouchableOpacity, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useRouter } from 'expo-router';
import { useData } from '../../src/store/DataProvider';
import { useTheme } from '../../src/theme';
import { Button, Card, ChipRow, Field, Input, Screen } from '../../src/components/ui';
import AccountPicker from '../../src/components/AccountPicker';
import { fa, uid } from '../../src/utils/format';
import { CC, csvAmount, detectCsvFormat, normD, normalizeForeignCsv, parseCT, resolveAccount, rowsToCSV } from '../../src/utils/csv';
import {
  COLUMN_ROLES, applyRoles, guessRoles, loadCsvPresets, loadMapping, looksHeaderless, missingRoles,
  presetSig, rawRows, saveCsvPresets, saveMapping, skippedRows,
} from '../../src/utils/csvMapping';
import { useTourTarget } from '../../src/store/TourProvider';
import { selectable } from '../../src/utils/hiddenAccounts';

const SIGNS = [
  { value: 'positive', label: '支出が正の数' },
  { value: 'negative', label: '支出が負の数' },
];
const ROLE_LABEL = Object.fromEntries(COLUMN_ROLES.map((r) => [r.value, r.label]));
// 金額の符号の説明（「？」で開く）
const SIGN_HELP = 'カードの明細は、使った金額が「1,200」のように正の数で並ぶものがほとんどです（支出が正の数）。'
  + '銀行の明細などで、使った金額が「-1,200」のように負の数で並ぶときは「支出が負の数」を選びます。'
  + 'どちらの場合も、支出と逆の符号の行（返金・キャンセル）は取り込みません。金額の列を選んだときだけ使います。';
const PREVIEW_ROWS = 20;
const COL_W = 132;

/** 以前の保存（{ map: { date, desc, amount }, sign }）を、列ごとの役割へ直す */
const fromLegacy = (v, cols) => {
  if (v?.roles?.length === cols) return v.roles;
  if (!v?.map) return null;
  const roles = Array.from({ length: cols }, () => 'none');
  if (v.map.date != null && v.map.date < cols) roles[v.map.date] = 'date';
  if (v.map.desc != null && v.map.desc < cols) roles[v.map.desc] = 'desc';
  if (v.map.amount != null && v.map.amount < cols) roles[v.map.amount] = 'amount';
  return roles;
};

export default function Csv() {
  const panelRef = useTourTarget('csv-panel');
  const t = useTheme();
  const router = useRouter();
  const [showSkipped, setShowSkipped] = useState(false); // 対象外の行の一覧を開いているか
  const [signHelp, setSignHelp] = useState(false);
  const { journals, accounts, rules, save } = useData();

  const [text, setTextRaw] = useState('');
  // 列の役割はヘッダの署名をキーに持つ。CSV を貼り替えれば署名が変わるので、
  // 「別のCSVに切り替わったから状態を消す」というエフェクトが要らなくなる。
  const [overrides, setOverrides] = useState({}); // sig -> { roles, sign } ユーザーが選び直した分
  const [saved, setSaved] = useState({});         // sig -> 端末に保存済みの分（名前なし）
  const [headerFlag, setHeaderFlag] = useState(null); // 1行目を見出しとして扱うか（null＝自動判定）
  const [expenseId, setExpenseId] = useState('');
  const [payId, setPayId] = useState('');
  const [incomeId, setIncomeId] = useState('');
  // 割り当てプリセット（銀行・カードごとに名前を付けて保存したもの）
  const [presets, setPresets] = useState([]);
  const [presetBySig, setPresetBySig] = useState({}); // sig -> 選んだプリセットの id（'' は使わない）
  const [saveName, setSaveName] = useState('');
  const [picking, setPicking] = useState(null); // 役割を選んでいる列の番号
  // CSV の科目名 → この帳簿の科目。帳簿に同じ名前が無い科目名を、画面で科目に割り当てる
  const [nameMap, setNameMap] = useState({});
  useEffect(() => { loadCsvPresets().then(setPresets); }, []);
  const setText = (v) => { setTextRaw(v); setHeaderFlag(null); setNameMap({}); };

  const expenseOpts = selectable(accounts, [expenseId])
    .filter((a) => a.type === 'expense').map((a) => ({ value: a.id, label: a.name }));
  const payOpts = selectable(accounts, [payId])
    .filter((a) => a.type === 'asset' || a.type === 'liability').map((a) => ({ value: a.id, label: a.name }));
  const incomeOpts = selectable(accounts, [incomeId])
    .filter((a) => a.type === 'income').map((a) => ({ value: a.id, label: a.name }));

  // 生の行。列の数は一番長い行に合わせる。
  const raw = useMemo(() => (text.trim() ? rawRows(text) : []), [text]);
  const cols = useMemo(() => (raw.length ? Math.max(...raw.map((r) => r.length)) : 0), [raw]);
  const autoHeaderless = useMemo(() => looksHeaderless(raw), [raw]);
  const headerless = headerFlag == null ? autoHeaderless : !headerFlag;
  const header = useMemo(() => (headerless ? [] : (raw[0] || [])), [headerless, raw]);
  const dataRows = useMemo(() => (headerless ? raw : raw.slice(1)), [headerless, raw]);

  // マネーフォワード / Zaim の書き出しは、決まった形なのでそのまま読む。
  // それ以外は（本アプリの書き出しも）列の割り当てを通す。本アプリの書き出しは見出しから列を埋めておく（guessRoles）。
  const known = useMemo(() => {
    if (!text.trim()) return null;
    const format = detectCsvFormat(text);
    if (format === 'native') return null;
    const rows = parseCT(normalizeForeignCsv(text, format), true);
    if (!rows) return null;
    const items = toItems(rows, accounts);
    return items.length ? { format, items, skipped: rows.length - items.length, mismatched: countMismatch(rows) } : null;
  }, [text, accounts]);

  const sig = useMemo(() => `${headerless ? '#' : ''}${header.join('|')}`.slice(0, 200), [header, headerless]);

  // 以前この形式で取り込んだときの割り当て（名前なし）を読む
  useEffect(() => {
    if (!header.length || known) return undefined;
    let cancelled = false;
    loadMapping(header).then((v) => { if (!cancelled && v) setSaved((m) => ({ ...m, [sig]: v })); });
    return () => { cancelled = true; };
  }, [sig, known, header]);

  // プリセットの署名（見出し無しの CSV は列の数で見分ける）
  const pSig = useMemo(() => (raw.length ? presetSig(header, headerless, cols) : ''), [raw, header, headerless, cols]);
  const matched = presets.find((p) => p.sig === pSig) || null;
  const presetId = presetBySig[pSig] ?? (matched?.id || '');
  const preset = presets.find((p) => p.id === presetId) || null;

  // 選び直した分 → プリセット → 以前の取り込み → 見出し（無ければ中身）からの推測、の順に決める
  const roles = useMemo(() => {
    if (!cols || known) return [];
    return overrides[sig]?.roles
      || (preset?.roles?.length === cols ? preset.roles : null)
      || fromLegacy(saved[sig], cols)
      || guessRoles(header, dataRows, headerless, cols);
    // dataRows / header は raw と headerless から導出される
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cols, known, overrides, sig, preset, saved, raw, headerless]);
  const sign = overrides[sig]?.sign || preset?.sign || saved[sig]?.sign || 'positive';
  const setRole = (i, v) => setOverrides((o) => ({ ...o, [sig]: { roles: roles.map((r, j) => (j === i ? v : r)), sign } }));
  const setSign = (v) => setOverrides((o) => ({ ...o, [sig]: { roles, sign: v } }));
  const has = (r) => roles.includes(r);
  const missing = known || !cols ? [] : missingRoles(roles);

  // 科目が決まらない行に使う科目。プリセットの科目は、画面で選び直していなければそちらを使う
  const pickOf = (chosen, fromPreset, opts) => chosen || (!known && fromPreset && opts.some((o) => o.value === fromPreset) ? fromPreset : opts[0]?.value);
  const expense = pickOf(expenseId, preset?.expenseId, expenseOpts);
  const pay = pickOf(payId, preset?.accountId, payOpts);
  const income = pickOf(incomeId, preset?.incomeId, incomeOpts);
  const mapped = useMemo(() => {
    if (known || !cols || missingRoles(roles).length) return null;
    const rows = applyRoles(dataRows, roles, { expenseSign: sign });
    // 取り込まない行と理由。「（N 行は対象外）」を押すと一覧で見られる
    const skippedList = skippedRows(dataRows, roles, { expenseSign: sign });
    return { items: toItems(rows, accounts), skipped: skippedList.length, skippedList, mismatched: countMismatch(rows) };
    // dataRows は raw から導出される
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [known, cols, roles, sign, raw, headerless, accounts]);

  const preview = known || mapped;
  // CSV に科目名があるのに、この帳簿に同じ名前の科目が無いもの。弾かずに、画面でこの帳簿の科目に割り当ててもらう
  const unknownNames = useMemo(() => [...new Set((preview?.items || []).flatMap((it) => [
    it.drName && !it.drId ? it.drName : null, it.crName && !it.crId ? it.crName : null,
  ]).filter(Boolean))], [preview]);
  // 行ごとの科目: CSV の科目 → 割り当てた科目（無ければ空）
  const drOf = (it) => it.drId || nameMap[it.drName] || '';
  const crOf = (it) => it.crId || nameMap[it.crName] || '';
  // 科目が決まらない行が出るか（列が無い・割り当てていない）。出るものだけ、使う科目を聞く
  const items = preview?.items || [];
  const needExpense = items.some((it) => it.kind !== 'in' && !drOf(it));
  const needPay = items.some((it) => (it.kind === 'in' ? !drOf(it) : !crOf(it)));
  const needIncome = items.some((it) => it.kind === 'in' && !crOf(it));

  const choosePreset = (id) => {
    setPresetBySig((m) => ({ ...m, [pSig]: id }));
    setOverrides((o) => { const n = { ...o }; delete n[sig]; return n; }); // 選び直した列はプリセットの値に戻す
    setExpenseId(''); setPayId(''); setIncomeId('');
  };
  const deletePreset = () => {
    if (!presetId) return;
    const next = presets.filter((p) => p.id !== presetId);
    setPresets(next); saveCsvPresets(next);
    setPresetBySig((m) => ({ ...m, [pSig]: '' }));
  };

  // 同じ日付・摘要・金額の仕訳があれば重複とみなして飛ばす。
  const existing = useMemo(
    () => new Set(journals.map((j) => `${j.date}|${j.desc || ''}|${j.lines.reduce((s, l) => s + (l.side === 'dr' ? l.amount : 0), 0)}`)),
    [journals]
  );

  const pickFile = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: ['text/csv', 'text/comma-separated-values', 'text/plain', '*/*'] });
    if (r.canceled) return;
    try {
      const content = await FileSystem.readAsStringAsync(r.assets[0].uri, { encoding: FileSystem.EncodingType.UTF8 });
      // Shift-JIS の CSV は文字化けする。RN には再デコードの手段が無いので、貼り付けを案内する。
      if (content.includes('�')) {
        Alert.alert('文字化けしています', 'UTF-8 で保存し直すか、内容をコピーして下の欄に貼り付けてください。');
      }
      setText(content);
    } catch (e) {
      Alert.alert('読み込めません', e?.message || String(e));
    }
  };

  const runImport = async () => {
    let added = 0, dup = 0;
    preview.items.forEach((it) => {
      const key = `${it.date}|${it.desc}|${it.amount}`;
      if (existing.has(key)) { dup++; return; }
      // 摘要にルールが当たればそれを優先し、無ければ画面で選んだ科目を当てる（入金の行は 口座 ← 入金の科目）。
      const dr0 = drOf(it), cr0 = crOf(it);
      const rule = (!dr0 || !cr0) ? (rules || []).find((r) => r.keyword && it.desc.includes(r.keyword)) : null;
      const isIn = it.kind === 'in';
      save('journals', {
        id: uid(),
        date: it.date,
        desc: it.desc,
        lines: [
          { accountId: dr0 || rule?.drAccountId || (isIn ? pay : expense), side: 'dr', amount: it.amount, taxRate: 0 },
          { accountId: cr0 || rule?.crAccountId || (isIn ? income : pay), side: 'cr', amount: it.amount, taxRate: 0 },
        ],
      });
      added++;
    });
    // 名前が無くても、この形式の割り当ては覚えておく（次に同じ見出しの CSV を読んだら自動で当てる）
    if (mapped && !headerless) await saveMapping(header, { roles, sign });
    // 名前が入っていれば割り当てを保存（同じ名前なら上書き）。プリセットを使ったなら、その内容を最新にする
    const name = saveName.trim();
    if (mapped && (name || presetId)) {
      const base = presets.find((p) => (name ? p.name === name : p.id === presetId));
      const item = {
        id: base?.id || uid(), name: name || base?.name || '', sig: pSig, headerless, roles, sign,
        expenseId: expense, accountId: pay, incomeId: income,
      };
      const next = base ? presets.map((p) => (p.id === base.id ? item : p)) : [...presets, item];
      setPresets(next); await saveCsvPresets(next);
    }
    setSaveName('');
    setText('');
    Alert.alert('取り込みました', `${added} 件を追加${dup ? `\n${dup} 件は重複のため除外` : ''}`);
  };

  const buildCsv = () => {
    const name = (id) => accounts.find((a) => a.id === id)?.name || '';
    const rows = [['日付', '借方科目', '借方金額', '貸方科目', '貸方金額', '摘要']];
    [...journals].sort((a, b) => a.date.localeCompare(b.date)).forEach((j) => {
      const dr = j.lines.find((l) => l.side === 'dr');
      const cr = j.lines.find((l) => l.side === 'cr');
      rows.push([j.date, name(dr?.accountId), dr?.amount ?? '', name(cr?.accountId), cr?.amount ?? '', j.desc || '']);
    });
    // Excel が UTF-8 と判別できるよう BOM を付ける（付けないと日本語が化ける）。
    return '﻿' + rowsToCSV(rows);
  };

  const doExport = async () => {
    const csv = buildCsv();
    try {
      const uri = `${FileSystem.cacheDirectory}kurofukubo-${new Date().toISOString().slice(0, 10)}.csv`;
      await FileSystem.writeAsStringAsync(uri, csv, { encoding: FileSystem.EncodingType.UTF8 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text' });
        return;
      }
      await Share.share({ message: csv }); // 共有シートが使えない環境向けの保険
    } catch (e) {
      Alert.alert('書き出せません', e?.message || String(e));
    }
  };

  // 表の1マス
  const cellStyle = { width: COL_W, paddingVertical: 6, paddingHorizontal: 6, borderRightWidth: 1, borderRightColor: t.bd };

  return (
    <Screen>
      <View ref={panelRef} collapsable={false}>
        <Card title="書き出し">
          <Text style={{ color: t.tx2, fontSize: 15, lineHeight: 22 }}>
            仕訳 {journals.length.toLocaleString('ja-JP')} 件を CSV ファイルとして書き出します。
          </Text>
          <Button label="CSV を書き出す" onPress={doExport} disabled={!journals.length} />
        </Card>
      </View>

      <Card title="取込">
        <Text style={{ color: t.tx2, fontSize: 14, lineHeight: 21 }}>
          カード会社・銀行の明細を読めます。読み込んだら、列ごとに何の項目かを選んでください。
        </Text>
        <Button label="CSV ファイルを選ぶ" onPress={pickFile} />
        <Field label="または貼り付け">
          <Input value={text} onChangeText={setText} multiline placeholder="ここに貼り付け"
            style={{ height: 100, textAlignVertical: 'top', fontSize: 14 }} />
        </Field>
      </Card>

      {cols > 0 && !known ? (
        <Card title="列の割り当て">
          {presets.length ? (
            <Field label="保存した割り当て">
              <ChipRow options={[{ value: '', label: '使わない' }, ...presets.map((p) => ({ value: p.id, label: p.name || '（名前なし）' }))]}
                value={presetId} onChange={choosePreset} />
              {presetId ? <Button label="この割り当てを削除" variant="ghost" onPress={deletePreset} /> : null}
              <TouchableOpacity onPress={() => router.push('/manage/csv-presets')} style={{ alignSelf: 'flex-start', paddingVertical: 4 }}>
                <Text style={{ color: t.ac, fontSize: 14, fontWeight: '600' }}>保存した割り当てを管理 ›</Text>
              </TouchableOpacity>
            </Field>
          ) : null}
          {has('amount') ? (
            <View style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ color: t.tx2, fontSize: 14, fontWeight: '700' }}>金額の符号</Text>
                <TouchableOpacity onPress={() => setSignHelp((v) => !v)} accessibilityRole="button" accessibilityLabel="金額の符号の説明"
                  style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: t.tx3, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: t.tx3, fontSize: 13, fontWeight: '800' }}>?</Text>
                </TouchableOpacity>
              </View>
              {signHelp ? <Text style={{ color: t.tx3, fontSize: 13, lineHeight: 19 }}>{SIGN_HELP}</Text> : null}
              <ChipRow options={SIGNS} value={sign} onChange={setSign} />
            </View>
          ) : null}
          <Text style={{ color: t.tx3, fontSize: 13, lineHeight: 19 }}>
            CSV を列ごとに分けました。表の一番上を押して、それぞれの列が何かを選んでください（使わない列はそのまま）。横にスクロールできます。
          </Text>
          <ChipRow options={[{ value: true, label: '1行目は見出し' }, { value: false, label: '1行目もデータ' }]}
            value={!headerless} onChange={(v) => setHeaderFlag(v)} />

          <ScrollView horizontal showsHorizontalScrollIndicator nestedScrollEnabled>
            <View style={{ borderWidth: 1, borderColor: t.bd, borderRadius: 8, overflow: 'hidden' }}>
              {/* 1段目: 列ごとの役割（押すと選べる） */}
              <View style={{ flexDirection: 'row', backgroundColor: t.bg3 }}>
                {Array.from({ length: cols }, (_, i) => {
                  const on = roles[i] !== 'none';
                  return (
                    <TouchableOpacity key={i} onPress={() => setPicking(i)} style={[cellStyle, { paddingVertical: 9 }]}
                      accessibilityRole="button" accessibilityLabel={`${i + 1}列目の項目: ${ROLE_LABEL[roles[i]]}`}>
                      <Text style={{ color: on ? t.ac : t.tx3, fontSize: 14, fontWeight: on ? '800' : '600' }} numberOfLines={1}>
                        {ROLE_LABEL[roles[i]]} ▾
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {/* 2段目: 見出し（あれば） */}
              {!headerless ? (
                <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: t.bd }}>
                  {Array.from({ length: cols }, (_, i) => (
                    <Text key={i} style={[cellStyle, { color: t.tx2, fontSize: 13, fontWeight: '700' }]} numberOfLines={1}>{header[i] ?? ''}</Text>
                  ))}
                </View>
              ) : null}
              {/* 3段目から: 中身（行はそのまま） */}
              {dataRows.slice(0, PREVIEW_ROWS).map((r, k) => (
                <View key={k} style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: t.bd }}>
                  {Array.from({ length: cols }, (_, i) => (
                    <Text key={i} style={[cellStyle, { color: roles[i] === 'none' ? t.tx3 : t.tx, fontSize: 13 }]} numberOfLines={1}>{r[i] ?? ''}</Text>
                  ))}
                </View>
              ))}
            </View>
          </ScrollView>
          {dataRows.length > PREVIEW_ROWS ? (
            <Text style={{ color: t.tx3, fontSize: 12.5 }}>先頭の {PREVIEW_ROWS} 行を表示しています（全 {dataRows.length} 行）。</Text>
          ) : null}

          {missing.length ? (
            <Text style={{ color: t.red, fontSize: 13.5 }}>「{missing.join('」「')}」の列を選んでください。</Text>
          ) : null}
        </Card>
      ) : null}

      {preview ? (
        <>
          <Card title="読み取り結果">
            <Text style={{ color: t.tx, fontSize: 15 }}>
              {preview.items.length} 件
              {preview.skipped > 0 && !preview.skippedList ? <Text style={{ color: t.tx3 }}>（{preview.skipped} 行は対象外）</Text> : null}
              {preview.mismatched > 0 ? (
                <Text style={{ color: t.red }}>{'\n'}借方と貸方の金額が合わない {preview.mismatched} 行は取り込みません。</Text>
              ) : null}
            </Text>
            {preview.skippedList?.length ? (
              <TouchableOpacity onPress={() => setShowSkipped((v) => !v)} style={{ alignSelf: 'flex-start' }}>
                <Text style={{ color: t.ac, fontSize: 14, fontWeight: '600' }}>
                  {preview.skippedList.length} 行は対象外 {showSkipped ? '▴' : '▾'}
                </Text>
              </TouchableOpacity>
            ) : null}
            {showSkipped && preview.skippedList?.length ? (
              <View style={{ gap: 8, backgroundColor: t.bg3, borderRadius: 8, padding: 10 }}>
                {preview.skippedList.slice(0, 50).map((x) => (
                  <View key={x.line} style={{ gap: 2 }}>
                    <Text style={{ color: t.tx2, fontSize: 13 }} numberOfLines={1}>
                      {/* CSV ファイルでの行番号（見出しがあれば1つずれる） */}
                      {`${x.line + (headerless ? 0 : 1)}行目: ${x.row.filter((c) => String(c ?? '').trim()).join(' / ')}`}
                    </Text>
                    <Text style={{ color: t.red, fontSize: 12.5 }}>{x.reason}</Text>
                  </View>
                ))}
                {preview.skippedList.length > 50 ? (
                  <Text style={{ color: t.tx3, fontSize: 12.5 }}>ほか {preview.skippedList.length - 50} 行</Text>
                ) : null}
              </View>
            ) : null}
            {preview.items.slice(0, 5).map((it, i) => (
              <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: t.tx2, fontSize: 14, flex: 1 }} numberOfLines={1}>{it.date} {it.desc}</Text>
                <Text style={{ color: it.kind === 'in' ? t.grn : t.tx, fontSize: 14 }}>{it.kind === 'in' ? '+' : ''}{fa(it.amount)}</Text>
              </View>
            ))}
            {preview.items.length > 5 ? (
              <Text style={{ color: t.tx3, fontSize: 13 }}>ほか {preview.items.length - 5} 件</Text>
            ) : null}
          </Card>

          {unknownNames.length ? (
            <Card title="CSV の科目を、この帳簿の科目に割り当て">
              <Text style={{ color: t.tx3, fontSize: 13, lineHeight: 19 }}>
                この帳簿に同じ名前が無い科目です。どの科目で記帳するかを選んでください（同じ名前の行すべてに当たります）。選ばなかった科目は、下の科目で記帳します。
              </Text>
              {unknownNames.map((n) => (
                <AccountPicker key={n} label={n} accounts={selectable(accounts, [nameMap[n]])} value={nameMap[n] || ''}
                  onChange={(v) => setNameMap((m) => ({ ...m, [n]: v }))} placeholder="科目を選ぶ" />
              ))}
            </Card>
          ) : null}

          {needExpense || needPay || needIncome ? (
            <Card title="科目が決まらない行に使う科目">
              <Text style={{ color: t.tx3, fontSize: 13 }}>
                摘要がルールに一致する行は、そちらが優先されます。
              </Text>
              {needExpense ? (
                <Field label="費目（支出の借方）">
                  <ChipRow options={expenseOpts} value={expense} onChange={setExpenseId} />
                </Field>
              ) : null}
              {needPay ? (
                <Field label={has('in') ? '口座・カード（入出金した先）' : '支払方法（支出の貸方）'}>
                  <ChipRow options={payOpts} value={pay} onChange={setPayId} />
                </Field>
              ) : null}
              {needIncome ? (
                <Field label="入金の科目（貸方）">
                  <ChipRow options={incomeOpts} value={income} onChange={setIncomeId} />
                </Field>
              ) : null}
            </Card>
          ) : null}

          {mapped ? (
            <Field label="この割り当てに名前を付けて保存（任意）">
              <Input value={saveName} onChangeText={setSaveName}
                placeholder={preset ? `空なら「${preset.name}」を上書き` : '例: 三井住友カード'} />
            </Field>
          ) : null}
          <Button label={`${preview.items.length} 件を取り込む`} onPress={runImport} disabled={!preview.items.length} />
        </>
      ) : null}

      {/* 列の項目を選ぶ */}
      <Modal visible={picking != null} transparent animationType="fade" onRequestClose={() => setPicking(null)} statusBarTranslucent>
        <Pressable onPress={() => setPicking(null)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,.45)', justifyContent: 'center', padding: 28 }}>
          <Pressable onPress={() => {}} style={{ backgroundColor: t.bg1, borderRadius: 16, paddingVertical: 8 }}>
            <Text style={{ color: t.tx, fontSize: 16, fontWeight: '700', paddingHorizontal: 18, paddingVertical: 10 }}>
              {picking != null ? `${picking + 1}列目${!headerless && header[picking] ? `「${header[picking]}」` : ''}は` : ''}
            </Text>
            {COLUMN_ROLES.map((r) => {
              const on = picking != null && roles[picking] === r.value;
              return (
                <TouchableOpacity key={r.value} onPress={() => { setRole(picking, r.value); setPicking(null); }}
                  style={{ paddingVertical: 12, paddingHorizontal: 18, backgroundColor: on ? t.acb : 'transparent' }}>
                  <Text style={{ color: on ? t.ac : t.tx, fontSize: 16, fontWeight: on ? '700' : '400' }}>
                    {r.label}<Text style={{ color: t.tx3, fontSize: 13, fontWeight: '400' }}>{`  －  ${r.help}`}</Text>
                  </Text>
                </TouchableOpacity>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

/** 借方と貸方の金額が一致しない行の数（取り込まない行として画面に出す） */
function countMismatch(rows) {
  return rows.filter((r) => csvAmount(r).mismatch).length;
}

/** 中間形式の行 [日付,借方名,借方額,貸方名,貸方額,摘要,(種類)] を取込用の項目へ */
function toItems(rows, accounts) {
  const items = [];
  rows.forEach((r) => {
    const date = normD(r[CC.d]);
    const { amount, mismatch } = csvAmount(r);
    // 借方と貸方の金額が合わない行は取り込まない（画面入力なら弾く行を、黙って借方の金額で通さない）
    if (!date || !amount || mismatch) return;
    items.push({
      date,
      desc: r[CC.ds] || '',
      amount,
      drId: resolveAccount(accounts, r[CC.da]),
      crId: resolveAccount(accounts, r[CC.ca]),
      drName: (r[CC.da] || '').trim(),
      crName: (r[CC.ca] || '').trim(),
      kind: r[6] === 'in' ? 'in' : 'out', // 列の割り当てで読んだ行の種類（入金かどうか）
    });
  });
  return items;
}
