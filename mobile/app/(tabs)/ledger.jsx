import { useMemo, useState } from 'react';
import { Alert, FlatList, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useData } from '../../src/store/DataProvider';
import { useTheme } from '../../src/theme';
import { Button, Empty, Segmented, sep } from '../../src/components/ui';
import PeriodBar, { usePeriod } from '../../src/components/PeriodBar';
import BottomSheet from '../../src/components/BottomSheet';
import { fa, ymd } from '../../src/utils/format';
import { filterByPeriod } from '../../src/utils/bookkeeping';

const WEEK = ['日', '月', '火', '水', '木', '金', '土'];

/** 月グリッド。日をタップしても表は動かさず、その日の一覧はモーダルで出す。 */
function MonthGrid({ month, setMonth, journals, accounts, onSelect }) {
  const t = useTheme();

  const { cells, label, byDay } = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const expenseIds = new Set(accounts.filter((a) => a.type === 'expense').map((a) => a.id));

    const sums = {};
    journals.forEach((j) => {
      const n = j.lines.reduce((s, l) => s + (l.side === 'dr' && expenseIds.has(l.accountId) ? l.amount : 0), 0);
      if (n) sums[j.date] = (sums[j.date] || 0) + n;
    });

    const out = Array(first.getDay()).fill(null); // 月初までの空きマス
    for (let d = 1; d <= days; d++) out.push(ymd(new Date(month.getFullYear(), month.getMonth(), d)));
    return { cells: out, label: `${month.getFullYear()}年${month.getMonth() + 1}月`, byDay: sums };
  }, [month, journals, accounts]);

  const shift = (n) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));
  const todayStr = ymd(new Date());

  return (
    <View style={[{ backgroundColor: t.bg1, padding: 12, gap: 8, borderRadius: 14, margin: 13 }, t.shadow]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <TouchableOpacity onPress={() => shift(-1)} style={{ padding: 8 }}>
          <Text style={{ color: t.ac, fontSize: 18, fontWeight: '700' }}>‹</Text>
        </TouchableOpacity>
        <Text style={{ color: t.tx, fontSize: 16, fontWeight: '700' }}>{label}</Text>
        <TouchableOpacity onPress={() => shift(1)} style={{ padding: 8 }}>
          <Text style={{ color: t.ac, fontSize: 18, fontWeight: '700' }}>›</Text>
        </TouchableOpacity>
      </View>

      <View style={{ flexDirection: 'row' }}>
        {WEEK.map((w, i) => (
          <Text key={w} style={{ flex: 1, textAlign: 'center', fontSize: 13, color: i === 0 ? t.red : i === 6 ? t.blu : t.tx3 }}>{w}</Text>
        ))}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {cells.map((date, i) => {
          if (!date) return <View key={`e${i}`} style={{ width: '14.28%', height: 52 }} />;
          const amount = byDay[date];
          const isToday = date === todayStr;
          return (
            <TouchableOpacity
              key={date}
              onPress={() => onSelect(date)}
              style={{ width: '14.28%', height: 52, alignItems: 'center', justifyContent: 'center' }}
            >
              <View style={{
                width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center',
                backgroundColor: isToday ? t.ac : 'transparent',
              }}>
                <Text style={{ color: isToday ? t.acTx : t.tx, fontSize: 15, fontWeight: isToday ? '700' : '400' }}>
                  {Number(date.slice(8, 10))}
                </Text>
              </View>
              {amount ? (
                <Text style={{ color: t.tx2, fontSize: 12.5 }} numberOfLines={1}>
                  {amount >= 10000 ? `${Math.round(amount / 1000)}k` : amount}
                </Text>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export default function Ledger() {
  const t = useTheme();
  const router = useRouter();
  const { accounts, journals, del } = useData();

  const [mode, setMode] = useState('list');
  const [month, setMonth] = useState(() => new Date());
  const [dayOpen, setDayOpen] = useState(null); // モーダルで開いている日
  const period = usePeriod('month');

  // 一括操作。選択モードに入るまでチェックは出さない（通常の閲覧を邪魔しないため）。
  const [picking, setPicking] = useState(false);
  const [checked, setChecked] = useState(() => new Set());
  const toggle = (id) => setChecked((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const endPicking = () => { setPicking(false); setChecked(new Set()); };

  const name = useMemo(() => Object.fromEntries(accounts.map((a) => [a.id, a.name])), [accounts]);
  const rows = useMemo(
    () => [...filterByPeriod(journals, period.start, period.end)]
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    [journals, period]
  );
  const dayRows = useMemo(
    () => (dayOpen ? journals.filter((j) => j.date === dayOpen) : []),
    [journals, dayOpen]
  );

  const confirmDelete = (j) =>
    Alert.alert('この仕訳を削除しますか？', `${j.date}  ${j.desc || '(摘要なし)'}`, [
      { text: 'キャンセル', style: 'cancel' },
      { text: '削除', style: 'destructive', onPress: () => del('journals', j.id) },
    ]);

  const renderRow = (item, inModal) => {
    const drs = item.lines.filter((l) => l.side === 'dr');
    const crs = item.lines.filter((l) => l.side === 'cr');
    const total = drs.reduce((s, l) => s + l.amount, 0);
    const selectable = picking && !inModal;
    return (
      <TouchableOpacity
        onPress={() => {
          if (selectable) return toggle(item.id);
          setDayOpen(null);
          return router.push(`/journal/${item.id}`);
        }}
        onLongPress={() => (selectable ? null : confirmDelete(item))}
        style={[{
          backgroundColor: t.bg1, paddingVertical: 12, paddingHorizontal: 15,
          flexDirection: 'row', alignItems: 'center',
        }, sep(t)]}
      >
        {selectable ? (
          <View style={{
            width: 20, height: 20, borderRadius: 10, marginRight: 11,
            borderWidth: 1.5, borderColor: checked.has(item.id) ? t.ac : t.bd2,
            backgroundColor: checked.has(item.id) ? t.ac : 'transparent',
            alignItems: 'center', justifyContent: 'center',
          }}>
            {checked.has(item.id) ? <Text style={{ color: t.acTx, fontSize: 13, fontWeight: '800' }}>✓</Text> : null}
          </View>
        ) : null}
        <View style={{ flex: 1, gap: 3 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ color: t.tx3, fontSize: 13 }}>{item.date}</Text>
            <Text style={{ color: t.tx, fontSize: 16, fontWeight: '700' }}>{fa(total)}</Text>
          </View>
          <Text style={{ color: t.tx, fontSize: 15 }} numberOfLines={1}>{item.desc || '(摘要なし)'}</Text>
          <Text style={{ color: t.tx2, fontSize: 14 }} numberOfLines={1}>
            {drs.map((l) => name[l.accountId] || '?').join('・')}
            <Text style={{ color: t.tx3 }}>  ←  </Text>
            {crs.map((l) => name[l.accountId] || '?').join('・')}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg0 }}>
      {/* 切替と期間はスクロールしても上に残す */}
      <View style={{ padding: 13, paddingBottom: 9, gap: 9, backgroundColor: t.bg0 }}>
        <Segmented
          options={[{ value: 'list', label: '一覧' }, { value: 'cal', label: 'カレンダー' }]}
          // カレンダーから離れるとシートだけが宙に浮くので、切り替え時に閉じる
          value={mode} onChange={(v) => { setMode(v); setDayOpen(null); }}
        />
        {/* カレンダーは月の移動そのものが期間の指定なので、期間バーは出さない */}
        {mode === 'list' ? <PeriodBar period={period} /> : null}
      </View>

      {mode === 'cal' ? (
        <MonthGrid month={month} setMonth={setMonth} journals={journals} accounts={accounts}
          onSelect={setDayOpen} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(j) => j.id}
          ListEmptyComponent={<Empty text="この期間の仕訳はありません" />}
          renderItem={({ item }) => renderRow(item, false)}
          ListFooterComponent={
            rows.length ? (
              <Text style={{ color: t.tx3, fontSize: 13, textAlign: 'center', padding: 16 }}>
                タップで編集・長押しで削除
              </Text>
            ) : null
          }
        />
      )}

      {/* 一括操作は下端に固定する。件数が多いと、末尾まで送らないと押せなくなるため */}
      {mode === 'list' && rows.length ? (
        <View style={{
          paddingHorizontal: 13, paddingTop: 9, paddingBottom: 11, gap: 8,
          backgroundColor: t.bg1, borderTopWidth: 1, borderTopColor: t.bd,
        }}>
          {picking ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <Text style={{ color: t.ac, fontSize: 15, fontWeight: '700', flex: 1 }}>{checked.size} 件を選択中</Text>
                <TouchableOpacity onPress={() => setChecked(new Set(rows.map((j) => j.id)))}>
                  <Text style={{ color: t.ac, fontSize: 15 }}>すべて</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={endPicking}>
                  <Text style={{ color: t.tx2, fontSize: 15 }}>やめる</Text>
                </TouchableOpacity>
              </View>
              <Button label={`選択した ${checked.size} 件をまとめて編集`} disabled={!checked.size}
                onPress={() => { router.push(`/ledger/bulk?ids=${[...checked].join(',')}`); endPicking(); }} />
            </>
          ) : (
            <Button label="まとめて編集する" variant="ghost" onPress={() => setPicking(true)} />
          )}
        </View>
      ) : null}

      {/* カレンダーを隠さない高さで出し、上へスワイプで全画面、下へスワイプで戻す・閉じる */}
      <BottomSheet visible={!!dayOpen} onClose={() => setDayOpen(null)} title={`${dayOpen || ''} の仕訳`}>
        <FlatList
          data={dayRows}
          keyExtractor={(j) => j.id}
          ListEmptyComponent={<Empty text="この日の仕訳はありません" />}
          renderItem={({ item }) => renderRow(item, true)}
        />
        <View style={{ padding: 13, borderTopWidth: 1, borderTopColor: t.bd }}>
          <Button label="この日に記帳する"
            onPress={() => { const d = dayOpen; setDayOpen(null); router.push(`/add?date=${d}`); }} />
        </View>
      </BottomSheet>
    </View>
  );
}
