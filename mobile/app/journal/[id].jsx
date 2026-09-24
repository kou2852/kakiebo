import { useState } from 'react';
import { Alert, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useData } from '../../src/store/DataProvider';
import { Card, ChipRow, Screen } from '../../src/components/ui';
import { useTheme } from '../../src/theme';
import JournalForm, { toForm } from '../../src/components/JournalForm';
import SplitForm, { toSplitForm } from '../../src/components/SplitForm';

export default function EditJournal() {
  const t = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { journals, accounts, save, del } = useData();

  const journal = journals.find((j) => j.id === id);
  // 3行以上の複合仕訳は簡易フォームで表せないので、最初から複合の編集画面で開く。
  const simple = journal ? toForm(journal, accounts) : null;
  const [mode, setMode] = useState(null);

  if (!journal) return <Screen><Card><Text style={{ color: t.tx2 }}>この仕訳は見つかりません</Text></Card></Screen>;

  const use = mode || (simple ? 'simple' : 'split');

  const remove = () => Alert.alert('この仕訳を削除しますか？', `${journal.date}  ${journal.desc || '(摘要なし)'}`, [
    { text: 'キャンセル', style: 'cancel' },
    { text: '削除', style: 'destructive', onPress: () => { del('journals', journal.id); router.back(); } },
  ]);

  // 元の仕訳の項目を引き継ぐ。入力欄に無い項目（ウェブ版で付けたもの）を保存で消さないため。
  const commit = (j) => { save('journals', { ...journal, ...j, id: journal.id }); router.back(); };

  return (
    <Screen>
      {simple ? (
        <ChipRow
          options={[{ value: 'simple', label: '簡易' }, { value: 'split', label: '複合仕訳' }]}
          value={use} onChange={setMode}
        />
      ) : (
        <Card>
          <Text style={{ color: t.tx2, fontSize: 14, lineHeight: 21 }}>
            借方・貸方が複数行ある仕訳です。行ごとに科目と金額を編集できます。
          </Text>
        </Card>
      )}

      {use === 'simple' && simple ? (
        <JournalForm
          initial={{ ...simple, id: journal.id }}
          submitLabel="更新" onDelete={remove} onSubmit={commit}
        />
      ) : (
        <SplitForm
          initial={{ ...toSplitForm(journal), id: journal.id }}
          submitLabel="更新" onDelete={remove} onSubmit={commit}
        />
      )}
    </Screen>
  );
}
