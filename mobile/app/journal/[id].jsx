import { useState } from 'react';
import { Alert, Text } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useData } from '../../src/store/DataProvider';
import { Button, Card, ChipRow, Screen } from '../../src/components/ui';
import { useTheme } from '../../src/theme';
import JournalForm, { toForm } from '../../src/components/JournalForm';
import SplitForm, { toSplitForm } from '../../src/components/SplitForm';
import { today } from '../../src/utils/format';

export default function EditJournal() {
  const t = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { journals, accounts, save, del } = useData();

  const journal = journals.find((j) => j.id === id);
  // 3行以上の複合仕訳は簡易フォームで表せないので、最初から複合の編集画面で開く。
  const simple = journal ? toForm(journal, accounts) : null;
  const [mode, setMode] = useState(null);
  // コピー: 同じ中身で新しい仕訳を作る。日付だけ今日にする（ウェブ版の「コピー」と同じ）。
  const [copying, setCopying] = useState(false);

  if (!journal) return <Screen><Card><Text style={{ color: t.tx2 }}>この仕訳は見つかりません</Text></Card></Screen>;

  const use = mode || (simple ? 'simple' : 'split');

  const remove = () => Alert.alert('この仕訳を削除しますか？', `${journal.date}  ${journal.desc || '(摘要なし)'}`, [
    { text: 'キャンセル', style: 'cancel' },
    { text: '削除', style: 'destructive', onPress: () => { del('journals', journal.id); router.back(); } },
  ]);

  // 元の仕訳の項目を引き継ぐ。入力欄に無い項目（ウェブ版で付けたもの）を保存で消さないため。
  const commit = (j) => { save('journals', { ...journal, ...j, id: journal.id }); router.back(); };
  // コピーは新しい仕訳として保存する（id はフォームが新しく振る）。元の仕訳は変えない。
  const commitCopy = (j) => { save('journals', j); router.back(); };

  if (copying) {
    return (
      <Screen>
        <Stack.Screen options={{ title: '仕訳のコピー' }} />
        <Card>
          <Text style={{ color: t.tx2, fontSize: 14, lineHeight: 21 }}>
            この仕訳と同じ内容で、新しい仕訳を作ります。元の仕訳は変わりません。
          </Text>
        </Card>
        {simple ? (
          <JournalForm initial={{ ...simple, date: today() }} submitLabel="コピーして記帳" onSubmit={commitCopy} />
        ) : (
          <SplitForm initial={{ ...toSplitForm(journal), date: today() }} submitLabel="コピーして記帳" onSubmit={commitCopy} />
        )}
        <Button label="やめる" variant="ghost" onPress={() => setCopying(false)} />
      </Screen>
    );
  }

  return (
    <Screen>
      {/* コピー画面から「やめる」で戻ったとき、見出しを戻す */}
      <Stack.Screen options={{ title: '仕訳を編集' }} />
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
      <Button label="この仕訳をコピー" variant="ghost" onPress={() => setCopying(true)} />
    </Screen>
  );
}
