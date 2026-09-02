// レシート・カード利用控え・残高画面の撮影から記帳する。
//
// 文字認識は端末内で完結する（Apple Vision）。画像も認識結果も外部へ送らない。
// 読み取り結果は必ず確認画面を経由させる。誤読をそのまま記帳すると帳簿が静かに壊れ、
// 複式簿記アプリとしては数字が合わないこと自体が致命傷になるため。
import { useState } from 'react';
import { ActivityIndicator, Alert, Image, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useData } from '../src/store/DataProvider';
import { useTheme } from '../src/theme';
import { Button, Card, Screen } from '../src/components/ui';
import JournalForm from '../src/components/JournalForm';
import { isAvailable, recognize } from '../modules/text-recognition';
import { extractReceipt } from '../src/utils/receipt';
import { fa, today } from '../src/utils/format';
import { BUILD_STAMP } from '../src/buildStamp';

export default function Scan() {
  const t = useTheme();
  const router = useRouter();
  const { accounts, rules, save } = useData();

  const [busy, setBusy] = useState(false);
  const [image, setImage] = useState(null);
  const [result, setResult] = useState(null); // { date, amount, store, lines }
  const [showLines, setShowLines] = useState(false);

  const run = async (fromCamera) => {
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('許可が必要です', fromCamera ? 'カメラの使用を許可してください。' : '写真へのアクセスを許可してください。');
      return;
    }

    const picked = fromCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.8 });
    if (picked.canceled) return;

    const uri = picked.assets[0].uri;
    setImage(uri);
    setBusy(true);
    try {
      setResult(extractReceipt(await recognize(uri)));
    } catch (e) {
      Alert.alert('読み取れません', e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!isAvailable()) {
    return (
      <Screen>
        <Card title="この機能は使えません">
          <Text style={{ color: t.tx2, fontSize: 15, lineHeight: 22 }}>
            文字認識のモジュールが入っていないビルドです。JS の更新だけでは有効になりません。
            TestFlight で新しいビルドに更新してください。
          </Text>
          <Text style={{ color: t.tx3, fontSize: 13 }}>現在の JS: {BUILD_STAMP}</Text>
        </Card>
      </Screen>
    );
  }

  // 店名がルールに一致すれば科目まで決める。当たらなければ費目は画面で選ぶ。
  const rule = result?.store ? (rules || []).find((r) => r.keyword && result.store.includes(r.keyword)) : null;

  return (
    <Screen>
      <Card title="撮って記帳">
        <Text style={{ color: t.tx2, fontSize: 14, lineHeight: 21 }}>
          レシート、カードの利用控え、口座の残高画面。読み取りは端末内で行い、画像は外部に送りません。
        </Text>
        <Button label="カメラで撮る" onPress={() => run(true)} disabled={busy} />
        <Button label="写真から選ぶ" variant="ghost" onPress={() => run(false)} disabled={busy} />
      </Card>

      {image ? (
        <Card>
          <Image source={{ uri: image }} style={{ width: '100%', height: 160, borderRadius: 8 }} resizeMode="contain" />
        </Card>
      ) : null}

      {busy ? (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <ActivityIndicator color={t.ac} />
            <Text style={{ color: t.tx2, fontSize: 15 }}>読み取り中…</Text>
          </View>
        </Card>
      ) : null}

      {result ? (
        <>
          <Card title="読み取り結果">
            <Row label="日付" value={result.date || '読み取れず'} ok={!!result.date} />
            <Row label="合計" value={result.amount ? fa(result.amount) : '読み取れず'} ok={!!result.amount} />
            <Row label="店名" value={result.store || '読み取れず'} ok={!!result.store} />
            <Text style={{ color: t.tx3, fontSize: 13 }}>
              必ず内容を確認してください。読み違いをそのまま記帳すると帳簿がずれます。
            </Text>
            <Button label={showLines ? '読み取った文字を隠す' : '読み取った文字を見る'} variant="ghost"
              onPress={() => setShowLines((v) => !v)} />
            {showLines ? (
              <Text selectable style={{ color: t.tx3, fontSize: 13, lineHeight: 17 }}>
                {result.lines.join(String.fromCharCode(10))}
              </Text>
            ) : null}
          </Card>

          <JournalForm
            initial={{
              type: 'out',
              date: result.date || today(),
              desc: result.store || '',
              amount: result.amount ? String(result.amount) : '',
              drId: rule?.drAccountId || accounts.find((a) => a.type === 'expense')?.id || '',
              crId: rule?.crAccountId || accounts.find((a) => a.type === 'asset')?.id || '',
              tagId: '',
            }}
            submitLabel="記帳する"
            onSubmit={(j) => {
              save('journals', j);
              Alert.alert('記帳しました', `${j.date}  ${fa(j.lines[0].amount)}`, [
                { text: 'OK', onPress: () => router.back() },
              ]);
            }}
          />
        </>
      ) : null}
    </Screen>
  );
}

function Row({ label, value, ok }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text style={{ color: t.tx2, fontSize: 15 }}>{label}</Text>
      <Text style={{ color: ok ? t.tx : t.red, fontSize: 15, fontWeight: '600' }}>{value}</Text>
    </View>
  );
}
