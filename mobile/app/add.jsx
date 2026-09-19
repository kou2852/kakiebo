// ショートカット／URLスキームからの記帳。
//   kurofukubo://add?text=食費 1200 現金
//   kurofukubo://add?amount=160&preset=自販機
//   kurofukubo://add?amount=1200&dr=食費&cr=現金&desc=コンビニ
//
// 保存はユーザーが押す。URLスキームは Web ページやメールのリンクからも叩けるため、
// 自動保存にすると誤タップで帳簿が汚れる。事前入力までに留めて、確定は必ず人が行う。
import { useMemo } from 'react';
import { Alert, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useData } from '../src/store/DataProvider';
import { useTheme } from '../src/theme';
import { Card, Screen } from '../src/components/ui';
import QuickEntryBar from '../src/components/QuickEntryBar';
import JournalForm from '../src/components/JournalForm';
import { fa, today } from '../src/utils/format';
import { useEntryAd } from '../src/components/Interstitial';

export default function Add() {
  const t = useTheme();
  const router = useRouter();
  const { accounts, presets, save } = useData();
  const params = useLocalSearchParams();
  const entryAd = useEntryAd();

  const amountParam = String(params.amount || '').replace(/[^0-9]/g, '');

  // preset 指定があれば、その科目の組み合わせを初期値にする。
  // ショートカット側で「自販機」とだけ書いておけば、金額を入れるだけで済む。
  const initial = useMemo(() => {
    const byName = (n) => accounts.find((a) => a.name === n) || accounts.find((a) => a.name.includes(n));
    const preset = params.preset
      ? presets.find((p) => p.name === params.preset || p.name.includes(params.preset))
      : null;

    const presetAmount = preset?.lines.find((l) => l.side === 'dr')?.amount || 0;
    const amount = amountParam || (presetAmount > 0 ? String(presetAmount) : '');
    const drFromPreset = preset?.lines.find((l) => l.side === 'dr')?.accountId;
    const crFromPreset = preset?.lines.find((l) => l.side === 'cr')?.accountId;
    const dr = params.dr ? byName(params.dr)?.id : drFromPreset;
    const cr = params.cr ? byName(params.cr)?.id : crFromPreset;
    if (!dr && !cr && !amount) return null;

    const drType = accounts.find((a) => a.id === dr)?.type;
    return {
      type: drType === 'asset' ? 'in' : 'out',
      date: String(params.date || today()),
      desc: String(params.desc || preset?.desc || ''),
      amount,
      drId: dr || '',
      crId: cr || '',
      tagId: '',
    };
  }, [params, accounts, presets, amountParam]);

  const done = (j) => {
    entryAd.counted();
    Alert.alert('記帳しました', `${j.date}  ${fa(j.lines[0].amount)}`, [
      { text: 'OK', onPress: () => { router.replace('/'); entryAd.closed(); } },
    ]);
  };

  // text= が来ていれば一行入力に流す。ショートカットの「テキストを尋ねる」と相性がよい。
  if (params.text || !initial) {
    return (
      <Screen>
        <QuickEntryBar initialText={String(params.text || '')} autoFocus onSaved={done} />
        <Text style={{ color: t.tx3, fontSize: 13, lineHeight: 20 }}>
          ショートカットから開かれています。内容を確認して記帳してください。
        </Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <Card>
        <Text style={{ color: t.tx2, fontSize: 14 }}>ショートカットから開かれています。内容を確認してください。</Text>
      </Card>
      <JournalForm
        initial={initial}
        submitLabel="記帳する"
        onSubmit={(j) => { save('journals', j); done(j); }}
      />
    </Screen>
  );
}
