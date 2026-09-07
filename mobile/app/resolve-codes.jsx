// 勘定科目コードの衝突を1件ずつ片付ける。
//
// サーバーと端末の帳簿を合わせると、id が違って中身が別の科目なのに
// 勘定科目コードだけ同じ、という組み合わせが残ることがある。ゲストで作った
// 「1004 TestAsset」と、サーバーにある「1004 サブ口座」のような形。
// コードは一覧の並び順と体系（資産1000番台…）の根拠なので、重複したままだと
// どちらがどれか読めなくなる。
//
// ⚠ 自動で片方を消したり振り直したりしない。どちらが本物かは利用者にしか
//   分からない。ここは「見せて、選ばせる」ためだけの画面。
//
// ⚠ 既定の選択肢は「コードをずらす」。削除は最後の手段として置くが、
//   仕訳で使われている科目は消せない（消すと仕訳の参照先が消える）。
import { useMemo, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useData } from '../src/store/DataProvider';
import { useTheme } from '../src/theme';
import { Button, Card, Field, Input, Screen } from '../src/components/ui';
import { codeCollisions } from '../src/store/merge';
import { nextCode } from '../src/utils/accountCode';
import { ACCOUNT_TYPES } from '../src/utils/format';

export default function ResolveCodes() {
  const t = useTheme();
  const router = useRouter();
  const d = useData();
  const { accounts, journals, save, del } = d;

  // 編集中の名前。id → 文字列。触っていないものは持たない。
  const [names, setNames] = useState({});

  // 仕訳で使われている科目は消せない。消すと参照先の無い仕訳が残る。
  const used = useMemo(() => {
    const s = new Set();
    journals.forEach((j) => j.lines.forEach((l) => s.add(l.accountId)));
    return s;
  }, [journals]);

  // いまの帳簿そのものを見て衝突を出す。片付けるたびに減っていく。
  // ⚠ この画面は合わせた後にも設定からも開くので、どちらの由来かは判定できない。
  //   side は使わない（「この端末で作成」と嘘を出していた）。
  const collisions = useMemo(
    () => codeCollisions({ accounts }, { accounts: [] }, { accounts }),
    [accounts]
  );

  const shift = (a) => {
    const code = nextCode(accounts, a.type, a.id);
    if (!code) return Alert.alert('空きが足りません', `${ACCOUNT_TYPES[a.type]}の番号帯に空きがありません。先に使っていない科目を整理してください。`);
    save('accounts', { ...a, code });
  };

  const rename = (a) => {
    const name = (names[a.id] ?? a.name).trim();
    if (!name || name === a.name) return;
    save('accounts', { ...a, name });
    setNames((m) => { const n = { ...m }; delete n[a.id]; return n; });
  };

  const remove = (a) => {
    if (a.sys) return Alert.alert('削除できません', '既定の勘定科目は削除できません');
    if (used.has(a.id)) {
      return Alert.alert('削除できません',
        'この科目を使っている仕訳があります。消すと仕訳の参照先が無くなるため、'
        + '先に仕訳を付け替えるか、コードをずらしてください。');
    }
    Alert.alert('削除しますか？', `${a.code} ${a.name}\nこの操作は取り消せません。`, [
      { text: 'キャンセル', style: 'cancel' },
      { text: '削除', style: 'destructive', onPress: () => del('accounts', a.id) },
    ]);
  };

  if (!collisions.length) {
    return (
      <Screen>
        <Card title="重複はありません">
          <Text style={{ color: t.tx2, fontSize: 15, lineHeight: 22 }}>
            勘定科目コードの重複はすべて解消されています。
          </Text>
          <Button label="閉じる" onPress={() => router.back()} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <Card title={`コードが重なっています（${collisions.length} 件）`}>
        <Text style={{ color: t.tx2, fontSize: 15, lineHeight: 22 }}>
          帳簿を合わせた結果、別の科目に同じコードが付きました。
          どちらも消えていません。コードをずらすか、名前を直して区別してください。
        </Text>
      </Card>

      {collisions.map((c) => (
        <Card key={c.code} title={`コード ${c.code}`}>
          {c.items.map((a, i) => (
            <View key={a.id} style={{
              gap: 10,
              paddingTop: i ? 14 : 0,
              borderTopWidth: i ? 1 : 0,
              borderTopColor: t.bd,
            }}>
              <Text style={{ color: t.tx3, fontSize: 13 }}>
                {ACCOUNT_TYPES[a.type]}
                {used.has(a.id) ? ' · 仕訳で使用中' : ''}
                {a.sys ? ' · 既定' : ''}
              </Text>

              <Field label="名称">
                <Input
                  value={names[a.id] ?? a.name}
                  onChangeText={(v) => setNames((m) => ({ ...m, [a.id]: v }))}
                />
              </Field>

              {(names[a.id] ?? a.name).trim() !== a.name ? (
                <Button label="名称を保存" onPress={() => rename(a)} />
              ) : null}

              <Button label={`コードをずらす（${nextCode(accounts, a.type, a.id) || '空きなし'}）`}
                variant="ghost" onPress={() => shift(a)} />

              {/* 削除は最後の手段。仕訳で使っていれば押しても止まる。 */}
              <Button label="この科目を削除" variant="danger" onPress={() => remove(a)} />
            </View>
          ))}
        </Card>
      ))}

      <Button label="あとで直す" variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
