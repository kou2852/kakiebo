// CSV の取込と書き出し。
//
// 取込は3段構え:
//   1. マネーフォワード / Zaim / 本アプリ形式は既存の判定（csv.js）でそのまま読む
//   2. それ以外（カード会社・銀行の明細）はヘッダ辞書で列を推測する
//   3. 推測が外れたらユーザーに列を選ばせる。選んだ内容はカードごとに保存し2回目から自動
// LLM に列を推論させる案は採らない。誤りが静かに紛れ込む形になるため（csvMapping.js 参照）。
import { useEffect, useMemo, useState } from 'react';
import { Alert, Share, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useData } from '../../src/store/DataProvider';
import { useTheme } from '../../src/theme';
import { Button, Card, ChipRow, Field, Input, Screen } from '../../src/components/ui';
import { fa, uid } from '../../src/utils/format';
import { CC, detectCsvFormat, normD, normalizeForeignCsv, pAm, parseCT, resolveAccount, rowsToCSV } from '../../src/utils/csv';
import { applyMapping, guessByContent, guessMapping, loadMapping, looksHeaderless, rawRows, saveMapping } from '../../src/utils/csvMapping';

const SIGNS = [
  { value: 'positive', label: '支出が正の数' },
  { value: 'negative', label: '支出が負の数' },
];

export default function Csv() {
  const t = useTheme();
  const { journals, accounts, rules, save } = useData();

  const [text, setText] = useState('');
  // 列指定はヘッダの署名をキーに持つ。CSV を貼り替えれば署名が変わるので、
  // 「別のCSVに切り替わったから状態を消す」というエフェクトが要らなくなる。
  const [overrides, setOverrides] = useState({}); // sig -> { map, sign } ユーザーが選び直した分
  const [saved, setSaved] = useState({});         // sig -> { map, sign } 端末に保存済みの分
  const [expenseId, setExpenseId] = useState('');
  const [payId, setPayId] = useState('');

  const expenseOpts = accounts.filter((a) => a.type === 'expense').map((a) => ({ value: a.id, label: a.name }));
  const payOpts = accounts.filter((a) => a.type === 'asset' || a.type === 'liability').map((a) => ({ value: a.id, label: a.name }));
  const expense = expenseId || expenseOpts[0]?.value;
  const pay = payId || payOpts[0]?.value;

  // 生の行。ヘッダ判定と列選択の両方で使う。
  const raw = useMemo(() => (text.trim() ? rawRows(text) : []), [text]);
  const headerless = useMemo(() => looksHeaderless(raw), [raw]);
  const header = useMemo(() => (headerless ? [] : (raw[0] || [])), [headerless, raw]);
  const dataRows = useMemo(() => (headerless ? raw : raw.slice(1)), [headerless, raw]);

  // 既知形式で読めるならそちらが優先。読めないときだけ列マッピングに落ちる。
  const known = useMemo(() => {
    if (!text.trim()) return null;
    const format = detectCsvFormat(text);
    const rows = parseCT(format === 'native' ? text : normalizeForeignCsv(text, format), true);
    if (!rows) return null;
    const items = toItems(rows, accounts);
    return items.length ? { format, items, skipped: rows.length - items.length } : null;
  }, [text, accounts]);

  const sig = useMemo(() => header.join('|').slice(0, 200), [header]);

  // 保存済みの指定を読む。読めたら反映する（初回は辞書・内容推測が使われる）。
  useEffect(() => {
    if (!sig || known) return;
    let cancelled = false;
    loadMapping(header).then((v) => { if (!cancelled && v) setSaved((m) => ({ ...m, [sig]: v })); });
    return () => { cancelled = true; };
  }, [sig, known, header]);

  // 保存済み → 辞書（ヘッダ有り）／内容推測（ヘッダ無し）の順に列を決める。
  const auto = useMemo(() => {
    if (!text.trim() || known) return null;
    return { map: headerless ? guessByContent(dataRows) : guessMapping(header), sign: 'positive' };
    // dataRows / header は raw から導出される
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, known, headerless, raw]);

  const current = overrides[sig] || saved[sig] || auto;
  const map = current?.map || null;
  const sign = current?.sign || 'positive';
  const setCurrent = (patch) =>
    setOverrides((o) => ({ ...o, [sig]: { map, sign, ...patch } }));

  const mapped = useMemo(() => {
    if (known || !map || map.date == null || map.amount == null) return null;
    const rows = applyMapping(dataRows, map, sign);
    return { items: toItems(rows, accounts), skipped: dataRows.length - rows.length };
    // dataRows は raw から導出される
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [known, map, sign, raw, accounts]);

  const preview = known || mapped;

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
      // 摘要にルールが当たればそれを優先し、無ければ画面で選んだ組み合わせを当てる。
      const rule = (!it.drId || !it.crId) ? (rules || []).find((r) => r.keyword && it.desc.includes(r.keyword)) : null;
      save('journals', {
        id: uid(),
        date: it.date,
        desc: it.desc,
        lines: [
          { accountId: it.drId || rule?.drAccountId || expense, side: 'dr', amount: it.amount, taxRate: 0 },
          { accountId: it.crId || rule?.crAccountId || pay, side: 'cr', amount: it.amount, taxRate: 0 },
        ],
      });
      added++;
    });
    if (mapped && !headerless) await saveMapping(header, { map, sign });
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

  // 列選択の選択肢。見出しと中身の見本を並べて、どの列か分かるようにする。
  const columnOptions = (raw[0] || []).map((_, i) => ({
    value: i,
    label: `${headerless ? `${i + 1}列目` : (header[i] || `${i + 1}列目`)}：${String(dataRows[0]?.[i] ?? '').slice(0, 10) || '—'}`,
  }));

  return (
    <Screen>
      <Card title="書き出し">
        <Text style={{ color: t.tx2, fontSize: 14, lineHeight: 20 }}>
          仕訳 {journals.length.toLocaleString('ja-JP')} 件を CSV ファイルとして書き出します。
        </Text>
        <Button label="CSV を書き出す" onPress={doExport} disabled={!journals.length} />
      </Card>

      <Card title="取込">
        <Text style={{ color: t.tx2, fontSize: 13, lineHeight: 19 }}>
          カード会社・銀行の明細をそのまま読めます。列の並びが不明なときは下で指定してください。
        </Text>
        <Button label="CSV ファイルを選ぶ" onPress={pickFile} />
        <Field label="または貼り付け">
          <Input value={text} onChangeText={setText} multiline placeholder="ここに貼り付け"
            style={{ height: 100, textAlignVertical: 'top', fontSize: 13 }} />
        </Field>
      </Card>

      {map && !known ? (
        <Card title="列の指定">
          <Text style={{ color: t.tx3, fontSize: 12 }}>
            {headerless ? '見出し行が無いため内容から推測しました。' : '見出しから推測しました。'}
            違っていれば選び直してください。指定はこのカードの形式として保存されます。
          </Text>
          <Field label="日付の列">
            <ChipRow options={columnOptions} value={map.date} onChange={(v) => setCurrent({ map: { ...map, date: v } })} />
          </Field>
          <Field label="摘要（店名）の列">
            <ChipRow options={columnOptions} value={map.desc} onChange={(v) => setCurrent({ map: { ...map, desc: v } })} />
          </Field>
          <Field label="金額の列">
            <ChipRow options={columnOptions} value={map.amount} onChange={(v) => setCurrent({ map: { ...map, amount: v } })} />
          </Field>
          <Field label="符号">
            <ChipRow options={SIGNS} value={sign} onChange={(v) => setCurrent({ sign: v })} />
          </Field>
        </Card>
      ) : null}

      {preview ? (
        <>
          <Card title="読み取り結果">
            <Text style={{ color: t.tx, fontSize: 14 }}>
              {preview.items.length} 件
              {preview.skipped > 0 ? <Text style={{ color: t.tx3 }}>（{preview.skipped} 行は対象外）</Text> : null}
            </Text>
            {preview.items.slice(0, 5).map((it, i) => (
              <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: t.tx2, fontSize: 13, flex: 1 }} numberOfLines={1}>{it.date} {it.desc}</Text>
                <Text style={{ color: t.tx, fontSize: 13 }}>{fa(it.amount)}</Text>
              </View>
            ))}
            {preview.items.length > 5 ? (
              <Text style={{ color: t.tx3, fontSize: 12 }}>ほか {preview.items.length - 5} 件</Text>
            ) : null}
          </Card>

          <Card title="科目が決まらない行に使う組み合わせ">
            <Text style={{ color: t.tx3, fontSize: 12 }}>
              摘要がルールに一致する行は、そちらが優先されます。
            </Text>
            <Field label="費目">
              <ChipRow options={expenseOpts} value={expense} onChange={setExpenseId} />
            </Field>
            <Field label="支払方法">
              <ChipRow options={payOpts} value={pay} onChange={setPayId} />
            </Field>
          </Card>

          <Button label={`${preview.items.length} 件を取り込む`} onPress={runImport} disabled={!preview.items.length} />
        </>
      ) : null}
    </Screen>
  );
}

/** 中間形式の行 [日付,借方名,借方額,貸方名,貸方額,摘要] を取込用の項目へ */
function toItems(rows, accounts) {
  const items = [];
  rows.forEach((r) => {
    const date = normD(r[CC.d]);
    const amount = pAm(r[CC.dm]) || pAm(r[CC.cm]);
    if (!date || !amount) return;
    items.push({
      date,
      desc: r[CC.ds] || '',
      amount,
      drId: resolveAccount(accounts, r[CC.da]),
      crId: resolveAccount(accounts, r[CC.ca]),
    });
  });
  return items;
}
