// 期間の切り替え。Web 版 Dashboard/PeriodBar.jsx と同じ選択肢・同じ id を使う。
//
// これが無いと全画面が「今月」固定になり、先月や今年を見られない。
// 資産管理として推移を追うのが目的なので、期間を動かせないのは機能として不足していた。
import { useState } from 'react';
import { Text, View } from 'react-native';
import { useTheme } from '../theme';
import { ChipRow, Input } from './ui';
import { getPeriodRange } from '../utils/bookkeeping';

const MODES = [
  { value: 'month', label: '今月' },
  { value: 'lastm', label: '先月' },
  { value: 'last2m', label: '先々月' },
  { value: 'year', label: '今年' },
  { value: 'all', label: '全期間' },
  { value: 'custom', label: '期間指定' },
];

const LABEL = Object.fromEntries(MODES.map((m) => [m.value, m.label]));

/** 期間の状態をまとめて持つ。画面側は const p = usePeriod() だけで済む。 */
export function usePeriod(initial = 'month') {
  const [mode, setMode] = useState(initial);
  const [custom, setCustom] = useState({ start: '', end: '' });
  const { start, end } = getPeriodRange(mode, custom);
  return { mode, setMode, custom, setCustom, start, end, label: LABEL[mode] };
}

export default function PeriodBar({ period }) {
  const t = useTheme();
  const { mode, setMode, custom, setCustom, start, end } = period;

  return (
    <View style={{ gap: 7 }}>
      <ChipRow options={MODES} value={mode} onChange={setMode} />

      {mode === 'custom' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Input
            value={custom.start} onChangeText={(v) => setCustom((c) => ({ ...c, start: v }))}
            placeholder="開始 YYYY-MM-DD" keyboardType="numbers-and-punctuation"
            style={{ flex: 1, paddingVertical: 7, fontSize: 13 }}
          />
          <Text style={{ color: t.tx3 }}>〜</Text>
          <Input
            value={custom.end} onChangeText={(v) => setCustom((c) => ({ ...c, end: v }))}
            placeholder="終了 YYYY-MM-DD" keyboardType="numbers-and-punctuation"
            style={{ flex: 1, paddingVertical: 7, fontSize: 13 }}
          />
        </View>
      ) : (
        // いま何を見ているかを必ず出す。期間を変えられる画面では、
        // 数字だけ見て別の期間だと気づかない事故が起きやすい。
        <Text style={{ color: t.tx3, fontSize: 12 }}>
          {mode === 'all' ? '全期間' : `${start} 〜 ${end}`}
        </Text>
      )}
    </View>
  );
}
