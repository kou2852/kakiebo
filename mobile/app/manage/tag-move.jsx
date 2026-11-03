// タグ付け替え。口座の配分を、あるタグから別のタグへ指定の金額だけ動かす。
// 配分の目安を動かすだけで、残高も仕訳も動かさない（仕訳は増えない）。
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { useData } from '../../src/store/DataProvider';
import { useTheme } from '../../src/theme';
import { Button, Card, ChipRow, Empty, Field, Input, Screen } from '../../src/components/ui';
import { faBal } from '../../src/utils/format';
import { computeTagBalances, tagAllocation } from '../../src/utils/bookkeeping';
import { moveAlloc, tagLeft } from '../../src/utils/allocMove';
import { useToast } from '../../src/store/ToastProvider';

// 全角数字も受ける。数字以外は落とす
const toAmount = (v) => Number(String(v ?? '').normalize('NFKC').replace(/[^0-9]/g, '')) || 0;

export default function TagMove() {
  const t = useTheme();
  const toast = useToast();
  const { accounts, journals, tags, allocs, wallets, setAll } = useData();
  const [accountId, setAccountId] = useState('');
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [amount, setAmount] = useState('');

  const rows = useMemo(() => tagAllocation(journals, accounts, tags, allocs, wallets), [journals, accounts, tags, allocs, wallets]);
  const flows = useMemo(() => computeTagBalances(journals, accounts).byAccount, [journals, accounts]);

  if (tags.length < 2) return <Screen><Empty text="タグが2つ以上必要です。先にタグを作ってください" /></Screen>;
  if (!rows.length) return <Screen><Empty text="配分できる口座がありません" /></Screen>;

  const accId = rows.some((r) => r.account.id === accountId) ? accountId : rows[0].account.id;
  const flow = flows[accId] || {};
  const left = (tagId) => tagLeft(allocs, flow, accId, tagId);
  // 配分が無いタグからも付け替えられる（マイナス＝他のタグから内部的に借りている状態）
  const from = tags.some((g) => g.id === fromId) ? fromId : '';
  const toTags = tags.filter((g) => g.id !== from);
  const to = toTags.some((g) => g.id === toId) ? toId : '';

  const ready = !!(from && to);
  const n = toAmount(amount);
  const next = from && to && n > 0 ? moveAlloc(allocs, { accountId: accId, fromId: from, toId: to, amount: n }) : null;
  const tagName = (id) => tags.find((g) => g.id === id)?.name || '';

  const move = () => {
    if (!next) return;
    setAll('allocs', next);
    toast(`${tagName(from)} から ${tagName(to)} へ ${faBal(n)} 付け替えました`);
    setAmount('');
  };

  return (
    <Screen>
      <Card title="口座">
        <ChipRow
          options={rows.map((r) => ({ value: r.account.id, label: r.account.name }))}
          value={accId}
          onChange={(v) => { setAccountId(v); setFromId(''); setToId(''); setAmount(''); }}
        />
        <Text style={{ color: t.tx3, fontSize: 13 }}>残高 {faBal(rows.find((r) => r.account.id === accId).bal)}</Text>
      </Card>

      <Card title="付け替え元のタグ">
        <ChipRow
          options={tags.map((g) => ({ value: g.id, label: g.name }))}
          value={from}
          onChange={(v) => { setFromId(v); setToId(''); setAmount(''); }}
        />
        <Text style={{ color: t.tx3, fontSize: 13 }}>
          {from ? `${tagName(from)} の残り ${faBal(left(from))}。残りを超えてもかまいません（超えた分はマイナス＝他のタグからの借り）` : '選ぶと、下の表示が変わります。'}
        </Text>
      </Card>

      <Card title="付け替え先のタグ">
        {from ? (
          <>
            <ChipRow options={toTags.map((g) => ({ value: g.id, label: g.name }))} value={to} onChange={setToId} />
            {to ? <Text style={{ color: t.tx3, fontSize: 13 }}>{tagName(to)} の残り {faBal(left(to))}</Text> : null}
          </>
        ) : (
          <Text style={{ color: t.tx3, fontSize: 14 }}>上で付け替え元のタグを選ぶと、ここに付け替え先の候補が表示されます。</Text>
        )}
      </Card>

      <Card title="付け替える金額">
        <Field label="金額">
          <Input value={amount} onChangeText={setAmount} keyboardType="number-pad" placeholder="0"
            editable={ready} style={{ textAlign: 'right', opacity: ready ? 1 : 0.5 }} />
        </Field>
        <Button label="残り全額" variant="ghost" disabled={!ready} onPress={() => setAmount(String(Math.max(0, left(from))))} />
        {!ready ? (
          <Text style={{ color: t.tx3, fontSize: 14 }}>付け替え元と付け替え先のタグを選ぶと、金額を入力でき、付け替え後の配分が表示されます。</Text>
        ) : null}
        {next ? (
          <View style={{ gap: 4 }}>
            <Text style={{ color: t.tx2, fontSize: 14 }}>{tagName(from)}　{faBal(left(from))} → {faBal(left(from) - n)}</Text>
            <Text style={{ color: t.tx2, fontSize: 14 }}>{tagName(to)}　{faBal(left(to))} → {faBal(left(to) + n)}</Text>
          </View>
        ) : null}
      </Card>

      <Button label="付け替える" onPress={move} disabled={!next} />
      <Text style={{ color: t.tx3, fontSize: 13, lineHeight: 20 }}>
        配分の目安を動かすだけです。残高は変わらず、仕訳も増えません。
      </Text>
    </Screen>
  );
}
