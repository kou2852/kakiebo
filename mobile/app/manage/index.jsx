import { Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useData } from '../../src/store/DataProvider';
import { useTheme } from '../../src/theme';
import { Card, Screen, sep } from '../../src/components/ui';

const ITEMS = [
  { href: '/manage/accounts', label: '勘定科目', count: 'accounts' },
  { href: '/manage/wallets', label: '口座', count: 'wallets' },
  { href: '/manage/tags', label: 'タグ', count: 'tags' },
  { href: '/manage/presets', label: 'プリセット', count: 'presets' },
  { href: '/manage/rules', label: '自動仕訳ルール', count: 'rules' },
  { href: '/manage/recurring', label: '定期取引', count: 'recurring' },
  { href: '/manage/budgets', label: '予算', count: 'budgets' },
  { href: '/manage/allocations', label: 'タグ配分', count: 'allocs' },
  { href: '/manage/csv', label: 'CSV 取込・書き出し', count: 'journals' },
  { href: '/manage/reconcile', label: '実査・評価替え', count: 'accounts' },
  { href: '/manage/encryption', label: '暗号化', count: null },
];

export default function Manage() {
  const t = useTheme();
  const router = useRouter();
  const d = useData();

  return (
    <Screen>
      <Card>
        {ITEMS.map((i) => (
          <TouchableOpacity key={i.href} onPress={() => router.push(i.href)}
            style={[{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 13 }, sep(t)]}>
            <Text style={{ color: t.tx, fontSize: 15 }}>{i.label}</Text>
            <Text style={{ color: t.tx3, fontSize: 14 }}>{i.count ? `${d[i.count].length} 件 ` : ''}›</Text>
          </TouchableOpacity>
        ))}
      </Card>
      <Text style={{ color: t.tx3, fontSize: 12, lineHeight: 18 }}>
        クレジットカードの締め日・引落日は、勘定科目（負債）の編集画面で設定します。
      </Text>
    </Screen>
  );
}
