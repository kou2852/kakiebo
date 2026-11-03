import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useData } from '../../src/store/DataProvider';
import { Screen, Segmented } from '../../src/components/ui';
import JournalForm from '../../src/components/JournalForm';
import SplitForm, { presetToSplitForm } from '../../src/components/SplitForm';
import { fa } from '../../src/utils/format';
import { useTour } from '../../src/store/TourProvider';
import { useEntryAd } from '../../src/components/Interstitial';

const MODES = [
  { value: 'simple', label: '簡易' },
  { value: 'split', label: '複合仕訳' },
  // 画面を切り替えるだけで、入力方法ではない。選んでも mode は変えず、付け替えの画面へ進む
  { value: 'retag', label: 'タグ付け替え' },
];

export default function JournalEntry() {
  const { save } = useData();
  const entryAd = useEntryAd();
  const [mode, setModeRaw] = useState('simple');
  // 明細が複数あるプリセットを選んだときの、複合仕訳の初期値
  const [splitInitial, setSplitInitial] = useState(null);
  const setMode = (m) => { setSplitInitial(null); setModeRaw(m); };
  // 記帳のツアーは簡易の画面（支出・収入・振替と費目・支払方法）を指す。複合仕訳を開いたままだと指す先が無い
  const tourId = useTour()?.tourId;
  const [seenTour, setSeenTour] = useState(tourId);
  if (tourId !== seenTour) {
    setSeenTour(tourId);
    if (tourId === 'journal') setMode('simple');
  }
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

  const done = async (j) => {
    save('journals', j);
    setSplitInitial(null);
    setSeq((n) => n + 1);
    const total = j.lines.filter((l) => l.side === 'dr').reduce((s, l) => s + l.amount, 0);
    await entryAd.finish({ title: '保存しました', message: `${j.date}  ${fa(total)}` });
  };

  return (
    <Screen
      // 入力が縦に長いので、切替はスクロールしても上に残す。
      // 下まで入力してから形式を変えたくなったときに、戻る手間をなくす。
      stickyTop={(
        <Segmented options={MODES} value={mode}
          onChange={(m) => (m === 'retag' ? router.push('/manage/tag-move') : setMode(m))} />
      )}
    >
      {mode === 'simple'
        ? (
          <JournalForm key={seq} date={presetDate} onSubmit={done}
            onMultiPreset={(p) => {
              setSplitInitial(presetToSplitForm(p, presetDate));
              setModeRaw('split');
              setSeq((n) => n + 1);
            }} />
        )
        : <SplitForm key={`s${seq}`} initial={splitInitial} date={presetDate} onSubmit={done} submitLabel="記帳する" />}
    </Screen>
  );
}
