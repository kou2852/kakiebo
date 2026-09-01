// 一行入力。「食費 1200 現金」のように打つ（または iOS のキーボード音声入力で話す）と仕訳になる。
// レシートの出ない現金払い（自販機・駐車場・割り勘）を取りこぼさないための入口で、
// ここが遅いと記録されず、帳簿が現実からずれる。速さが正確さに直結する。
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { useData } from '../store/DataProvider';
import { useTheme } from '../theme';
import { Button, Card, Input } from './ui';
import { fa, today, uid } from '../utils/format';
import { parseQuickEntry } from '../utils/quickEntry';

export default function QuickEntryBar({ initialText = '', onSaved, autoFocus }) {
  const t = useTheme();
  const { accounts, rules, save } = useData();
  const [text, setText] = useState(initialText);

  const parsed = useMemo(() => {
    try { return parseQuickEntry(text, accounts, rules || []); } catch { return null; }
  }, [text, accounts, rules]);

  const submit = () => {
    const j = {
      id: uid(),
      date: today(),
      desc: parsed.desc || '',
      lines: [
        { accountId: parsed.drAcct.id, side: 'dr', amount: parsed.amount, taxRate: 0 },
        { accountId: parsed.crAcct.id, side: 'cr', amount: parsed.amount, taxRate: 0 },
      ],
    };
    save('journals', j);
    setText('');
    onSaved?.(j);
  };

  return (
    <Card title="一行で記帳">
      <Input
        value={text}
        onChangeText={setText}
        autoFocus={autoFocus}
        autoCapitalize="none"
        placeholder="食費 1200 現金"
        onSubmitEditing={() => parsed && submit()}
        returnKeyType="done"
      />
      {parsed ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ color: t.tx2, fontSize: 14, flex: 1 }} numberOfLines={1}>
            {parsed.drAcct.name}
            <Text style={{ color: t.tx3 }}>{'  ←  '}</Text>
            {parsed.crAcct.name}
            {parsed.desc ? <Text style={{ color: t.tx3 }}>{`  ${parsed.desc}`}</Text> : null}
          </Text>
          <Text style={{ color: t.tx, fontSize: 15, fontWeight: '700' }}>{fa(parsed.amount)}</Text>
        </View>
      ) : (
        <Text style={{ color: t.tx3, fontSize: 12 }}>
          「費目 金額 支払方法」の順。科目名は一部でも通ります。/ の後ろは摘要。
        </Text>
      )}
      <Button label="この内容で記帳" onPress={submit} disabled={!parsed} />
    </Card>
  );
}
