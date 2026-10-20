// 初回のオンボーディング。ツアーの自動起動の代わりに、最初に口座と残高を登録してもらう。
//
// ⚠ 出すかどうかを「印」だけで決めないこと。入れ直して即ログインした人は印を持たず、
//   帳簿はサーバーから来る。印と hasUserData() の両方を見ないと、既に帳簿がある人に
//   「いまの残高を入れてください」と聞くことになり、口座と開始残高が二重になる。
//
// ⚠ 画面の入力はここにメモリで持つだけ。保存するのは finish() の一度きり。
//   途中で保存すると、やめた人の端末に中途半端な口座が残る。そうなるとそのあと
//   ログインしたとき「端末が空」の安全な取り込み経路（connect.jsx の reconcile）を外れ、
//   サーバーの帳簿と突き合わせる3択に落ちる。
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useData } from './DataProvider';
import { buildPlan, hasUserData, idsFromIntents, summarize } from './onboardingPlan';
import { CREATED_IDS_KEY, rememberOnboardingIds } from './onboardingMark';
import { today, uid } from '../utils/format';
import { trackStage } from '../track';

const SEEN_KEY = 'onboarding.seen';
// ホームのモーダル（使い方の大枠。src/components/HomeIntro.jsx）をまだ見ていない印。
// オンボーディングを終えた・飛ばしたときに付け、モーダルを閉じたら消す。今の利用者には付かないので出ない（8-2）。
// 端末に残すのは、オンボーディングの直後にアプリを閉じた人にも、次に開いたとき出すため。
const INTRO_KEY = 'homeIntro.pending';

/**
 * 「もう見た」の記録を消す。端末の帳簿を消すときに一緒に呼ぶこと。
 *
 * ⚠ 帳簿だけ消して記録を残すと、空の端末なのにオンボーディングが出ず、
 *   いきなり空のホームになる（設定の「端末のデータを消去」で実際に起きた）。
 */
export const forgetOnboarding = () => AsyncStorage.multiRemove([SEEN_KEY, CREATED_IDS_KEY, INTRO_KEY]).catch(() => {});

/** 画面の並び。最後の 'notify'（通知のお知らせと許可）で「次へ」を押すと保存して終わる。 */
export const STEPS = ['welcome', 'steps', 'pick', 'balance', 'monthly', 'done', 'notify'];

/**
 * 最初に見せておく状態。
 * ・よく使う3つにはチェックを入れておく（外す方が速い）
 * ・毎月のお金は名前だけ出し、金額は空。空のままなら作られない
 */
const initialDraft = () => ({
  picks: ['cash', 'bank', 'card'],
  balances: {},
  monthly: [
    { key: 'salary', name: '給料', dir: 'in', day: 25, amount: '', accountId: 'd01' },
    { key: 'rent', name: '家賃', dir: 'out', day: 27, amount: '', accountId: 'e09' },
  ],
});

const Ctx = createContext(null);
export const useOnboarding = () => useContext(Ctx);

export function OnboardingProvider({ children }) {
  const d = useData();
  const {
    loading, commitAll, accounts, journals, tags, allocs, wallets, presets, budgets, recurring, rules,
  } = d;

  const [active, setActive] = useState(false);
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState(initialDraft);
  const [saving, setSaving] = useState(false);
  // 出すかどうかの判定が済んだか。通知の許可を、オンボーディングを飛ばした人にホームで求めるのに使う。
  const [decidedState, setDecidedState] = useState(false);
  // ホームのモーダルを出すか。出している間は、通知の許可と更新の案内を待たせる（8-2）
  const [intro, setIntro] = useState(false);

  const dataset = useMemo(
    () => ({ accounts, journals, tags, allocs, wallets, presets, budgets, recurring, rules }),
    [accounts, journals, tags, allocs, wallets, presets, budgets, recurring, rules]
  );

  const markSeen = useCallback(async () => {
    try { await AsyncStorage.setItem(SEEN_KEY, '1'); } catch { /* 保存できなくても進む */ }
  }, []);

  // 出すかどうかの判定は起動後に一度だけ。帳簿の読み込みを待ってから見る。
  const decided = useRef(false);
  useEffect(() => {
    if (loading || decided.current) return;
    decided.current = true;
    (async () => {
      let seen = null;
      try { seen = await AsyncStorage.getItem(SEEN_KEY); } catch { seen = null; }      if (seen) {
        let pending = null;
        try { pending = await AsyncStorage.getItem(INTRO_KEY); } catch { pending = null; }
        setIntro(!!pending);
        setDecidedState(true);
        return;
      }
      // 既に帳簿がある（＝入れ直し＋ログインで取り込んだ等）。聞き直さない。
      if (hasUserData(dataset)) { await markSeen(); setDecidedState(true); return; }
      setActive(true);
      setDecidedState(true);
    })();
  }, [loading, dataset, markSeen]);

  /**
   * ログインから戻ったときの再判定。
   * サーバーの帳簿を取り込んでいたらオンボーディングは飛ばす（残高を聞き直すと二重になる）。
   * 取り込むものが無かった（新規アカウント）ならそのまま続ける。
   */
  const checkAfterLogin = useCallback(async () => {
    if (!hasUserData(dataset)) return false;
    await markSeen();
    setActive(false);
    return true;
  }, [dataset, markSeen]);

  const next = useCallback(() => setIndex((v) => Math.min(STEPS.length - 1, v + 1)), []);
  const back = useCallback(() => setIndex((v) => Math.max(0, v - 1)), []);

  // ⚠ 印は setActive(false) より前に付ける。後だと、モーダルが出る前の一瞬に通知の許可が出うる
  const markIntro = useCallback(async () => {
    try { await AsyncStorage.setItem(INTRO_KEY, '1'); } catch { /* 保存できなくても、この起動では出す */ }
    setIntro(true);
  }, []);

  /** ホームのモーダルを閉じた。もう出さない。 */
  const closeIntro = useCallback(() => {
    setIntro(false);
    AsyncStorage.removeItem(INTRO_KEY).catch(() => {});
  }, []);

  /** 使い方の画面から、もう一度見る。印は付けない（閉じたらまた出なくなる） */
  const openIntro = useCallback(() => setIntro(true), []);

  /** 「あとで」。何も書かずに閉じる。端末は空のままなので、後のログインは安全な経路に入る。 */
  const skip = useCallback(async () => {
    await markSeen();
    await markIntro();
    setActive(false);
  }, [markSeen, markIntro]);

  /**
   * 「はじめる」。ここが唯一の書き込み。
   *
   * ⚠ commit（save）を並べずに commitAll を使う。commit は書き込みの完了を待たないので、
   *   科目・口座・仕訳を続けて保存すると後の分が消える（DataProvider.jsx の注意書き）。
   */
  const finish = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      const intents = buildPlan(draft, accounts, today(), uid);
      if (intents.length) {
        // ⚠ 積む前に覚える。積んだ直後に自動同期が走りうるので、印が後だと間に合わない。
        await rememberOnboardingIds(idsFromIntents(intents));
        await commitAll(intents);
      }
      await markSeen();
      await markIntro();
      setActive(false);
      trackStage('m_onboard_done'); // 新しく入れた端末だけ。オンラインのときだけ数える（src/track.js）
    } catch (e) {
      // 失敗しても印は付けない。次の起動でもう一度出す。
      console.warn('オンボーディングの保存に失敗:', e?.message || String(e));
      throw e;
    } finally {
      setSaving(false);
    }
  }, [saving, draft, accounts, commitAll, markSeen, markIntro]);

  const summary = useMemo(() => summarize(draft), [draft]);

  const value = useMemo(() => ({
    active, decided: decidedState, saving, draft, setDraft, summary,
    step: STEPS[index], index, total: STEPS.length,
    next, back, skip, finish, checkAfterLogin, intro, closeIntro, openIntro,
  }), [active, decidedState, saving, draft, summary, index, next, back, skip, finish, checkAfterLogin, intro, closeIntro, openIntro]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
