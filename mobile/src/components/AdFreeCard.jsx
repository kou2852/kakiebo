// 「動画を見て、今日は広告を消す」の中身。設定の「広告」画面とホーム右下の「広告を消す」で同じものを使う（2026-10-17）。
// 動画広告を最後まで見ると、その日の終わりまで広告（バナーと全画面）を出さない。押したときだけ動画を出す。
import { useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Button } from './ui';
import { useToast } from '../store/ToastProvider';
import { useAdFree } from '../adFree';
import { watchRewarded } from './Rewarded';
import { ADS_ENABLED } from './Ad';
import { EVERY } from '../utils/adPacing';
import { entriesUntilAd } from './Interstitial';
import { useAuth } from '../store/AuthProvider';

const clock = (ms) => {
  const d = new Date(ms);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export default function AdFreeCard() {
  const t = useTheme();
  const toast = useToast();
  const { active, until } = useAdFree();
  const [busy, setBusy] = useState(false);
  // 記帳のあとの全画面広告は、ゲストだけに EVERY 件ごとに出る（Interstitial.js）。あと何件かを添える
  const guest = !useAuth()?.signedIn;
  const [left, setLeft] = useState(null);
  useEffect(() => {
    if (!guest || !ADS_ENABLED) return undefined;
    let alive = true;
    entriesUntilAd().then((n) => { if (alive) setLeft(n); });
    return () => { alive = false; };
  }, [guest]);

  const watch = async () => {
    setBusy(true);
    const r = await watchRewarded();
    setBusy(false);
    if (r === 'earned') toast('今日はこれから広告を出しません');
    else if (r === 'dismissed') Alert.alert('広告は消えていません', '動画を最後まで見ると、今日の広告が消えます。');
    else Alert.alert('動画を読み込めませんでした', '通信を確かめて、少し待ってからもう一度お試しください。');
  };

  const note = { color: t.tx3, fontSize: 13.5, lineHeight: 20 };

  // 全画面広告の回数（広告の無い版では出さない）
  const pacing = !ADS_ENABLED ? null : (
    <View style={{ backgroundColor: t.bg3, borderRadius: 10, padding: 10, gap: 2 }}>
      <Text style={{ color: t.tx2, fontSize: 13.5, lineHeight: 20 }}>
        {guest ? `全画面の広告は、記帳 ${EVERY} 件ごとに1回出ます。` : 'ログイン中は、記帳のあとの全画面の広告は出ません。'}
      </Text>
      {guest && left != null ? (
        <Text style={{ color: t.tx, fontSize: 15, fontWeight: '700' }}>
          {active ? '今日は出ません' : left > 0 ? `次は あと ${left} 件 の記帳で出ます` : '次の記帳のあとに出ます'}
        </Text>
      ) : null}
    </View>
  );

  if (active) {
    return (
      <>
        <Text style={{ color: t.tx, fontSize: 16, fontWeight: '700' }}>広告をオフにしています</Text>
        <Text style={note}>{clock(until)} まで、バナーも全画面の広告も出ません。日付が変わると、また表示されます。</Text>
        {pacing}
      </>
    );
  }
  return (
    <>
      <Text style={{ color: t.tx2, fontSize: 15, lineHeight: 22 }}>
        動画広告を最後まで見ると、今日の終わりまで、バナーと全画面の広告を出さなくします。
      </Text>
      <Button label={busy ? '読み込み中…' : '▶  動画を見て、今日は広告を消す'} onPress={watch} disabled={busy} />
      <Text style={note}>動画は30秒ほどです。途中で閉じると広告は消えません。見るのは、ボタンを押したときだけです。</Text>
      {pacing}
    </>
  );
}

