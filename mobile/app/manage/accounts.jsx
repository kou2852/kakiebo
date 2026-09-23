import { useMemo, useState } from 'react';
import { Alert, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useData } from '../../src/store/DataProvider';
import { useTheme } from '../../src/theme';
import { Button, Card, ChipRow, Field, Input, Screen, sep } from '../../src/components/ui';
import { ACCOUNT_TYPES, faBal, today, uid } from '../../src/utils/format';
import { EQUITY_ID } from '../../src/utils/accountCode';
import { upsert } from '../../src/db/intents';
import { lastClosingDate } from '../../src/utils/creditCard';
import { accountBalance, calcBalances } from '../../src/utils/bookkeeping';
import { nextCode } from '../../src/utils/accountCode';
import { useTourTarget } from '../../src/store/TourProvider';
import { isHidden, selectable } from '../../src/utils/hiddenAccounts';

const TYPE_OPTS = Object.entries(ACCOUNT_TYPES).map(([value, label]) => ({ value, label }));

export default function Accounts() {
  const listRef = useTourTarget('account-list');
  const addRef = useTourTarget('account-add');
  const t = useTheme();
  const { accounts, journals, commitAll, del } = useData();
  const [editing, setEditing] = useState(null); // { id?, name, code, type }
  const [showHidden, setShowHidden] = useState(false);

  const balances = useMemo(() => calcBalances(journals, accounts), [journals, accounts]);
  const used = useMemo(() => {
    const s = new Set();
    journals.forEach((j) => j.lines.forEach((l) => s.add(l.accountId)));
    return s;
  }, [journals]);

  const startNew = () => setEditing({
    name: '', code: nextCode(accounts, 'expense'), type: 'expense',
    opening: '', wallet: false, walletName: '',
  });

  // 開始残高を聞くのは資産と負債だけ。収益・費用・純資産に「今いくらある」は無い。
  // 新規のときだけ出す。既存科目の残高合わせは「実査・評価替え」で差額を記帳する
  // （こちらで足すと、開いて保存するたびに二重に積み上がる）。
  const showOpening = (e) => !e.id && (e.type === 'asset' || e.type === 'liability');
  // 口座（支払い手段）を作れるのも資産と負債だけ。wallets.jsx と同じ条件。
  const showWallet = (e) => !e.id && (e.type === 'asset' || e.type === 'liability');

  // 引落口座に選べるのは資産科目（現金・預金など）。非表示は外すが、いま選ばれている口座は残す。
  const settleOpts = selectable(accounts, [editing?.ccFrom])
    .filter((a) => a.type === 'asset').map((a) => ({ value: a.id, label: a.name }));

  // 残高があるのは BS の科目だけ。費用・収益は期間の集計なので「残高が残る」とは言わない。
  const hasBalance = (a) => ['asset', 'liability', 'equity'].includes(a.type)
    && accountBalance(a.id, accounts, balances) !== 0;

  // 非表示にしても止めはしない。残高があれば BS には出続けることだけ伝える（ウェブ版と同じ）。
  const toggleHidden = (v) => {
    setEditing((e) => ({ ...e, hidden: v ? 1 : 0 }));
    const cur = accounts.find((a) => a.id === editing?.id);
    if (v && cur && hasBalance(cur)) {
      Alert.alert('残高が残っています', '非表示にしても、残高があるうちは貸借対照表とダッシュボードに表示されます。');
    }
  };

  const commit = () => {
    const name = editing.name.trim();
    if (!name) return;
    // 区分を変えたのにコードが前の体系のままだと一覧の並びが崩れる。作り直す。
    const code = editing.code || nextCode(accounts, editing.type, editing.id);
    const cc = editing.type === 'liability' && editing.ccClose && editing.ccDay && editing.ccFrom
      ? {
        ccClose: Number(editing.ccClose),
        ccDay: Number(editing.ccDay),
        ccDelay: Number(editing.ccDelay) || 1,
        ccFrom: editing.ccFrom,
      }
      : {};
    // ⚠ save を続けて呼ばない。commit は書き込みの完了を待たないので、
    //   まとめて commitAll で積む（直列化した上で、積み終わりを待てる）。
    const id = editing.id || uid();
    // ⚠ 元の科目の項目を引き継ぐ。以前は id・名前・コード・区分（とカード設定）だけで作り直していたため、
    //   保存のたびに既定科目の印（sys）・メモ（note）・非表示（hidden）が消えていた。
    //   暗号化アカウントは同期で帳簿を丸ごと書き戻すので、ウェブで付けた非表示がそのまま外れる。
    //   カード設定は下の cc で作り直す（外した設定を残さないため、元の値は引き継がない）。
    // eslint-disable-next-line no-unused-vars
    const { ccClose, ccDay, ccDelay, ccFrom, ...prev } = accounts.find((a) => a.id === editing.id) || {};
    const intents = [upsert('accounts', {
      ...prev, id, name, code, type: editing.type, hidden: editing.hidden ? 1 : 0, ...cc,
    })];

    // 開始残高。資産は (借)新科目/(貸)元入金、負債（既にある借金）は (借)元入金/(貸)新科目。
    // ⚠ 相手科目が無いと貸借が合わない。元入金は既定科目なので通常あるが、
    //   消された端末では記帳せず、科目だけ作る（黙って壊れた仕訳を作らない）。
    const bal = Math.round(parseFloat(String(editing.opening || '').replace(/[¥,，]/g, '')) || 0);
    const hasEquity = accounts.some((a) => a.id === EQUITY_ID);
    if (showOpening(editing) && bal > 0 && hasEquity) {
      const lines = editing.type === 'asset'
        ? [{ accountId: id, side: 'dr', amount: bal, taxRate: 0 },
          { accountId: EQUITY_ID, side: 'cr', amount: bal, taxRate: 0 }]
        : [{ accountId: EQUITY_ID, side: 'dr', amount: bal, taxRate: 0 },
          { accountId: id, side: 'cr', amount: bal, taxRate: 0 }];
      // カードの開始残高は「次回の引落額」。直前の締め日に置くと次回の引落サイクルに乗る。
      const date = cc.ccClose ? lastClosingDate(cc.ccClose) : today();
      intents.push(upsert('journals', { id: uid(), date, desc: `開始残高（${name}）`, lines }));
    }

    // ⑨ 科目と一緒に口座も作る。口座画面から科目を作る導線は wallets.jsx 側にある。
    if (showWallet(editing) && editing.wallet) {
      intents.push(upsert('wallets', { id: uid(), name: (editing.walletName || '').trim() || name, accountId: id }));
    }
    commitAll(intents);
    setEditing(null);
  };

  const remove = (a) => {
    if (a.sys) return Alert.alert('削除できません', '既定の勘定科目は削除できません');
    if (used.has(a.id)) return Alert.alert('削除できません', 'この科目を使っている仕訳があります');
    Alert.alert('削除しますか？', a.name, [
      { text: 'キャンセル', style: 'cancel' },
      { text: '削除', style: 'destructive', onPress: () => del('accounts', a.id) },
    ]);
  };

  if (editing) {
    return (
      <Screen>
        <Card title={editing.id ? '勘定科目を編集' : '勘定科目を追加'}>
          <Field label="名称">
            <Input value={editing.name} onChangeText={(v) => setEditing((e) => ({ ...e, name: v }))} placeholder="例: 交際費" />
          </Field>
          <Field label="区分">
            <ChipRow options={TYPE_OPTS} value={editing.type}
              onChange={(v) => setEditing((e) => ({ ...e, type: v, code: nextCode(accounts, v, e.id) }))} />
          </Field>
          <Field label="コード">
            <Input value={editing.code} onChangeText={(v) => setEditing((e) => ({ ...e, code: v }))} keyboardType="number-pad" />
          </Field>
        </Card>

        {/* ⑥⑪ 開始残高。資産は「いま持っている額」、負債は「いま借りている額」。
            相手科目は元入金（自分で入れた元手）。Web 版 AccountModal と同じ仕訳を作る。 */}
        {showOpening(editing) ? (
          <Card title={editing.type === 'asset' ? '開始残高（任意）' : '現在の残高（任意）'}>
            <Text style={{ color: t.tx3, fontSize: 13, lineHeight: 20 }}>
              {editing.type === 'asset'
                ? 'いまこの科目にいくらあるかを入れると、相手を元入金として記帳します。あとから入れても構いません。'
                : 'いまいくら借りているかを入れると、相手を元入金として記帳します。カードは「次回の引落額」を入れてください。'}
            </Text>
            <Field label="金額">
              <Input value={String(editing.opening || '')} keyboardType="number-pad"
                onChangeText={(v) => setEditing((e) => ({ ...e, opening: v }))} placeholder="例: 100000" />
            </Field>
          </Card>
        ) : null}

        {/* ⑨ 科目と一緒に口座（支払い手段）も作る */}
        {showWallet(editing) ? (
          <Card title="口座としても使う（任意）">
            <Text style={{ color: t.tx3, fontSize: 13, lineHeight: 20 }}>
              口座にすると、記帳画面の支払方法として選べるようになります。
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ color: t.tx, fontSize: 15 }}>この科目の口座も作る</Text>
              <Switch value={!!editing.wallet} trackColor={{ true: t.ac }}
                onValueChange={(v) => setEditing((e) => ({ ...e, wallet: v }))} />
            </View>
            {editing.wallet ? (
              <Field label="口座の名称（空なら科目名と同じ）">
                <Input value={editing.walletName || ''} placeholder={editing.name || '例: 生活費口座'}
                  onChangeText={(v) => setEditing((e) => ({ ...e, walletName: v }))} />
              </Field>
            ) : null}
          </Card>
        ) : null}

        {editing.type === 'liability' ? (
          <Card title="クレジットカードの設定（任意）">
            <Text style={{ color: t.tx3, fontSize: 13, lineHeight: 20 }}>
              締め日・引落日・引落口座をすべて入れると、レポートの「カード」に締めから引き落としまでのサイクルが出ます。
            </Text>
            <Field label="締め日（1〜31）">
              <Input value={String(editing.ccClose || '')} keyboardType="number-pad"
                onChangeText={(v) => setEditing((e) => ({ ...e, ccClose: v }))} placeholder="例: 15" />
            </Field>
            <Field label="引落日（1〜31）">
              <Input value={String(editing.ccDay || '')} keyboardType="number-pad"
                onChangeText={(v) => setEditing((e) => ({ ...e, ccDay: v }))} placeholder="例: 10" />
            </Field>
            <Field label="引き落とし月">
              <ChipRow
                options={[{ value: 1, label: '締めの翌月' }, { value: 2, label: '翌々月' }]}
                value={Number(editing.ccDelay) || 1}
                onChange={(v) => setEditing((e) => ({ ...e, ccDelay: v }))}
              />
            </Field>
            <Field label="引落口座">
              <ChipRow options={settleOpts} value={editing.ccFrom}
                onChange={(v) => setEditing((e) => ({ ...e, ccFrom: v }))} />
            </Field>
          </Card>
        ) : null}
        {editing.id ? (
          <Card title="入力の候補">
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <Text style={{ color: t.tx, fontSize: 15, flex: 1 }}>この科目を非表示にする</Text>
              <Switch value={isHidden(editing)} trackColor={{ true: t.ac }} onValueChange={toggleHidden} />
            </View>
            <Text style={{ color: t.tx3, fontSize: 13, lineHeight: 20 }}>
              記帳や設定で科目を選ぶときの候補に出なくなります。過去の仕訳・残高・レポートはそのまま残ります。既定の科目も隠せます。
            </Text>
          </Card>
        ) : null}
        <Button label="保存" onPress={commit} disabled={!editing.name.trim()} />
        <Button label="キャンセル" variant="ghost" onPress={() => setEditing(null)} />
      </Screen>
    );
  }

  const hiddenRows = accounts.filter(isHidden).sort((a, b) => (a.code > b.code ? 1 : -1));
  const row = (a) => (
    <TouchableOpacity key={a.id} onPress={() => setEditing({ ...a })} onLongPress={() => remove(a)}
      style={[{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9 }, sep(t)]}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: isHidden(a) ? t.tx3 : t.tx, fontSize: 15 }}>{a.name}</Text>
        <Text style={{ color: t.tx3, fontSize: 13 }}>{a.code}{a.sys ? ' · 既定' : ''}{isHidden(a) ? ' · 非表示' : ''}</Text>
      </View>
      <Text style={{ color: t.tx2, fontSize: 15 }}>{faBal(accountBalance(a.id, accounts, balances))}</Text>
    </TouchableOpacity>
  );

  return (
    <Screen>
      <View ref={addRef} collapsable={false}>
        <Button label="勘定科目を追加" onPress={startNew} />
      </View>
      {/* 一覧は種別ごとに分かれているので、囲みは最初の塊だけに付ける。
          ツアーは「科目は自由に足せる」と伝えるのが目的で、全部を囲む必要はない。 */}
      {TYPE_OPTS.map(({ value, label }, typeIndex) => {
        const rows = accounts.filter((a) => a.type === value && !isHidden(a)).sort((a, b) => (a.code > b.code ? 1 : -1));
        if (!rows.length) return null;
        return (
          <View key={value} ref={typeIndex === 0 ? listRef : undefined} collapsable={false}>
          <Card title={label}>
            {rows.map(row)}
          </Card>
          </View>
        );
      })}
      {/* 非表示の科目は最後に畳む。件数を出し、開くとコード順に一覧できる（ウェブ版と同じ）。 */}
      {hiddenRows.length ? (
        <Card>
          <TouchableOpacity onPress={() => setShowHidden((v) => !v)} accessibilityRole="button"
            style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
            <Text style={{ color: t.tx2, fontSize: 15, fontWeight: '600' }}>非表示の科目（{hiddenRows.length}件）</Text>
            <Text style={{ color: t.tx3, fontSize: 15 }}>{showHidden ? '閉じる' : '開く'}</Text>
          </TouchableOpacity>
          {showHidden ? hiddenRows.map(row) : null}
        </Card>
      ) : null}
      <Text style={{ color: t.tx3, fontSize: 13, textAlign: 'center' }}>タップで編集（非表示の切り替えも編集から）・長押しで削除</Text>
    </Screen>
  );
}
