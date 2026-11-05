// ホームに着いたときに画面の上へ重ねて出す「お知らせ」カード（iOS・Android 共通）。ホームの中には置かない。
// 出すのは、まだ読んでいない更新情報（新着）があるとき。Android はそれに加えて、レビューのお願いが出る条件のときも出す。
// 「使い方」は、まだ一度も出していない端末に1回だけ、全部を出す（大枠・ツアー・説明。以降は設定の「使い方」ページから）。
// 更新情報・使い方・レビューのお願いは別々のカードにし、1枚ずつ順に出す（閉じると次が出る）。
// 閉じる（✕・外側・「閉じる」）と、そのカードの分だけ記録する（更新情報は既読、使い方は出し済み）。起動1回につき1度まで。
//
// Android だけ、レビューのお願い（ストアのレビュー画面へ直接飛ばす）を出す。
// ・iOS には出さない。Apple は「独自のレビュー依頼は認めない」（App Store Review Guidelines 5.6.1）ので、
//   iOS は標準の評価ダイアログ（ReviewAsk.maybeAskReview）と設定の「アプリを評価する」だけにする。
// ・気分を聞いて振り分けない。星の数を指定しない。Google は評価カードの前の質問を禁じている。
// ・出す条件・間隔は utils/reviewPrompt.js の shouldShowReviewCard（検証 reviewPrompt.check.mjs）
// ・外側を押して閉じたら「あとで」と同じ扱い（90日出さない）。出し直して急かさない。
// ・出すタイミング: ホームの描画が落ち着いたらすぐ（スプラッシュが明けて、アニメーションなどが終わった直後）。
//   決まった秒数は待たない（以前は4秒だった）。
// ・アップデートの案内（UpdatePrompt）が出ている間は待つ（overlayBusy）。こちらが先に出ていれば、向こうが待つ。
//   オンボーディング・ツアー中は出さない。
import { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { InteractionManager, Modal, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import { useData } from '../store/DataProvider';
import { useOnboarding } from '../store/OnboardingProvider';
import { useTour } from '../store/TourProvider';
import { useAuth } from '../store/AuthProvider';
import { CIRCLED, TOURS, TOUR_MENU } from '../tours';
import { GUIDE_SECTIONS } from '../guideSections';
import { useTheme } from '../theme';
import { useUpdates } from '../updates';
import { isOverlayOpen, setOverlayOpen } from '../overlayBusy';
import { Button } from './ui';
import { reviewDue, reviewLater, reviewWrite } from '../reviewAsk';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const GUIDE_KEY = 'guide.cardShown'; // 使い方の案内を出した日時。一度出したら出さない
const markGuide = () => AsyncStorage.setItem(GUIDE_KEY, String(Date.now())).catch(() => {});

export default function UpdatesOverlay() {
  const t = useTheme();
  const router = useRouter();
  const path = usePathname();
  const { journals, loading } = useData();
  const onboarding = useOnboarding();
  const tour = useTour();
  const signedIn = !!useAuth()?.signedIn;
  const { height } = useWindowDimensions();
  const { items, unread, markSeen } = useUpdates();
  // 出すカードの順番待ち（'news' → 'guide' → 'review'）。先頭のカードを出す
  const [queue, setQueue] = useState([]);
  const card = queue[0];
  const open = !!card;
  const checked = useRef(false);

  // ホームのモーダル（HomeIntro）を出している間も待つ。閉じてから出す（UpdatePrompt と同じ）
  const ready = !loading && !!onboarding?.decided && !onboarding?.active && !onboarding?.intro && !tour?.tourId && path === '/';
  const latest = items?.[0] || null;
  const hasNews = !!latest && unread;

  useEffect(() => {
    if (!ready || !items || checked.current) return undefined;
    let alive = true;
    // 描画やアニメーションが落ち着いてから（スプラッシュ明けのすぐあと）。決まった秒数は待たない
    const task = InteractionManager.runAfterInteractions(async () => {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const askReview = await reviewDue(journals.length);
      const askGuide = !(await AsyncStorage.getItem(GUIDE_KEY).catch(() => null));
      if (!alive || checked.current) return;
      const cards = [hasNews && 'news', askGuide && 'guide', askReview && 'review'].filter(Boolean);
      if (!cards.length) { checked.current = true; return; }
      // アップデートの案内が出ている間は待つ（閉じたら出す）
      for (let i = 0; i < 60 && isOverlayOpen('appPrompt'); i++) await wait(1000);
      if (!alive || checked.current) return;
      checked.current = true;
      setQueue(cards);
    });
    return () => { alive = false; task.cancel(); };
  }, [ready, items, hasNews, journals.length]);

  // 出ている間は印を立てる（UpdatePrompt が重ならないように待つ）
  useEffect(() => { setOverlayOpen('updates', open); return () => setOverlayOpen('updates', false); }, [open]);

  if (!open) return null;

  // そのカードの分を記録する。更新情報は既読、使い方は出し済み（markGuide）
  const markNews = () => markSeen();
  // 閉じる（✕・外側・「閉じる」・「あとで」）。記録して次のカードへ。レビューのお願いは「あとで」として記録する
  const close = () => {
    if (card === 'news') markNews();
    if (card === 'guide') markGuide();
    if (card === 'review') reviewLater();
    setQueue((q) => q.slice(1));
  };
  // 別の画面やツアーへ移るときは、残りのカードは出さない（この起動では出し直さない）
  const goUpdates = () => { markNews(); setQueue([]); router.push('/updates'); };
  // 使い方のツアー・大枠: カードを閉じてから始める（ホームの上にツアーや紹介が出る）
  const startTour = (id) => { markGuide(); setQueue([]); tour.start(id); };
  const openIntro = () => { markGuide(); setQueue([]); onboarding?.openIntro?.(); };
  const closeBtn = (
    <Pressable onPress={close} hitSlop={10} accessibilityRole="button" accessibilityLabel="閉じる">
      <Ionicons name="close" size={22} color={t.tx3} />
    </Pressable>
  );
  const write = async () => {
    setQueue([]);
    await reviewWrite();
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
      <Pressable onPress={close} accessibilityLabel="閉じる" style={{ flex: 1, backgroundColor: 'rgba(12,18,24,0.55)', justifyContent: 'center', padding: 24 }}>
        {/* 中のタップが背景に抜けて閉じないよう、空の onPress で受ける */}
        <Pressable onPress={() => {}} style={[{ backgroundColor: t.bg1, borderRadius: 18, maxHeight: height * 0.82 }, t.shadow]}>
         <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} showsVerticalScrollIndicator={false}>
          {card === 'news' ? (
            <Pressable onPress={goUpdates} accessibilityRole="button" accessibilityLabel={`更新情報。${latest.title}`} style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ color: t.tx, fontSize: 17, fontWeight: '800' }}>更新情報</Text>
                <View style={{ backgroundColor: t.red, borderRadius: 9, paddingHorizontal: 8, paddingVertical: 2 }}>
                  <Text style={{ color: '#ffffff', fontSize: 11.5, fontWeight: '800' }}>新着</Text>
                </View>
                <View style={{ flex: 1 }} />
                {closeBtn}
              </View>
              {latest.date ? <Text style={{ color: t.tx3, fontSize: 12.5 }}>{latest.date}</Text> : null}
              <Text style={{ color: t.tx, fontSize: 15.5, fontWeight: '700' }} numberOfLines={2}>{latest.title}</Text>
              {latest.items?.[0] ? <Text style={{ color: t.tx2, fontSize: 13.5, lineHeight: 20 }} numberOfLines={3}>{latest.items[0]}</Text> : null}
              <Text style={{ color: t.ac, fontSize: 14, fontWeight: '700', marginTop: 2 }}>一覧を見る ›</Text>
            </Pressable>
          ) : null}

          {card === 'guide' ? (
            <View style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ color: t.tx, fontSize: 17, fontWeight: '800', flex: 1 }}>使い方</Text>
                {closeBtn}
              </View>
              <Pressable onPress={openIntro} accessibilityRole="button" style={{ paddingVertical: 8 }}>
                <Text style={{ color: t.ac, fontSize: 15, fontWeight: '700' }}>使い方の大枠を見る ›</Text>
                <Text style={{ color: t.tx3, fontSize: 12.5 }}>何を設定すると、ホームのどこが動くか</Text>
              </Pressable>
              <Text style={{ color: t.tx3, fontSize: 12.5 }}>ツアー（選ぶと実際の画面を指しながら案内します）</Text>
              {TOUR_MENU.map((id, i) => {
                const locked = id === 'encryption' && !signedIn;
                return (
                  <Pressable key={id} disabled={locked} onPress={() => startTour(id)} accessibilityRole="button"
                    style={{ paddingVertical: 8, borderTopWidth: 1, borderTopColor: t.bd, opacity: locked ? 0.5 : 1 }}>
                    <Text style={{ color: t.tx, fontSize: 15 }}>{CIRCLED[i]} {TOURS[id].label}</Text>
                    {locked ? <Text style={{ color: t.tx3, fontSize: 12 }}>※ユーザー登録後に有効化できます</Text> : null}
                  </Pressable>
                );
              })}
              {GUIDE_SECTIONS.map((x) => (
                <View key={x.title} style={{ gap: 3, paddingTop: 6, borderTopWidth: 1, borderTopColor: t.bd }}>
                  <Text style={{ color: t.tx, fontSize: 14.5, fontWeight: '700' }}>{x.title}</Text>
                  <Text style={{ color: t.tx2, fontSize: 13.5, lineHeight: 21 }}>{x.body}</Text>
                </View>
              ))}
              <Text style={{ color: t.tx3, fontSize: 12.5 }}>あとから、設定の「使い方」でも読めます。</Text>
            </View>
          ) : null}

          {card === 'review' ? (
            <View style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ color: t.tx, fontSize: 16, fontWeight: '800', flex: 1 }}>ご利用ありがとうございます</Text>
                {closeBtn}
              </View>
              <Text style={{ color: t.tx2, fontSize: 14, lineHeight: 21 }}>
                よろしければ、Google Play にレビューをお寄せください。今後の改善の参考にします。
              </Text>
              <Button label="レビューを書く" onPress={write} />
              <Button label="あとで" variant="ghost" onPress={close} />
            </View>
          ) : (
            <Button label="閉じる" variant="ghost" onPress={close} />
          )}
         </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
