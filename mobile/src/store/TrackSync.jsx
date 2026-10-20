// 計測のきっかけを拾う。見た目は持たない（NotificationSync と同じ置き方）。送り方は src/track.js。
//
// 数えるのは、この計測を入れた版で新しく使い始めた端末だけ。最初に動いたとき、
// オンボーディングを出す端末を「新しく入れた端末」として端末に残す。
//
// 出来事（使い方のストーリーの段階。docs/tour-story-2026-10.md）
//   m_onboard_done   オンボーディングを終えた（OnboardingProvider の finish から送る）
//   m_opening        口座の残高が入った（開始残高の仕訳がある）
//   m_card_set       カードの締め日・引落日・引落口座が入った
//   m_first_journal  開始残高ではない記帳が1件以上ある
//   m_tag_alloc      タグ配分が1件以上ある
//   m_retain_d7 / m_retain_d30  使い始めて7日・30日以上たって開いた
//   m_intro_tour     ホームのモーダルの最後で「ツアーを見る」を選んだ（HomeIntro から送る）
// 帳簿の中身は送らない。帳簿を見て「その段階に来た」と端末で決め、出来事の名前だけを送る。
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useData } from './DataProvider';
import { useOnboarding } from './OnboardingProvider';
import { decideCohort, trackOnce, trackRetention } from '../track';
import { isOpeningJournal } from '../utils/openingBalance';
import { isCreditCard } from '../utils/creditCard';
import { today } from '../utils/format';

export default function TrackSync() {
  const { loading, accounts, journals, allocs } = useData();
  const onboarding = useOnboarding();
  const [cohort, setCohort] = useState(null);

  // 新しく入れた端末かを決める。オンボーディングを出すかが決まってから（決まっていれば端末の値）
  const decided = !loading && !!onboarding?.decided;
  const isNew = !!onboarding?.active;
  useEffect(() => {
    if (!decided) return;
    let alive = true;
    decideCohort(isNew, today()).then((c) => { if (alive) setCohort(c); });
    return () => { alive = false; };
    // isNew は最初に決めたときの値だけが効く（以後は端末に残した値を返す）
  }, [decided, isNew]);

  // 帳簿の段階
  useEffect(() => {
    if (cohort !== 'new' || loading) return;
    if (journals.some(isOpeningJournal)) trackOnce('m_opening');
    if (accounts.some(isCreditCard)) trackOnce('m_card_set');
    if (journals.some((j) => !isOpeningJournal(j))) trackOnce('m_first_journal');
    if ((allocs || []).length) trackOnce('m_tag_alloc');
  }, [cohort, loading, journals, accounts, allocs]);

  // 継続。開いたとき、前面に戻ったとき
  useEffect(() => {
    if (cohort !== 'new') return undefined;
    trackRetention(today());
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') trackRetention(today()); });
    return () => sub.remove();
  }, [cohort]);

  return null;
}
