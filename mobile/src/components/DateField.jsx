// 日付の入力欄。手入力もできるまま、右のボタンから月カレンダーで選べる。
//
// ネイティブの日付ピッカーは入れない（ネイティブ依存が増えて OTA が届かなくなる）。
// 月グリッドは JS だけで組む。ledger.jsx のカレンダーと同じ並び（日曜始まり）。
// 見出しの「○年○月」を押すと月の表、月の表で「○年」を押すと年の表に切り替わる（2026-10-18 指示。‹ › で1か月ずつ送るのが大変なため）。
// 年の表は12年分。‹ › で12年ずつ送る。年を押すと月の表、月を押すと日の表に戻る。
import { useState } from 'react';
import { Modal, Pressable, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';
import { ymd } from '../utils/format';
import { Input } from './ui';

const WEEK = ['日', '月', '火', '水', '木', '金', '土'];
const VALID = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 入力が日付として読めればその月の1日、読めなければ今月の1日。 */
const monthOf = (value) => {
  const m = VALID.exec(value || '');
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, 1) : new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
};

function Picker({ value, onPick, onClose }) {
  const t = useTheme();
  const [month, setMonth] = useState(() => monthOf(value));
  // 'days'＝日を選ぶ／'months'＝月を選ぶ／'years'＝年を選ぶ
  const [mode, setMode] = useState('days');
  // 年の表の先頭の年（開いた年が前から7番目に来るようにする）
  const [yearStart, setYearStart] = useState(0);
  const y = month.getFullYear();
  const mo = month.getMonth();
  const days = new Date(y, mo + 1, 0).getDate();
  const cells = [
    ...Array(new Date(y, mo, 1).getDay()).fill(null),
    ...Array.from({ length: days }, (_, i) => ymd(new Date(y, mo, i + 1))),
  ];
  const todayStr = ymd(new Date());
  const shift = (n) => setMonth(new Date(y, mo + n, 1));
  const now = new Date();
  const YEARS = 12;
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
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,.45)', justifyContent: 'center', padding: 24 }}>
        {/* 中のタップが背景に抜けて閉じないよう、空の onPress で受ける */}
        <Pressable onPress={() => {}} style={{ backgroundColor: t.bg1, borderRadius: 16, padding: 14, gap: 8 }}>
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
          ) : (
          <>
          <View style={{ flexDirection: 'row' }}>
            {WEEK.map((w, i) => (
              <Text key={w} style={{ flex: 1, textAlign: 'center', fontSize: 13, color: i === 0 ? t.red : i === 6 ? t.blu : t.tx3 }}>{w}</Text>
            ))}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {cells.map((date, i) => {
              if (!date) return <View key={`e${i}`} style={{ width: '14.28%', height: 44 }} />;
              const selected = date === value;
              return (
                <TouchableOpacity key={date} onPress={() => onPick(date)}
                  style={{ width: '14.28%', height: 44, alignItems: 'center', justifyContent: 'center' }}>
                  <View style={{
                    width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center',
                    backgroundColor: selected ? t.ac : 'transparent',
                    borderWidth: !selected && date === todayStr ? 1.5 : 0, borderColor: t.ac,
                  }}>
                    <Text style={{ color: selected ? t.acTx : t.tx, fontSize: 16, fontWeight: selected ? '700' : '400' }}>
                      {Number(date.slice(8, 10))}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
          </>
          )}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 4 }}>
            <TouchableOpacity onPress={() => onPick(todayStr)} style={{ padding: 8 }}>
              <Text style={{ color: t.ac, fontSize: 15, fontWeight: '600' }}>今日</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} style={{ padding: 8 }}>
              <Text style={{ color: t.tx2, fontSize: 15 }}>閉じる</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Input と同じ props（value / onChangeText / placeholder / style）で置き換えられる。 */
export default function DateField({ value, onChangeText, placeholder = 'YYYY-MM-DD', style }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: style?.flex }}>
      <Input value={value} onChangeText={onChangeText} placeholder={placeholder}
        keyboardType="numbers-and-punctuation" style={[{ flex: 1 }, style]} />
      <TouchableOpacity onPress={() => setOpen(true)} accessibilityLabel="カレンダーから選ぶ"
        style={{ padding: 6 }} hitSlop={6}>
        <Ionicons name="calendar-outline" size={24} color={t.ac} />
      </TouchableOpacity>
      {/* 開くたびに入力中の日付の月から始めるため、開いている間だけ作る */}
      {open ? (
        <Picker value={value} onClose={() => setOpen(false)}
          onPick={(d) => { onChangeText(d); setOpen(false); }} />
      ) : null}
    </View>
  );
}
