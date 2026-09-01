import { useState } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useData } from '../../src/store/DataProvider';
import { Button, Screen, Segmented } from '../../src/components/ui';
import JournalForm from '../../src/components/JournalForm';
import SplitForm from '../../src/components/SplitForm';
import { fa } from '../../src/utils/format';

const MODES = [
  { value: 'simple', label: '簡易' },
  { value: 'split', label: '複合仕訳' },
];

export default function JournalEntry() {
  const router = useRouter();
  const { save } = useData();
  const [mode, setMode] = useState('simple');
  // 保存のたびにフォームを初期状態へ戻す（続けて入力できるように）
  const [seq, setSeq] = useState(0);

  const done = (j) => {
    save('journals', j);
    setSeq((n) => n + 1);
    const total = j.lines.filter((l) => l.side === 'dr').reduce((s, l) => s + l.amount, 0);
    Alert.alert('保存しました', `${j.date}  ${fa(total)}`);
  };

  return (
    <Screen
      // 入力が縦に長いので、切替はスクロールしても上に残す。
      // 下まで入力してから形式を変えたくなったときに、戻る手間をなくす。
      stickyTop={<Segmented options={MODES} value={mode} onChange={setMode} />}
    >
      <Button label="レシート・利用控えを撮って記帳" variant="ghost" onPress={() => router.push('/scan')} />

      {mode === 'simple'
        ? <JournalForm key={seq} onSubmit={done} />
        : <SplitForm key={`s${seq}`} onSubmit={done} submitLabel="記帳する" />}
    </Screen>
  );
}
