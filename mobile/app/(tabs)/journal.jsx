import { useCallback, useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useData } from '../../src/store/DataProvider';
import { Screen, Segmented } from '../../src/components/ui';
import JournalForm from '../../src/components/JournalForm';
import SplitForm from '../../src/components/SplitForm';
import { fa } from '../../src/utils/format';
import { useTourTarget } from '../../src/store/TourProvider';
import { useEntryAd } from '../../src/components/Interstitial';

const MODES = [
  { value: 'simple', label: '簡易' },
  { value: 'split', label: '複合仕訳' },
];

export default function JournalEntry() {
  const kindRef = useTourTarget('entry-kind');
  const { save } = useData();
  const entryAd = useEntryAd();
  const [mode, setMode] = useState('simple');
  // 保存のたびにフォームを初期状態へ戻す（続けて入力できるように）
  const [seq, setSeq] = useState(0);

  // 仕訳帳のカレンダーから「この日に記帳する」で来たときの日付（?date=YYYY-MM-DD）。
  // 受け取ったら URL からは消す。残すと、あとでタブを開き直したときも古い日付になる。
  const params = useLocalSearchParams();
  const router = useRouter();
  const [presetDate, setPresetDate] = useState('');
  const paramDate = /^\d{4}-\d{2}-\d{2}$/.test(String(params.date || '')) ? String(params.date) : '';
  const [takenDate, setTakenDate] = useState('');
  // 描画中に状態を合わせる（effect で setState すると描画が二重に走る）。
  if (paramDate !== takenDate) {
    setTakenDate(paramDate);
    if (paramDate) {
      setPresetDate(paramDate);
      setSeq((n) => n + 1); // 入力途中のフォームを、その日付で作り直す
    }
  }
  useEffect(() => { if (paramDate) router.setParams({ date: undefined }); }, [paramDate, router]);
  // タブを離れたら日付の指定は捨てる（次に開いたときは今日から始める）
  useFocusEffect(useCallback(() => () => setPresetDate(''), []));

  const done = (j) => {
    save('journals', j);
    entryAd.counted();
    setSeq((n) => n + 1);
    const total = j.lines.filter((l) => l.side === 'dr').reduce((s, l) => s + l.amount, 0);
    Alert.alert('保存しました', `${j.date}  ${fa(total)}`, [{ text: 'OK', onPress: entryAd.closed }]);
  };

  return (
    <Screen
      // 入力が縦に長いので、切替はスクロールしても上に残す。
      // 下まで入力してから形式を変えたくなったときに、戻る手間をなくす。
      stickyTop={(
        <View ref={kindRef} collapsable={false}>
          <Segmented options={MODES} value={mode} onChange={setMode} />
        </View>
      )}
    >
      {mode === 'simple'
        ? <JournalForm key={seq} date={presetDate} onSubmit={done} />
        : <SplitForm key={`s${seq}`} date={presetDate} onSubmit={done} submitLabel="記帳する" />}
    </Screen>
  );
}
