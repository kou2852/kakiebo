// 月カレンダーの見出し（‹ ○年○月 ›）と、年・月を選ぶ表。DateField のピッカーと仕訳帳のカレンダーで共有する。
//
// 見出しの「○年○月」を押すと月の表、月の表で「○年」を押すと年の表に切り替わる（2026-10-18 指示。‹ › で1か月ずつ送るのが大変なため）。
// 年の表は12年分。‹ › で12年ずつ送る。年を押すと月の表、月を押すと日の表に戻る。
// 日の表（children）は呼び出し側が持つ。選んでいる月は呼び出し側の state（month は各月の1日）。
import { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';

const YEARS = 12;

export default function MonthNav({ month, setMonth, children }) {
  const t = useTheme();
  // 'days'＝日を選ぶ／'months'＝月を選ぶ／'years'＝年を選ぶ
  const [mode, setMode] = useState('days');
  // 年の表の先頭の年（開いた年が前から7番目に来るようにする）
  const [yearStart, setYearStart] = useState(0);
  const y = month.getFullYear();
  const mo = month.getMonth();
  const now = new Date();
  const shift = (n) => setMonth(new Date(y, mo + n, 1));
  // ‹ › の送り幅: 日の表は1か月、月の表は1年、年の表は12年
  const step = (dir) => {
    if (mode === 'years') setYearStart((v) => v + dir * YEARS);
    else shift(mode === 'days' ? dir : dir * 12);
  };
  const title = mode === 'days' ? `${y}年${mo + 1}月` : mode === 'months' ? `${y}年` : `${yearStart}〜${yearStart + YEARS - 1}年`;
  // 見出しを押したとき: 日 → 月 → 年。年の表で押すと月の表に戻る
  const toggle = () => {
    if (mode === 'days') setMode('months');
    else if (mode === 'months') { setYearStart(y - 6); setMode('years'); }
    else setMode('months');
  };
  const label = { days: ['前の月', '次の月', '月を選ぶ'], months: ['前の年', '次の年', '年を選ぶ'], years: ['前の12年', '次の12年', '月を選ぶ'] }[mode];

  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <TouchableOpacity onPress={() => step(-1)} style={{ padding: 8 }} accessibilityLabel={label[0]}>
          <Text style={{ color: t.ac, fontSize: 20, fontWeight: '700' }}>‹</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={toggle} hitSlop={6} accessibilityRole="button" accessibilityLabel={label[2]}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, backgroundColor: t.bg3 }}>
          <Text style={{ color: t.tx, fontSize: 16, fontWeight: '700' }}>{title}</Text>
          <Ionicons name={mode === 'years' ? 'chevron-up' : 'chevron-down'} size={16} color={t.tx2} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => step(1)} style={{ padding: 8 }} accessibilityLabel={label[1]}>
          <Text style={{ color: t.ac, fontSize: 20, fontWeight: '700' }}>›</Text>
        </TouchableOpacity>
      </View>
      {mode === 'years' ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingVertical: 4 }}>
          {Array.from({ length: YEARS }, (_, i) => {
            const yy = yearStart + i;
            const selected = yy === y;
            const isNow = yy === now.getFullYear();
            return (
              <TouchableOpacity key={yy} onPress={() => { setMonth(new Date(yy, mo, 1)); setMode('months'); }}
                style={{ width: '25%', height: 56, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{
                  width: 72, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: selected ? t.ac : 'transparent',
                  borderWidth: !selected && isNow ? 1.5 : 0, borderColor: t.ac,
                }}>
                  <Text style={{ color: selected ? t.acTx : t.tx, fontSize: 16, fontWeight: selected ? '700' : '400' }}>{yy}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : mode === 'months' ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingVertical: 4 }}>
          {Array.from({ length: 12 }, (_, i) => {
            const selected = i === mo;
            const isNow = y === now.getFullYear() && i === now.getMonth();
            return (
              <TouchableOpacity key={i} onPress={() => { setMonth(new Date(y, i, 1)); setMode('days'); }}
                style={{ width: '25%', height: 56, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{
                  width: 64, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: selected ? t.ac : 'transparent',
                  borderWidth: !selected && isNow ? 1.5 : 0, borderColor: t.ac,
                }}>
                  <Text style={{ color: selected ? t.acTx : t.tx, fontSize: 16, fontWeight: selected ? '700' : '400' }}>{i + 1}月</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : children}
    </>
  );
}
