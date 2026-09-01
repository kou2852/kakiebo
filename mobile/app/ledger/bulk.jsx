// 選択した仕訳をまとめて編集する。Web 版 JournalPage の一括編集の移植。
//
// CSV から取り込んだ数十件の科目を直す、といった場面で1件ずつ開くのは現実的でない。
// 空欄の項目は変更しない（既存値を保つ）。全部空なら何もしないで戻す。
import { useState } from 'react';
import { Alert, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useData } from '../../src/store/DataProvider';
import { useTheme } from '../../src/theme';
import { Button, Card, ChipRow, Field, Input, Screen } from '../../src/components/ui';

export default function BulkEdit() {
  const t = useTheme();
  const router = useRouter();
  const { ids } = useLocalSearchParams();
  const { journals, accounts, save, del } = useData();

  const targets = String(ids || '').split(',').filter(Boolean);
  const [date, setDate] = useState('');
  const [desc, setDesc] = useState('');
  const [dr, setDr] = useState('');
  const [cr, setCr] = useState('');

  const opts = [{ value: '', label: '変更しない' },
    ...accounts.map((a) => ({ value: a.id, label: a.name }))];

  const apply = () => {
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return Alert.alert('日付の形式が違います', 'YYYY-MM-DD で入力してください。');
    }
    if (!date && !desc && !dr && !cr) {
      return Alert.alert('変更する項目がありません', '1つ以上を指定してください。');
    }

    let n = 0;
    targets.forEach((id) => {
      const j = journals.find((x) => x.id === id);
      if (!j) return;
      // 科目の差し替えは行の借貸を見て当てる。金額・タグ・行数は変えない。
      const lines = (dr || cr)
        ? j.lines.map((l) => ({
          ...l,
          accountId: (l.side === 'dr' && dr) ? dr : (l.side === 'cr' && cr) ? cr : l.accountId,
        }))
        : j.lines;
      save('journals', { ...j, date: date || j.date, desc: desc !== '' ? desc : (j.desc || ''), lines });
      n++;
    });
    Alert.alert('更新しました', `${n} 件を変更しました`, [{ text: 'OK', onPress: () => router.back() }]);
  };

  const removeAll = () => Alert.alert(`${targets.length} 件を削除しますか？`, 'この操作は取り消せません。', [
    { text: 'キャンセル', style: 'cancel' },
    {
      text: '削除',
      style: 'destructive',
      onPress: () => { targets.forEach((id) => del('journals', id)); router.back(); },
    },
  ]);

  return (
    <Screen>
      <Card>
        <Text style={{ color: t.tx, fontSize: 14, fontWeight: '700' }}>{targets.length} 件を選択中</Text>
        <Text style={{ color: t.tx3, fontSize: 12 }}>入力した項目だけを変更します。空欄はそのままです。</Text>
      </Card>

      <Card title="変更する内容">
        <Field label="日付">
          <Input value={date} onChangeText={setDate} placeholder="変更しない" keyboardType="numbers-and-punctuation" />
        </Field>
        <Field label="摘要">
          <Input value={desc} onChangeText={setDesc} placeholder="変更しない" />
        </Field>
      </Card>

      <Card title="借方科目">
        <ChipRow options={opts} value={dr} onChange={setDr} />
      </Card>
      <Card title="貸方科目">
        <ChipRow options={opts} value={cr} onChange={setCr} />
      </Card>

      <Button label={`${targets.length} 件を更新`} onPress={apply} />
      <Button label={`${targets.length} 件を削除`} variant="ghost" onPress={removeAll} />
    </Screen>
  );
}
