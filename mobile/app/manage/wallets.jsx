import { useState } from 'react';
import { Alert, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useData } from '../../src/store/DataProvider';
import { useTheme } from '../../src/theme';
import { Button, Card, ChipRow, Empty, Field, Input, Screen, sep } from '../../src/components/ui';
import { today, uid } from '../../src/utils/format';
import { EQUITY_ID, nextCode } from '../../src/utils/accountCode';
import { upsert } from '../../src/db/intents';
import { isHidden, selectable } from '../../src/utils/hiddenAccounts';
import { isCreditCard, lastClosingDate } from '../../src/utils/creditCard';
import { useToast } from '../../src/store/ToastProvider';

export default function Wallets() {
  const t = useTheme();
  const toast = useToast();
  const router = useRouter();
  const { wallets, accounts, save, del, commitAll } = useData();
  const [editing, setEditing] = useState(null);

  // カードは口座（支払い手段）ではない。負債の科目に紐づく口座はカードとして分けて出す。
  // 締め・引落の設定を持つカードで、口座にしていないものもカードとして出す。
  const accOf = (id) => accounts.find((a) => a.id === id);
  const isCardWallet = (w) => accOf(w.accountId)?.type === 'liability';
  const bankWallets = wallets.filter((w) => !isCardWallet(w));
  const cardWallets = wallets.filter(isCardWallet);
  const looseCards = accounts.filter((a) => isCreditCard(a) && !isHidden(a) && !wallets.some((w) => w.accountId === a.id));
  const nameOf = (id) => accOf(id)?.name || '(口座なし)';
  const cardLine = (c) => (c && isCreditCard(c)
    ? `${c.ccClose}日締 → ${(c.ccDelay || 1) > 1 ? '翌々月' : '翌月'}${c.ccDay}日に${nameOf(c.ccFrom)}から引落`
    : '締め・引落の設定なし');

  // 口座は「資産または負債の科目」に紐づく支払い手段の別名。
  const opts = selectable(accounts, [editing?.accountId])
    .filter((a) => a.type === 'asset' || a.type === 'liability')
    .map((a) => ({ value: a.id, label: a.name }));
  // カードの引落口座に選べるのは資産科目。
  const bankOpts = selectable(accounts, [editing?.ccFrom])
    .filter((a) => a.type === 'asset').map((a) => ({ value: a.id, label: a.name }));

  const commit = () => {
    const name = editing.name.trim();
    if (!name || !editing.accountId) return;
    // 元の口座の項目を引き継ぐ。ウェブで設定したデフォルトタグ（名前・色）を保存で消さないため。
    save('wallets', { ...wallets.find((w) => w.id === editing.id), id: editing.id || uid(), name, accountId: editing.accountId });
    setEditing(null);
    toast('保存しました');
  };

  // カードの新規作成。負債の科目＋口座＋（任意で）引落設定と次回の引落額を一度に作る。
  // 勘定科目の画面で「負債」を選んで作るのと同じ結果。
  const commitCard = () => {
    const name = editing.name.trim();
    if (!name) return;
    const id = uid();
    const cc = editing.ccClose && editing.ccDay && editing.ccFrom
      ? { ccClose: Number(editing.ccClose), ccDay: Number(editing.ccDay), ccDelay: Number(editing.ccDelay) || 1, ccFrom: editing.ccFrom }
      : {};
    const intents = [
      upsert('accounts', { id, name, code: nextCode(accounts, 'liability'), type: 'liability', hidden: 0, ...cc }),
      upsert('wallets', { id: uid(), name, accountId: id }),
    ];
    // 次回の引落額。直前の締め日に置くと、次回の引落サイクルに乗る。
    const bal = Math.round(parseFloat(String(editing.opening || '').replace(/[¥,，]/g, '')) || 0);
    if (bal > 0 && accounts.some((a) => a.id === EQUITY_ID)) {
      intents.push(upsert('journals', {
        id: uid(), date: cc.ccClose ? lastClosingDate(cc.ccClose) : today(), desc: `開始残高（${name}）`,
        lines: [
          { accountId: EQUITY_ID, side: 'dr', amount: bal, taxRate: 0 },
          { accountId: id, side: 'cr', amount: bal, taxRate: 0 },
        ],
      }));
    }
    commitAll(intents);
    setEditing(null);
    toast('保存しました');
  };

  const remove = (w) => Alert.alert('削除しますか？', w.name, [
    { text: 'キャンセル', style: 'cancel' },
    { text: '削除', style: 'destructive', onPress: () => del('wallets', w.id) },
  ]);

  if (editing?.newCard) {
    const set = (k) => (v) => setEditing((e) => ({ ...e, [k]: v }));
    return (
      <Screen>
        <Card title="カードを追加">
          <Field label="名称">
            <Input value={editing.name} onChangeText={set('name')} placeholder="例: 〇〇カード" />
          </Field>
          <Field label="次回の引落額（任意）">
            <Input value={String(editing.opening || '')} keyboardType="number-pad" onChangeText={set('opening')} placeholder="例: 50000" />
          </Field>
        </Card>
        <Card title="引き落としの設定（任意）">
          <Text style={{ color: t.tx3, fontSize: 13, lineHeight: 20 }}>
            3つとも入れると、レポートの「カード」に締めから引き落としまでのサイクルが出ます。
          </Text>
          <Field label="締め日（1〜31）">
            <Input value={String(editing.ccClose || '')} keyboardType="number-pad" onChangeText={set('ccClose')} placeholder="例: 15" />
          </Field>
          <Field label="引落日（1〜31）">
            <Input value={String(editing.ccDay || '')} keyboardType="number-pad" onChangeText={set('ccDay')} placeholder="例: 10" />
          </Field>
          <Field label="引き落とし月">
            <ChipRow options={[{ value: 1, label: '締めの翌月' }, { value: 2, label: '翌々月' }]}
              value={Number(editing.ccDelay) || 1} onChange={set('ccDelay')} />
          </Field>
          <Field label="引落口座">
            <ChipRow options={bankOpts} value={editing.ccFrom} onChange={set('ccFrom')} />
          </Field>
        </Card>
        <Button label="保存" onPress={commitCard} disabled={!editing.name.trim()} />
        <Button label="キャンセル" variant="ghost" onPress={() => setEditing(null)} />
      </Screen>
    );
  }

  if (editing) {
    return (
      <Screen>
        <Card title={editing.id ? '口座を編集' : '口座を追加'}>
          <Field label="名称">
            <Input value={editing.name} onChangeText={(v) => setEditing((e) => ({ ...e, name: v }))} placeholder="例: 日常口座" />
          </Field>
          <Field label="紐づける科目">
            <ChipRow options={opts} value={editing.accountId} onChange={(v) => setEditing((e) => ({ ...e, accountId: v }))} />
          </Field>
        </Card>
        <Button label="保存" onPress={commit} disabled={!editing.name.trim() || !editing.accountId} />
        <Button label="キャンセル" variant="ghost" onPress={() => setEditing(null)} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Button label="口座を追加" onPress={() => setEditing({ name: '', accountId: opts.find((o) => accOf(o.value)?.type === 'asset')?.value || '' })} />
      <Card>
        {bankWallets.length === 0 ? <Empty text="口座がありません" /> : bankWallets.map((w) => (
          <TouchableOpacity key={w.id} onPress={() => setEditing({ ...w })} onLongPress={() => remove(w)}
            style={[{ paddingVertical: 11 }, sep(t)]}>
            <Text style={{ color: t.tx, fontSize: 16 }}>{w.name}</Text>
            <Text style={{ color: t.tx3, fontSize: 13 }}>{accOf(w.accountId)?.name || '(科目なし)'}</Text>
          </TouchableOpacity>
        ))}
      </Card>
      <Text style={{ color: t.tx3, fontSize: 13, textAlign: 'center' }}>タップで編集・長押しで削除</Text>

      <Button label="カードを追加" onPress={() => setEditing({ newCard: true, name: '', opening: '', ccDelay: 1 })} />
      <Card title="カード">
        {cardWallets.length + looseCards.length === 0 ? <Empty text="カードがありません" /> : null}
        {cardWallets.map((w) => (
          <TouchableOpacity key={w.id} onPress={() => setEditing({ ...w })} onLongPress={() => remove(w)}
            style={[{ paddingVertical: 11 }, sep(t)]}>
            <Text style={{ color: t.tx, fontSize: 16 }}>{w.name}</Text>
            <Text style={{ color: t.tx3, fontSize: 13 }}>{cardLine(accOf(w.accountId))}</Text>
          </TouchableOpacity>
        ))}
        {looseCards.map((c) => (
          <TouchableOpacity key={c.id} onPress={() => router.push('/credit')} style={[{ paddingVertical: 11 }, sep(t)]}>
            <Text style={{ color: t.tx, fontSize: 16 }}>{c.name}</Text>
            <Text style={{ color: t.tx3, fontSize: 13 }}>{cardLine(c)}</Text>
          </TouchableOpacity>
        ))}
      </Card>
    </Screen>
  );
}
