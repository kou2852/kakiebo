import { useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Alert, Text, TouchableOpacity, View } from 'react-native';
import { useData } from '../../src/store/DataProvider';
import { useTheme } from '../../src/theme';
import { Button, Card, ChipRow, Empty, Field, Input, Screen, sep } from '../../src/components/ui';
import ReorderList, { ReorderToggle } from '../../src/components/ReorderList';
import { setListOrder } from '../../src/store/listOrder';
import { today, uid } from '../../src/utils/format';
import { EQUITY_ID, nextCode, nextInvestmentCode } from '../../src/utils/accountCode';
import { upsert } from '../../src/db/intents';
import { isHidden, selectable } from '../../src/utils/hiddenAccounts';
import { isCreditCard, lastClosingDate } from '../../src/utils/creditCard';
import { useToast } from '../../src/store/ToastProvider';
import { adjustJournal, canHaveOpening, hasOpening, openingJournal, redatedCardOpening } from '../../src/utils/openingBalance';
import { accountBalance, calcBalances, isInvestmentAsset } from '../../src/utils/bookkeeping';
import { faBal } from '../../src/utils/format';
import LaterOpening from '../../src/components/LaterOpening';
import { useTour, useTourTarget } from '../../src/store/TourProvider';

// 口座を足すとき、科目を新しく作る印（科目の id とは重ならない）
const NEW_ACCOUNT = '__new';

export default function Wallets() {
  const t = useTheme();
  const walletListRef = useTourTarget('wallet-list');
  const cardListRef = useTourTarget('card-list');
  const walletSaveRef = useTourTarget('wallet-save');
  const cardSaveRef = useTourTarget('card-save');
  const tour = useTour();
  const toast = useToast();
  const { wallets, accounts, journals, del, commitAll } = useData();
  const [sorting, setSorting] = useState(false);
  const [editing, setEditing] = useState(null);
  // カード画面の「カードの追加」から来たときは、カードの追加の入力を最初から開く（?newCard=1）
  const params = useLocalSearchParams();
  useEffect(() => {
    if (params.newCard) setEditing({ newCard: true, name: '', opening: '', ccDelay: 1 });
  }, [params.newCard]);

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

  // 口座を足すときは、既定でその口座専用の資産の科目も一緒に作る（2026-10-18 指示。「カードを追加」と同じ作り）。
  // 以前は既存の科目を選んで紐づけるだけで、2つ目の銀行も「普通預金」に紐づき、2つの残高が1つにまとまっていた。
  // 既存の科目に紐づけたいときは、科目の欄で選び直せる。
  const isNew = editing?.accountId === NEW_ACCOUNT;
  const walletOpts = editing && !editing.id ? [{ value: NEW_ACCOUNT, label: '新しく作る' }, ...opts] : opts;

  // 紐づけた科目に開始残高がまだ無ければ、ここでも残高を入れられる（勘定科目の画面と同じ欄）。新しく作る科目も入れられる
  const linked = isNew ? { type: 'asset' } : accOf(editing?.accountId);
  const laterOpening = isNew || (!!linked && canHaveOpening(linked) && !hasOpening(linked.id, journals));
  // 残高を入れ済みの資産の口座は、いつでも「いまの残高」で直せる（2026-10-18 決定）。差額を今日の日付で記帳して合わせる
  const canAdjust = !!editing?.id && !editing?.card && linked?.type === 'asset' && !laterOpening;
  const bookNow = canAdjust
    ? accountBalance(linked.id, accounts, calcBalances(journals.filter((j) => j.date <= today()), accounts))
    : 0;

  const commit = () => {
    const name = editing.name.trim();
    if (!name || !editing.accountId) return;
    // 元の口座の項目を引き継ぐ。ウェブで設定したデフォルトタグ（名前・色）を保存で消さないため。
    // ⚠ 口座と仕訳を save で続けて積まない（commit は書き込みの完了を待たない）。commitAll でまとめる。
    // 新しく作るときは、口座と同じ名前の資産の科目を作って紐づける
    // 投資を選んだ口座は、投資の資産科目（コード 1200 番台）にする。ホームの「投資資産」に数えられる（2026-10-19）
    const code = editing.kind === 'invest' ? nextInvestmentCode(accounts) : nextCode(accounts, 'asset');
    // 既存の資産の口座は、種類を変えると科目のコードを付け替える（預金 ⇄ 投資）。仕訳は科目の id で持つので、残高は変わらない
    const kindNow = isInvestmentAsset(linked || {}) ? 'invest' : 'cash';
    const retyped = !isNew && linked?.type === 'asset' && editing.kind && editing.kind !== kindNow;
    const account = isNew ? { id: uid(), name, code, type: 'asset', hidden: 0 }
      : retyped ? { ...linked, code: editing.kind === 'invest' ? nextInvestmentCode(accounts) : nextCode(accounts, 'asset') } : linked;
    const intents = [
      ...(isNew || retyped ? [upsert('accounts', account)] : []),
      upsert('wallets', { ...wallets.find((w) => w.id === editing.id), id: editing.id || uid(), name, accountId: isNew ? account.id : editing.accountId }),
    ];
    if (laterOpening) {
      const j = openingJournal({ account, input: editing.opening, journals, accounts: isNew ? [...accounts, account] : accounts, todayStr: today(), newId: uid });
      if (j) intents.push(upsert('journals', j));
    }
    if (canAdjust) {
      const j = adjustJournal({ account, input: editing.actual, journals, accounts, todayStr: today(), newId: uid });
      if (j) intents.push(upsert('journals', j));
    }
    commitAll(intents);
    setEditing(null);
    toast('保存しました');
    tour?.saved('wallet');
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
    tour?.saved('card');
  };

  // カードを編集（8-6）。口座の名前と、紐づく負債の科目の締め日・引落日・引落口座を一緒に直す。
  // 以前はカードを押しても締め日の欄が無く、オンボーディングで作ったカードに締め日を入れる場所が分からなかった。
  const openCard = (w) => {
    const a = accOf(w.accountId) || {};
    setEditing({ ...w, card: true, ccClose: a.ccClose || '', ccDay: a.ccDay || '', ccDelay: a.ccDelay || 1, ccFrom: a.ccFrom || '' });
  };

  const commitCardEdit = () => {
    const name = editing.name.trim();
    if (!name || !linked) return;
    const cc = editing.ccClose && editing.ccDay && editing.ccFrom
      ? { ccClose: Number(editing.ccClose), ccDay: Number(editing.ccDay), ccDelay: Number(editing.ccDelay) || 1, ccFrom: editing.ccFrom }
      : {};
    // カード設定は作り直す（外した設定を残さない。accounts.jsx と同じ）。ほかの項目は引き継ぐ
    // eslint-disable-next-line no-unused-vars
    const { ccClose, ccDay, ccDelay, ccFrom, ...prev } = linked;
    const account = { ...prev, ...cc };
    const intents = [
      upsert('wallets', { ...wallets.find((w) => w.id === editing.id), id: editing.id || uid(), name, accountId: linked.id }),
      upsert('accounts', account),
    ];
    // 締め日を初めて入れたら、オンボーディングで今日の日付に入れたカードの額を直前の締め日へ移す（次回の引落に乗せる）
    const moved = !linked.ccClose && cc.ccClose ? redatedCardOpening(account, journals) : null;
    if (moved) intents.push(upsert('journals', moved));
    if (laterOpening) {
      const j = openingJournal({ account, input: editing.opening, journals, accounts, todayStr: today(), newId: uid });
      if (j) intents.push(upsert('journals', j));
    }
    commitAll(intents);
    setEditing(null);
    toast('保存しました');
    tour?.saved('card');
  };

  // 引き落としの設定の欄（カードの追加と編集で同じもの）
  const ccFields = (set) => (
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
  );

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
        {ccFields(set)}
        <View ref={cardSaveRef} collapsable={false}>
          <Button label="保存" onPress={commitCard} disabled={!editing.name.trim()} />
        </View>
        <Button label="キャンセル" variant="ghost" onPress={() => setEditing(null)} />
      </Screen>
    );
  }

  if (editing?.card) {
    const set = (k) => (v) => setEditing((e) => ({ ...e, [k]: v }));
    return (
      <Screen>
        <Card title="カードを編集">
          <Field label="名称">
            <Input value={editing.name} onChangeText={set('name')} placeholder="例: 〇〇カード" />
          </Field>
        </Card>
        {ccFields(set)}
        {laterOpening ? <LaterOpening type="liability" value={editing.opening} onChange={set('opening')} /> : null}
        <View ref={cardSaveRef} collapsable={false}>
          <Button label="保存" onPress={commitCardEdit} disabled={!editing.name.trim()} />
        </View>
        <Button label="キャンセル" variant="ghost" onPress={() => setEditing(null)} />
      </Screen>
    );
  }

  if (editing) {
    return (
      <Screen>
        <Card title={editing.id ? '口座を編集' : '口座を追加'}>
          <Field label="名称">
            <Input value={editing.name} onChangeText={(v) => setEditing((e) => ({ ...e, name: v }))} placeholder="例: 〇〇銀行・PayPay" />
          </Field>
          <Field label="紐づける科目">
            <ChipRow options={walletOpts} value={editing.accountId} onChange={(v) => setEditing((e) => ({ ...e, accountId: v }))} />
          </Field>
          {!isNew && editing.id && linked?.type === 'asset' ? (
            <Field label="種類">
              <ChipRow
                options={[{ value: 'cash', label: '預金・現金・電子マネー' }, { value: 'invest', label: '投資（証券・NISA など）' }]}
                value={editing.kind || (isInvestmentAsset(linked) ? 'invest' : 'cash')} onChange={(v) => setEditing((e) => ({ ...e, kind: v }))} />
            </Field>
          ) : null}
          {isNew ? (
            <>
              <Text style={{ color: t.tx3, fontSize: 13, lineHeight: 20 }}>
                口座と同じ名前の科目（資産）を作ります。銀行ごとに残高を分けて見られます。
              </Text>
              <Field label="種類">
                <ChipRow
                  options={[{ value: 'cash', label: '預金・現金・電子マネー' }, { value: 'invest', label: '投資（証券・NISA など）' }]}
                  value={editing.kind || 'cash'} onChange={(v) => setEditing((e) => ({ ...e, kind: v }))} />
              </Field>
              {editing.kind === 'invest' ? (
                <Text style={{ color: t.tx3, fontSize: 13, lineHeight: 20 }}>
                  投資を選ぶと、ホームの「投資資産」に出ます。時価は「実査・評価替え」で合わせると、元本との差が損益として出ます。
                </Text>
              ) : null}
            </>
          ) : null}
        </Card>
        {laterOpening ? (
          <LaterOpening type={linked.type} value={editing.opening}
            onChange={(v) => setEditing((e) => ({ ...e, opening: v }))} />
        ) : null}
        {canAdjust ? (
          <Card title="いまの残高（直すときだけ）">
            <Text style={{ color: t.tx2, fontSize: 14, lineHeight: 21 }}>帳簿の残高: {faBal(bookNow)}</Text>
            <Text style={{ color: t.tx3, fontSize: 13, lineHeight: 20 }}>
              実際の額と違うときに入れます。差額を今日の日付で記帳して合わせます。空欄なら何もしません。
              {'\n'}※仕訳帳の「開始残高（{linked.name}）」を開いて金額を直しても変えられます。
            </Text>
            <Field label="金額">
              <Input value={String(editing.actual ?? '')} keyboardType="number-pad" placeholder={String(bookNow)}
                onChangeText={(v) => setEditing((e) => ({ ...e, actual: v }))} />
            </Field>
          </Card>
        ) : null}
        <View ref={walletSaveRef} collapsable={false}>
          <Button label="保存" onPress={commit} disabled={!editing.name.trim() || !editing.accountId} />
        </View>
        <Button label="キャンセル" variant="ghost" onPress={() => setEditing(null)} />
      </Screen>
    );
  }

  // 通常の行と、並び替え中の行で、同じ中身を使う
  const cardBody = (w) => (
    <>
            <Text style={{ color: t.tx, fontSize: 16 }}>{w.name}</Text>
            <Text style={{ color: t.tx3, fontSize: 13 }}>{cardLine(accOf(w.accountId))}</Text>
    </>
  );

  // 通常の行と、並び替え中の行で、同じ中身を使う
  const bankBody = (w) => (
    <>
            <Text style={{ color: t.tx, fontSize: 16 }}>{w.name}</Text>
            <Text style={{ color: t.tx3, fontSize: 13 }}>{accOf(w.accountId)?.name || '(科目なし)'}</Text>
    </>
  );

  return (
    <Screen>
      <ReorderToggle active={sorting} onPress={() => setSorting((v) => !v)} count={wallets.length} />
      {/* ツアー①は「口座を追加」と口座の一覧を一緒に指す（どちらを押しても進む） */}
      <View ref={walletListRef} collapsable={false} style={{ gap: 11 }}>
      <Button label="口座を追加" onPress={() => setEditing({ name: '', accountId: NEW_ACCOUNT })} />
      <Card>
        {bankWallets.length === 0 ? <Empty text="口座がありません" /> : sorting ? (
          <ReorderList items={bankWallets} onChange={(ids) => setListOrder('wallets', ids)}
            renderRow={(w) => <View style={{ paddingVertical: 11 }}>{bankBody(w)}</View>} />
        ) : bankWallets.map((w) => (
          <TouchableOpacity key={w.id} onPress={() => setEditing({ ...w })} onLongPress={() => remove(w)}
            style={[{ paddingVertical: 11 }, sep(t)]}>
            {bankBody(w)}
          </TouchableOpacity>
        ))}
      </Card>
      </View>
      <Text style={{ color: t.tx3, fontSize: 13, textAlign: 'center' }}>{sorting ? '≡ をドラッグして並び替えます。終わったら「完了」を押します' : 'タップで編集・長押しで削除'}</Text>

      {/* ツアー②は「カードを追加」を指す（一覧まで含めると、カードが多いと画面より高くなり指せない）。
          一覧のカードを押しても「カードを追加」を押しても進む */}
      {/* ツアー②は「カードを追加」とカードの一覧を一緒に指す（どちらを押しても進む。周りを暗くするので、一覧も明るく残す）。
          カードが多いと画面より高くなるが、上端が見えていれば指せる（TourProvider） */}
      <View ref={cardListRef} collapsable={false} style={{ gap: 11 }}>
      <Button label="カードを追加" onPress={() => setEditing({ newCard: true, name: '', opening: '', ccDelay: 1 })} />
      <Card title="カード">
        {cardWallets.length + looseCards.length === 0 ? <Empty text="カードがありません" /> : null}
        {sorting ? (
          <ReorderList items={cardWallets} onChange={(ids) => setListOrder('wallets', ids)}
            renderRow={(w) => <View style={{ paddingVertical: 11 }}>{cardBody(w)}</View>} />
        ) : cardWallets.map((w) => (
          <TouchableOpacity key={w.id} onPress={() => openCard(w)} onLongPress={() => remove(w)}
            style={[{ paddingVertical: 11 }, sep(t)]}>
            {cardBody(w)}
          </TouchableOpacity>
        ))}
        {looseCards.map((c) => (
          // 口座にしていないカードも、押すと編集を開く（保存すると口座・カードに並ぶ）。以前はクレジットの画面へ移っていた
          <TouchableOpacity key={c.id} onPress={() => openCard({ name: c.name, accountId: c.id })} style={[{ paddingVertical: 11 }, sep(t)]}>
            <Text style={{ color: t.tx, fontSize: 16 }}>{c.name}</Text>
            <Text style={{ color: t.tx3, fontSize: 13 }}>{cardLine(c)}</Text>
          </TouchableOpacity>
        ))}
      </Card>
      </View>
    </Screen>
  );
}
