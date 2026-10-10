// 日付の入力欄。手入力もできるまま、右のボタンから月カレンダーで選べる。
//
// ネイティブの日付ピッカーは入れない（ネイティブ依存が増えて OTA が届かなくなる）。
// 月グリッドは JS だけで組む。ledger.jsx のカレンダーと同じ並び（日曜始まり）。
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
  const y = month.getFullYear();
  const mo = month.getMonth();
  const days = new Date(y, mo + 1, 0).getDate();
  const cells = [
    ...Array(new Date(y, mo, 1).getDay()).fill(null),
    ...Array.from({ length: days }, (_, i) => ymd(new Date(y, mo, i + 1))),
  ];
  const todayStr = ymd(new Date());
  const shift = (n) => setMonth(new Date(y, mo + n, 1));

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,.45)', justifyContent: 'center', padding: 24 }}>
        {/* 中のタップが背景に抜けて閉じないよう、空の onPress で受ける */}
        <Pressable onPress={() => {}} style={{ backgroundColor: t.bg1, borderRadius: 16, padding: 14, gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <TouchableOpacity onPress={() => shift(-1)} style={{ padding: 8 }}>
              <Text style={{ color: t.ac, fontSize: 20, fontWeight: '700' }}>‹</Text>
            </TouchableOpacity>
            <Text style={{ color: t.tx, fontSize: 16, fontWeight: '700' }}>{y}年{mo + 1}月</Text>
            <TouchableOpacity onPress={() => shift(1)} style={{ padding: 8 }}>
              <Text style={{ color: t.ac, fontSize: 20, fontWeight: '700' }}>›</Text>
            </TouchableOpacity>
          </View>
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
