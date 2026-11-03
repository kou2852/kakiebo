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
import DateField from '../../src/components/DateField';
import { selectable } from '../../src/utils/hiddenAccounts';
import { journalHasTag, retagJournal } from '../../src/utils/journalTags';

const REMOVE_TAG = '__remove__';

export default function BulkEdit() {
  const t = useTheme();
  const router = useRouter();
  const { ids } = useLocalSearchParams();
  const { journals, accounts, tags, save, del } = useData();

  const targets = String(ids || '').split(',').filter(Boolean);
  const [date, setDate] = useState('');
  const [desc, setDesc] = useState('');
  const [dr, setDr] = useState('');
  const [cr, setCr] = useState('');
  const [tagFrom, setTagFrom] = useState('');
  const [tagTo, setTagTo] = useState(''); // タグID、または REMOVE_TAG（外す）

  const opts = [{ value: '', label: '変更しない' },
    ...selectable(accounts).map((a) => ({ value: a.id, label: a.name }))];

  // 付け替え元に選べるのは、選択中の仕訳に付いているタグだけ
  const picked = journals.filter((j) => targets.includes(j.id));
  const fromOpts = [{ value: '', label: '変更しない' },
    ...tags.filter((g) => picked.some((j) => journalHasTag(j, g.id))).map((g) => ({ value: g.id, label: g.name }))];
  const toOpts = [{ value: REMOVE_TAG, label: 'タグを外す' },
    ...tags.filter((g) => g.id !== tagFrom).map((g) => ({ value: g.id, label: g.name }))];

  const apply = () => {
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return Alert.alert('日付の形式が違います', 'YYYY-MM-DD で入力してください。');
    }
    if (tagFrom && !tagTo) {
      return Alert.alert('付け替え先がありません', '付け替え先のタグを選んでください。');
    }
    if (!date && !desc && !dr && !cr && !tagFrom) {
      return Alert.alert('変更する項目がありません', '1つ以上を指定してください。');
    }

    let n = 0;
    targets.forEach((id) => {
      const j = journals.find((x) => x.id === id);
      if (!j) return;
      // 科目の差し替えは行の借貸を見て当てる。金額・タグ・行数は変えない。
      let lines = (dr || cr)
        ? j.lines.map((l) => ({
          ...l,
          accountId: (l.side === 'dr' && dr) ? dr : (l.side === 'cr' && cr) ? cr : l.accountId,
        }))
        : j.lines;
      // タグの付け替え。元のタグが付いていない仕訳は他の項目だけ適用する。金額は変えない。
      const retagged = tagFrom ? retagJournal({ ...j, lines }, tagFrom, tagTo === REMOVE_TAG ? null : tagTo) : null;
      save('journals', {
        ...(retagged || j), date: date || j.date, desc: desc !== '' ? desc : (j.desc || ''),
        lines: retagged ? retagged.lines : lines,
      });
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
        <Text style={{ color: t.tx, fontSize: 15, fontWeight: '700' }}>{targets.length} 件を選択中</Text>
        <Text style={{ color: t.tx3, fontSize: 13 }}>入力した項目だけを変更します。空欄はそのままです。</Text>
      </Card>

      <Card title="変更する内容">
        <Field label="日付">
          <DateField value={date} onChangeText={setDate} placeholder="変更しない" />
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

      {tags.length > 0 ? (
        <Card title="付け替えるタグ">
          <Text style={{ color: t.tx3, fontSize: 13 }}>金額はそのままで、タグだけを付け替えます。選んだタグが付いていない仕訳は変わりません。</Text>
          <ChipRow options={fromOpts} value={tagFrom} onChange={(v) => { setTagFrom(v); setTagTo(''); }} />
          {fromOpts.length === 1 ? <Text style={{ color: t.tx3, fontSize: 13 }}>選択中の仕訳にタグが付いていません</Text> : null}
          {tagFrom ? (
            <>
              <Text style={{ color: t.tx2, fontSize: 14, fontWeight: '600' }}>付け替え先</Text>
              <ChipRow options={toOpts} value={tagTo} onChange={setTagTo} />
            </>
          ) : null}
        </Card>
      ) : null}

      <Button label={`${targets.length} 件を更新`} onPress={apply} />
      <Button label={`${targets.length} 件を削除`} variant="ghost" onPress={removeAll} />
    </Screen>
  );
}
