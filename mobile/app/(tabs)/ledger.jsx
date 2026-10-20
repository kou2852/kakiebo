import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, FlatList, PanResponder, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useData } from '../../src/store/DataProvider';
import { useSyncRefresh } from '../../src/store/useSyncRefresh';
import { useTheme } from '../../src/theme';
import { Button, Card, Empty, Segmented, sep } from '../../src/components/ui';
import PeriodBar, { usePeriod } from '../../src/components/PeriodBar';
import BottomSheet from '../../src/components/BottomSheet';
import SwipeRow from '../../src/components/SwipeRow';
import AccountPicker from '../../src/components/AccountPicker';
import DeleteConfirm from '../../src/components/DeleteConfirm';
import { getSkipDeleteConfirm, setSkipDeleteConfirm } from '../../src/store/deletePref';
import { ACCOUNT_TYPES, fa, faBal, ymd } from '../../src/utils/format';
import { filterByPeriod } from '../../src/utils/bookkeeping';
import { buildLedger } from '../../src/utils/generalLedger';
import { ADS_ENABLED, adsAvailable } from '../../src/components/Ad';
import LazyAd from '../../src/components/LazyAd';
import { ScrollWatch, createScrollWatch } from '../../src/store/scrollWatch';
import { useAdFree } from '../../src/adFree';
import { useOnboarding } from '../../src/store/OnboardingProvider';
import { useTour } from '../../src/store/TourProvider';
import { withAd } from '../../src/utils/listAd';

const WEEK = ['日', '月', '火', '水', '木', '金', '土'];
// 1マスの高さ。日付の丸（26）と収入・支出の2行が収まる最小限
const CELL_H = 58;
// これより大きく横に動かしたら月を送る
const SWIPE_PX = 50;

/** マスが狭いので、1万円以上は千円単位（k）、100万円以上は百万円単位（M）にする。 */
const short = (n) => {
  const v = Math.abs(n);
  if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
  if (v >= 10000) return `${Math.round(v / 1000)}k`;
  return String(v);
};

/** 月グリッド。日をタップしても表は動かさず、その日の一覧はモーダルで出す。
 * 横にスライドすると月を送る（左へ＝翌月、右へ＝前月）。‹ › のボタンも残す。 */
function MonthGrid({ month, setMonth, journals, accounts, onSelect }) {
  const t = useTheme();
  const [x] = useState(() => new Animated.Value(0));
  const width = useRef(360);
  // PanResponder は作り直さないので、最新の月は ref 経由で見る
  const monthRef = useRef(month);
  useEffect(() => { monthRef.current = month; }, [month]);

  // ref を読むのはジェスチャの発生時だけで、レンダー中には走らない（SwipeRow と同じ誤検出）。
  // eslint-disable-next-line react-hooks/refs
  const [pan] = useState(() => PanResponder.create({
    // 横に動いたときだけ取る。縦のスクロールと日付のタップは邪魔しない。
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderMove: (_, g) => x.setValue(g.dx),
    onPanResponderRelease: (_, g) => {
      const dir = g.dx <= -SWIPE_PX || g.vx < -0.5 ? 1 : g.dx >= SWIPE_PX || g.vx > 0.5 ? -1 : 0;
      if (!dir) {
        Animated.spring(x, { toValue: 0, useNativeDriver: true, bounciness: 0, speed: 20 }).start();
        return;
      }
      // 今の月を送り出し、反対側から次の月を入れる
      Animated.timing(x, { toValue: -dir * width.current, duration: 140, useNativeDriver: true }).start(() => {
        const m = monthRef.current;
        setMonth(new Date(m.getFullYear(), m.getMonth() + dir, 1));
        x.setValue(dir * width.current);
        Animated.timing(x, { toValue: 0, duration: 160, useNativeDriver: true }).start();
      });
    },
    onPanResponderTerminate: () => Animated.spring(x, { toValue: 0, useNativeDriver: true }).start(),
  }));

  const { cells, label, byDay } = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const typeOf = Object.fromEntries(accounts.map((a) => [a.id, a.type]));

    // 日ごとに収入と支出を別々に集計する。収入だけの日も出せるように、支出だけにはしない。
    // 収入は貸方−借方、支出は借方−貸方（返金などで逆向きに動いた分も差し引く）。
    const sums = {};
    journals.forEach((j) => {
      let inc = 0;
      let exp = 0;
      j.lines.forEach((l) => {
        const sign = l.side === 'dr' ? 1 : -1;
        if (typeOf[l.accountId] === 'expense') exp += sign * l.amount;
        else if (typeOf[l.accountId] === 'income') inc -= sign * l.amount;
      });
      if (!inc && !exp) return;
      const d = sums[j.date] || (sums[j.date] = { inc: 0, exp: 0 });
      d.inc += inc;
      d.exp += exp;
    });

    const out = Array(first.getDay()).fill(null); // 月初までの空きマス
    for (let d = 1; d <= days; d++) out.push(ymd(new Date(month.getFullYear(), month.getMonth(), d)));
    return { cells: out, label: `${month.getFullYear()}年${month.getMonth() + 1}月`, byDay: sums };
  }, [month, journals, accounts]);

  const shift = (n) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));
  const todayStr = ymd(new Date());

  return (
    <View style={[{ backgroundColor: t.bg1, padding: 12, gap: 6, borderRadius: 14, margin: 13, overflow: 'hidden' }, t.shadow]}
      onLayout={(e) => { width.current = e.nativeEvent.layout.width; }} {...pan.panHandlers}>
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

      <Animated.View style={{ flexDirection: 'row', flexWrap: 'wrap', transform: [{ translateX: x }] }}>
        {cells.map((date, i) => {
          if (!date) return <View key={`e${i}`} style={{ width: '14.28%', height: CELL_H }} />;
          const amount = byDay[date];
          const isToday = date === todayStr;
          return (
            <TouchableOpacity
              key={date}
              onPress={() => onSelect(date)}
              style={{ width: '14.28%', height: CELL_H, alignItems: 'center', paddingTop: 1 }}
            >
              <View style={{
                width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center',
                backgroundColor: isToday ? t.ac : 'transparent',
              }}>
                <Text style={{ color: isToday ? t.acTx : t.tx, fontSize: 15, fontWeight: isToday ? '700' : '400' }}>
                  {Number(date.slice(8, 10))}
                </Text>
              </View>
              {/* 収入と支出を2行で出す。色だけに頼らないよう符号も付ける。 */}
              {amount?.inc ? (
                <Text style={{ color: t.grn, fontSize: 11.5, fontWeight: '600' }} numberOfLines={1}>+{short(amount.inc)}</Text>
              ) : null}
              {amount?.exp ? (
                <Text style={{ color: t.red, fontSize: 11.5, fontWeight: '600' }} numberOfLines={1}>-{short(amount.exp)}</Text>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </Animated.View>
    </View>
  );
}

function Stat({ label, value }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={{ color: t.tx3, fontSize: 12 }}>{label}</Text>
      <Text style={{ color: t.tx, fontSize: 14, fontWeight: '700' }} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    </View>
  );
}

/** 総勘定元帳。選んだ科目の明細を日付順に並べ、1件ごとの差引残高を出す。 */
function GeneralLedger({ account, accounts, journals, period, onOpen, refresh }) {
  const t = useTheme();
  const book = useMemo(
    () => buildLedger(journals, account, accounts, period.start, period.end),
    [journals, account, accounts, period.start, period.end]
  );
  // 全期間は、繰越が0なら出さない（始まりの行が「繰越 ¥0」だと紛らわしい）
  const showOpening = period.mode !== 'all' || book.opening !== 0;

  return (
    <FlatList
      data={book.rows}
      keyExtractor={(r) => r.id}
      style={{ flex: 1 }}
      refreshControl={refresh.control}
      ListHeaderComponent={(
        <View style={{ padding: 13, paddingTop: 4, gap: 10 }}>
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
              <Text style={{ color: t.tx, fontSize: 17, fontWeight: '700', flexShrink: 1 }} numberOfLines={1}>{account.name}</Text>
              <Text style={{ color: t.tx3, fontSize: 13 }}>{ACCOUNT_TYPES[account.type]}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Stat label="期首の残高" value={faBal(book.opening)} />
              <Stat label="借方の合計" value={fa(book.dr)} />
              <Stat label="貸方の合計" value={fa(book.cr)} />
              <Stat label="期末の残高" value={faBal(book.closing)} />
            </View>
          </Card>
          {showOpening ? (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 2 }}>
              <Text style={{ color: t.tx2, fontSize: 14 }}>繰越（{period.mode === 'all' ? '開始時点' : `${period.start} より前`}）</Text>
              <Text style={{ color: t.tx, fontSize: 14, fontWeight: '700' }}>残高 {faBal(book.opening)}</Text>
            </View>
          ) : null}
        </View>
      )}
      ListEmptyComponent={<Empty text="この期間に、この科目の仕訳はありません" />}
      renderItem={({ item: r }) => (
        <TouchableOpacity
          onPress={() => onOpen(r.id)}
          style={[{ backgroundColor: t.bg1, paddingVertical: 11, paddingHorizontal: 15, flexDirection: 'row', gap: 12 }, sep(t)]}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: t.tx3, fontSize: 13 }}>{r.date}</Text>
            <Text style={{ color: t.tx, fontSize: 15 }} numberOfLines={1}>{r.desc || '(摘要なし)'}</Text>
            <Text style={{ color: t.tx2, fontSize: 13 }} numberOfLines={1}>{r.counter.join('・')}</Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 2, minWidth: 120 }}>
            {r.dr ? <Text style={{ color: t.tx, fontSize: 14 }}><Text style={{ color: t.tx3, fontSize: 12 }}>借方 </Text>{fa(r.dr)}</Text> : null}
            {r.cr ? <Text style={{ color: t.tx, fontSize: 14 }}><Text style={{ color: t.tx3, fontSize: 12 }}>貸方 </Text>{fa(r.cr)}</Text> : null}
            <Text style={{ color: r.balance < 0 ? t.red : t.tx, fontSize: 15, fontWeight: '700' }}>
              <Text style={{ color: t.tx3, fontSize: 12, fontWeight: '400' }}>残高 </Text>{faBal(r.balance)}
            </Text>
          </View>
        </TouchableOpacity>
      )}
      ListFooterComponent={<Text style={{ color: t.tx3, fontSize: 13, textAlign: 'center', padding: 16 }}>タップで内容を直せます</Text>}
    />
  );
}

export default function Ledger() {
  const t = useTheme();
  const router = useRouter();
  const { accounts, journals, del } = useData();
  const refresh = useSyncRefresh();

  const [mode, setMode] = useState('list');
  const [month, setMonth] = useState(() => new Date());
  const [dayOpen, setDayOpen] = useState(null); // モーダルで開いている日
  const period = usePeriod('month');
  // 科目で絞り込む（ウェブの仕訳帳の「全科目」に当たる）。複数選べて、どれかを使っている仕訳を出す。
  // 2026-10-01 の問い合わせ（全科目の場所が分からない）から。非表示の科目も過去の仕訳を見るために選べる。
  const [accts, setAccts] = useState([]);
  // 元帳で見る科目（1つ）。一覧で1つだけ絞り込んでいるときは、そこから引き継ぐ
  const [glAcct, setGlAcct] = useState('');
  // 一覧の4行目（先頭3件のあと）に広告を1つ挟む（2026-10-21 復活）。広告を消している日・まとめて選んでいる間・
  // オンボーディングとツアーの間は挟まない（行を選ぶ・指す操作の邪魔をしない）
  const { active: adFree } = useAdFree();
  // 広告は、画面に近づいたら読み込む（LazyAd）。一覧のスクロールを知らせる
  const [watch] = useState(() => createScrollWatch());
  const onboarding = useOnboarding();
  const tour = useTour();

  // 一括操作。選択モードに入るまでチェックは出さない（通常の閲覧を邪魔しないため）。
  const [picking, setPicking] = useState(false);
  const [checked, setChecked] = useState(() => new Set());
  const toggle = (id) => setChecked((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const endPicking = () => { setPicking(false); setChecked(new Set()); };
  const showAd = adsAvailable() && ADS_ENABLED && !adFree && !picking && !onboarding?.active && !tour?.tourId;

  const name = useMemo(() => Object.fromEntries(accounts.map((a) => [a.id, a.name])), [accounts]);
  const rows = useMemo(
    () => [...filterByPeriod(journals, period.start, period.end)]
      .filter((j) => !accts.length || j.lines.some((l) => accts.includes(l.accountId)))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    [journals, period, accts]
  );
  const dayRows = useMemo(
    () => (dayOpen ? journals.filter((j) => j.date === dayOpen) : []),
    [journals, dayOpen]
  );

  // 削除の確認。「次回から確認しない」にしている端末では、確認を出さずにそのまま消す。
  const [delTarget, setDelTarget] = useState(null);
  const confirmDelete = async (j) => {
    if (await getSkipDeleteConfirm()) return del('journals', j.id);
    return setDelTarget(j);
  };
  const doDelete = async (skip) => {
    const j = delTarget;
    setDelTarget(null);
    if (skip) await setSkipDeleteConfirm(true);
    if (j) del('journals', j.id);
  };

  const renderRow = (item, inModal) => {
    const drs = item.lines.filter((l) => l.side === 'dr');
    const crs = item.lines.filter((l) => l.side === 'cr');
    const total = drs.reduce((s, l) => s + l.amount, 0);
    const selectable = picking && !inModal;
    const go = (path) => { setDayOpen(null); router.push(path); };
    return (
      // 左へスライドで「編集」「コピー」「削除」。まとめて選んでいる間は選択の邪魔になるので出さない。
      <SwipeRow disabled={selectable} actions={[
        { label: '編集', color: t.acb, textColor: t.ac, onPress: () => go(`/journal/${item.id}`) },
        { label: 'コピー', onPress: () => go(`/journal/${item.id}?copy=1`) },
        // 取り消せない操作なので赤い塗りで目立たせる。押すと確認が出る。
        { label: '削除', color: t.red, textColor: '#ffffff', onPress: () => confirmDelete(item) },
      ]}>
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
      </SwipeRow>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg0 }}>
      {/* 切替と期間はスクロールしても上に残す */}
      <View style={{ padding: 13, paddingBottom: 9, gap: 9, backgroundColor: t.bg0 }}>
        <Segmented
          options={[{ value: 'list', label: '一覧' }, { value: 'cal', label: 'カレンダー' }, { value: 'gl', label: '元帳' }]}
          // カレンダーから離れるとシートだけが宙に浮くので、切り替え時に閉じる
          value={mode} onChange={(v) => {
            setMode(v);
            setDayOpen(null);
            if (v === 'gl' && !glAcct && accts.length === 1) setGlAcct(accts[0]);
          }}
        />
        {/* カレンダーは月の移動そのものが期間の指定なので、期間バーは出さない */}
        {mode === 'list' || mode === 'gl' ? <PeriodBar period={period} /> : null}
        {mode === 'list' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <AccountPicker label="科目" accounts={accounts} value={accts} onChange={setAccts} placeholder="全科目" multiple />
            </View>
            {accts.length === 1 ? (
              <TouchableOpacity onPress={() => { setGlAcct(accts[0]); setMode('gl'); }} style={{ paddingVertical: 8 }}>
                <Text style={{ color: t.ac, fontSize: 15, fontWeight: '600' }}>元帳で見る</Text>
              </TouchableOpacity>
            ) : null}
            {accts.length ? (
              <TouchableOpacity onPress={() => setAccts([])} style={{ paddingVertical: 8 }}>
                <Text style={{ color: t.ac, fontSize: 15, fontWeight: '600' }}>解除</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
        {mode === 'gl' ? (
          <AccountPicker label="科目" accounts={accounts} value={glAcct} onChange={setGlAcct} placeholder="科目を選ぶ" />
        ) : null}
      </View>

      {mode === 'gl' ? (
        accounts.find((a) => a.id === glAcct) ? (
          <GeneralLedger account={accounts.find((a) => a.id === glAcct)} accounts={accounts} journals={journals}
            period={period} refresh={refresh} onOpen={(id) => router.push(`/journal/${id}`)} />
        ) : (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }} refreshControl={refresh.control}>
            <Empty text="科目を選ぶと、その科目の明細と残高が日付順に出ます" />
          </ScrollView>
        )
      ) : mode === 'cal' ? (
        <MonthGrid month={month} setMonth={setMonth} journals={journals} accounts={accounts}
          onSelect={setDayOpen} />
      ) : rows.length === 0 ? (
        // 仕訳が無いときは FlatList を使わない。空の一覧は高さを持たず、
        // 「ありません」の文言も引っ張るための余白も出ない（実際に出なかった）。
        // 取り込むものが無いときこそ引っ張って取りに行きたいので、ここは素直に書く。
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
          refreshControl={refresh.control}
        >
          <Empty text={accts.length ? 'この期間に、選んだ科目の仕訳はありません' : 'この期間の仕訳はありません'} />
        </ScrollView>
      ) : (
        <ScrollWatch.Provider value={watch}>
        <FlatList
          data={withAd(rows, showAd)}
          keyExtractor={(j) => j.id}
          style={{ flex: 1 }}
          refreshControl={refresh.control}
          onScroll={watch.emit}
          scrollEventThrottle={32}
          renderItem={({ item }) => (item.__ad ? <LazyAd placement="ledgerRow" /> : renderRow(item, false))}
          ListFooterComponent={
            rows.length ? (
              <Text style={{ color: t.tx3, fontSize: 13, textAlign: 'center', padding: 16 }}>
                タップで編集・左へスライドでコピー・削除・長押しで削除
              </Text>
            ) : null
          }
        />
        </ScrollWatch.Provider>
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
            onPress={() => { const d = dayOpen; setDayOpen(null); router.navigate({ pathname: '/journal', params: { date: d } }); }} />
        </View>
      </BottomSheet>

      <DeleteConfirm target={delTarget} onCancel={() => setDelTarget(null)} onConfirm={doDelete} />
    </View>
  );
}
