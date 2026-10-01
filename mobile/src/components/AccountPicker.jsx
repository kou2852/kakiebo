// 勘定科目の選択。
//
// 横スクロールのチップ列だと、科目が既定26件・増やせば50件を超えたときに
// 目的のものへ辿り着けない。行として選ばせ、検索と区分見出しを付ける。
//
// 資産・負債の科目には残高も出す。支払方法を選ぶとき「その口座にいくら残っているか」は
// 選択の判断そのものなので、別画面で確認させない。
import { useMemo, useState } from 'react';
import { FlatList, Modal, Platform, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useData } from '../store/DataProvider';
import { useTheme } from '../theme';
import { Input, sep } from './ui';
import { ACCOUNT_TYPES, faBal } from '../utils/format';
import { accountBalance, calcBalances } from '../utils/bookkeeping';

const TYPE_ORDER = ['expense', 'asset', 'liability', 'income', 'equity'];

// multiple: 複数を選ぶ（value は id の配列）。押しても閉じず、押すたびに選択を切り替える。
export default function AccountPicker({ label, accounts, value, onChange, placeholder = '選択してください', multiple = false }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);

  const picked = multiple ? accounts.filter((a) => (value || []).includes(a.id)) : [];
  const selected = multiple
    ? (picked.length ? { name: picked.length <= 2 ? picked.map((a) => a.name).join('・') : `${picked[0].name} ほか${picked.length - 1}件` } : null)
    : accounts.find((a) => a.id === value);

  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 11, gap: 10 }}
      >
        <Text style={{ color: t.tx2, fontSize: 15, flex: 1 }}>{label}</Text>
        <Text style={{ color: selected ? t.tx : t.tx3, fontSize: 15, fontWeight: selected ? '600' : '400' }}
          numberOfLines={1}>
          {selected ? selected.name : placeholder}
        </Text>
        <Text style={{ color: t.tx3, fontSize: 16 }}>›</Text>
      </TouchableOpacity>

      <PickerSheet
        visible={open} onClose={() => setOpen(false)}
        title={label} accounts={accounts} value={value} multiple={multiple}
        onPick={(id) => {
          if (!multiple) { onChange(id); setOpen(false); return; }
          const cur = value || [];
          onChange(cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
        }}
      />
    </>
  );
}

function PickerSheet({ visible, onClose, title, accounts, value, onPick, multiple }) {
  const t = useTheme();
  const { journals, accounts: allAccounts } = useData();
  const [q, setQ] = useState('');
  // Android には pageSheet が無く全画面で開き、見出しがステータスバーの下に潜って「閉じる」が押せなかった。
  // iOS は pageSheet なので上の余白は要らない。
  const insets = useSafeAreaInsets();
  const top = Platform.OS === 'android' ? insets.top : 0;

  // 残高は開いている間だけ計算する。閉じているときに全仕訳を舐める必要はない。
  const balances = useMemo(
    () => (visible ? calcBalances(journals, allAccounts) : null),
    [visible, journals, allAccounts]
  );

  // 検索は名称とコードの両方に当てる。コードで覚えている人もいるため。
  const rows = useMemo(() => {
    const kw = q.trim();
    const hit = kw
      ? accounts.filter((a) => a.name.includes(kw) || (a.code || '').includes(kw))
      : accounts;

    // 区分ごとにまとめ、区分内はコード順。見出しを挟んで1次元の配列にする。
    const out = [];
    TYPE_ORDER.forEach((type) => {
      const group = hit.filter((a) => a.type === type)
        .sort((a, b) => (a.code || '').localeCompare(b.code || ''));
      if (!group.length) return;
      out.push({ header: ACCOUNT_TYPES[type], key: `h-${type}` });
      group.forEach((a) => out.push({ account: a, key: a.id }));
    });
    return out;
  }, [accounts, q]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: t.bg0 }}>
        <View style={[{ flexDirection: 'row', alignItems: 'center', padding: 14, paddingTop: 14 + top, backgroundColor: t.bg1 }, sep(t)]}>
          <Text style={{ color: t.tx, fontSize: 17, fontWeight: '700', flex: 1 }}>{title}</Text>
          <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
            <Text style={{ color: t.ac, fontSize: 15, fontWeight: '600' }}>{multiple ? '完了' : '閉じる'}</Text>
          </TouchableOpacity>
        </View>

        <View style={{ padding: 12, backgroundColor: t.bg1 }}>
          <Input value={q} onChangeText={setQ} placeholder="科目名・コードで絞り込む"
            autoCorrect={false} autoCapitalize="none" clearButtonMode="while-editing" />
        </View>

        <FlatList
          data={rows}
          keyExtractor={(r) => r.key}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <Text style={{ color: t.tx3, fontSize: 15, textAlign: 'center', padding: 24 }}>
              一致する科目がありません
            </Text>
          }
          renderItem={({ item }) => {
            if (item.header) {
              return (
                <Text style={{
                  color: t.tx3, fontSize: 13, fontWeight: '700', letterSpacing: 1,
                  paddingHorizontal: 15, paddingTop: 16, paddingBottom: 6,
                }}>{item.header}</Text>
              );
            }
            const a = item.account;
            const on = multiple ? (value || []).includes(a.id) : a.id === value;
            // 残高が判断材料になるのは資産・負債だけ。費目に残高を出しても意味がない。
            const showBal = a.type === 'asset' || a.type === 'liability';
            return (
              <TouchableOpacity
                onPress={() => onPick(a.id)}
                style={[{
                  flexDirection: 'row', alignItems: 'center', gap: 10,
                  paddingVertical: 12, paddingHorizontal: 15,
                  backgroundColor: on ? t.acb : t.bg1,
                }, sep(t)]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: on ? t.ac : t.tx, fontSize: 16, fontWeight: on ? '700' : '400' }}>
                    {a.name}
                  </Text>
                  <Text style={{ color: t.tx3, fontSize: 13, marginTop: 1 }}>{a.code}</Text>
                </View>
                {showBal && balances ? (
                  <Text style={{ color: t.tx2, fontSize: 14 }}>
                    {faBal(accountBalance(a.id, allAccounts, balances))}
                  </Text>
                ) : null}
                {on ? <Text style={{ color: t.ac, fontSize: 16, fontWeight: '800' }}>✓</Text> : null}
              </TouchableOpacity>
            );
          }}
        />
      </View>
    </Modal>
  );
}
