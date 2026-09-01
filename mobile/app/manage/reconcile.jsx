// 実査（残高照合）と評価替え。
//
// 銀行APIを使わない方針を取っている以上、帳簿は手入力の漏れで必ずずれる。
// ずれた帳簿の BS も純資産推移も嘘になるので、実残高との突合を最後の砦として持つ。
// これは実務の簿記でいう実査そのもので、差額を雑損益に落として帳簿を現実に合わせる。
//
// 評価替えは同じ操作の別用途。投資資産の帳簿価額を時価に合わせ、差額を評価損益に落とす。
// 相手科目が違うだけなので画面を共有している。
import { useMemo, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useData } from '../../src/store/DataProvider';
import { useTheme } from '../../src/theme';
import { Button, Card, ChipRow, Empty, Input, Screen } from '../../src/components/ui';
import { fa, faBal, fas, today, uid } from '../../src/utils/format';
import { accountBalance, calcBalances, isInvestmentAsset } from '../../src/utils/bookkeeping';

const MODES = [
  { value: 'cash', label: '実査（残高照合）' },
  { value: 'valuation', label: '評価替え' },
];

const PREFIX = { cash: '残高調整', valuation: '評価替え' };

export default function Reconcile() {
  const t = useTheme();
  const { accounts, journals, save } = useData();

  const [mode, setMode] = useState('cash');
  const [actual, setActual] = useState({}); // accountId -> 入力中の実残高

  const balances = useMemo(() => calcBalances(journals, accounts), [journals, accounts]);

  // 実査の対象は現金・預金を含む資産と負債。評価替えは投資性の資産だけ。
  const targets = useMemo(() => accounts.filter((a) => (
    mode === 'valuation' ? isInvestmentAsset(a) : (a.type === 'asset' || a.type === 'liability')
  )), [accounts, mode]);

  // 相手科目。実査は雑費／雑収入、評価替えは評価損益。名前で引き、無ければ区分で代替する。
  const pick = (re, type) => accounts.find((a) => re.test(a.name)) || accounts.find((a) => a.type === type);
  const counter = {
    loss: mode === 'valuation' ? pick(/評価損益/, 'income') : pick(/雑費|雑損/, 'expense'),
    gain: mode === 'valuation' ? pick(/評価損益/, 'income') : pick(/雑収入|雑益/, 'income'),
  };

  // 前回いつ合わせたかは、生成した調整仕訳そのものから引く。別途保存しない。
  const lastAdjusted = useMemo(() => {
    const out = {};
    journals.forEach((j) => {
      const m = (j.desc || '').match(new RegExp(`^(${PREFIX.cash}|${PREFIX.valuation}): (.+)$`));
      if (!m) return;
      const a = accounts.find((x) => x.name === m[2]);
      if (a && (!out[a.id] || j.date > out[a.id])) out[a.id] = j.date;
    });
    return out;
  }, [journals, accounts]);

  const commit = (account, book, diff) => {
    // 帳簿より実際が多い＝資産が増えている → 借方:その科目 / 貸方:雑収入(評価損益)
    // 帳簿より実際が少ない → 借方:雑費(評価損益) / 貸方:その科目
    const other = diff > 0 ? counter.gain : counter.loss;
    if (!other) {
      Alert.alert('相手科目がありません', mode === 'valuation' ? '「評価損益」の科目を作ってください' : '「雑費」「雑収入」の科目を作ってください');
      return;
    }
    const amount = Math.abs(diff);
    const lines = diff > 0
      ? [{ accountId: account.id, side: 'dr', amount, taxRate: 0 }, { accountId: other.id, side: 'cr', amount, taxRate: 0 }]
      : [{ accountId: other.id, side: 'dr', amount, taxRate: 0 }, { accountId: account.id, side: 'cr', amount, taxRate: 0 }];

    Alert.alert(
      'この差額を記帳しますか？',
      `${account.name}\n帳簿 ${faBal(book)} → 実際 ${faBal(book + diff)}\n差額 ${fas(diff)} を「${other.name}」で調整します`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '記帳',
          onPress: () => {
            save('journals', { id: uid(), date: today(), desc: `${PREFIX[mode]}: ${account.name}`, lines });
            setActual((s) => ({ ...s, [account.id]: '' }));
          },
        },
      ]
    );
  };

  if (!targets.length) {
    return <Screen><Empty text={mode === 'valuation' ? '投資性の資産科目がありません' : '対象の科目がありません'} /></Screen>;
  }

  return (
    <Screen>
      <ChipRow options={MODES} value={mode} onChange={setMode} />
      <Text style={{ color: t.tx3, fontSize: 12, lineHeight: 18 }}>
        {mode === 'cash'
          ? '通帳や財布の実際の残高を入れると、帳簿との差額を雑費／雑収入で調整します。手入力の漏れはここで吸収します。'
          : '証券口座などの現在の時価を入れると、帳簿価額との差額を評価損益で調整します。'}
      </Text>

      {targets.map((a) => {
        const book = accountBalance(a.id, accounts, balances);
        const raw = actual[a.id] ?? '';
        const hasInput = String(raw).trim() !== '';
        const real = Number(String(raw).replace(/[^0-9-]/g, '')) || 0;
        const diff = hasInput ? real - book : 0;

        return (
          <Card key={a.id} title={a.name}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: t.tx2, fontSize: 13 }}>{mode === 'valuation' ? '帳簿価額' : '帳簿残高'}</Text>
              <Text style={{ color: t.tx, fontSize: 15, fontWeight: '700' }}>{faBal(book)}</Text>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ color: t.tx2, fontSize: 13, flex: 1 }}>{mode === 'valuation' ? '現在の時価' : '実際の残高'}</Text>
              <Input
                value={String(raw)}
                onChangeText={(v) => setActual((s) => ({ ...s, [a.id]: v }))}
                keyboardType="numbers-and-punctuation" placeholder="0"
                style={{ width: 140, textAlign: 'right', paddingVertical: 7 }}
              />
            </View>

            {hasInput ? (
              diff === 0 ? (
                <Text style={{ color: t.grn, fontSize: 13 }}>一致しています。記帳は不要です。</Text>
              ) : (
                <>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ color: t.tx2, fontSize: 13 }}>差額</Text>
                    <Text style={{ color: diff > 0 ? t.grn : t.red, fontSize: 15, fontWeight: '700' }}>{fas(diff)}</Text>
                  </View>
                  <Button label={`${fa(diff)} を調整する`} onPress={() => commit(a, book, diff)} />
                </>
              )
            ) : null}

            <Text style={{ color: t.tx3, fontSize: 12 }}>
              {lastAdjusted[a.id] ? `前回の調整 ${lastAdjusted[a.id]}` : '調整の記録はありません'}
            </Text>
          </Card>
        );
      })}
    </Screen>
  );
}
