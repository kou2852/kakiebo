// 初回のオンボーディング。ツアーの自動起動の代わりに、最初に口座と残高を登録してもらう。
//
// ⚠ 出すかどうかを「印」だけで決めないこと。入れ直して即ログインした人は印を持たず、
//   帳簿はサーバーから来る。印と hasContent() の両方を見ないと、既に帳簿がある人に
//   「いまの残高を入れてください」と聞くことになり、口座と開始残高が二重になる。
//
// ⚠ 画面の入力はここにメモリで持つだけ。保存するのは finish() の一度きり。
//   途中で保存すると、やめた人の端末に中途半端な口座が残る。そうなるとそのあと
//   ログインしたとき「端末が空」の安全な取り込み経路（connect.jsx の reconcile）を外れ、
//   サーバーの帳簿と突き合わせる3択に落ちる。
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useData } from './DataProvider';
import { hasContent } from './merge';
import { buildPlan, summarize } from './onboardingPlan';
import { today, uid } from '../utils/format';

const SEEN_KEY = 'onboarding.seen';

/** 画面の並び。A-3 まで来たら終わり。 */
export const STEPS = ['welcome', 'steps', 'pick', 'balance', 'monthly', 'done'];

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
      try { seen = await AsyncStorage.getItem(SEEN_KEY); } catch { seen = null; }
      if (seen) return;
      // 既に帳簿がある（＝入れ直し＋ログインで取り込んだ等）。聞き直さない。
      if (hasContent(dataset)) { await markSeen(); return; }
      setActive(true);
    })();
  }, [loading, dataset, markSeen]);

  /**
   * ログインから戻ったときの再判定。
   * サーバーの帳簿を取り込んでいたらオンボーディングは飛ばす（残高を聞き直すと二重になる）。
   * 取り込むものが無かった（新規アカウント）ならそのまま続ける。
   */
  const checkAfterLogin = useCallback(async () => {
    if (!hasContent(dataset)) return false;
    await markSeen();
    setActive(false);
    return true;
  }, [dataset, markSeen]);

  const next = useCallback(() => setIndex((v) => Math.min(STEPS.length - 1, v + 1)), []);
  const back = useCallback(() => setIndex((v) => Math.max(0, v - 1)), []);

  /** 「あとで」。何も書かずに閉じる。端末は空のままなので、後のログインは安全な経路に入る。 */
  const skip = useCallback(async () => {
    await markSeen();
    setActive(false);
  }, [markSeen]);

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
      if (intents.length) await commitAll(intents);
      await markSeen();
      setActive(false);
    } catch (e) {
      // 失敗しても印は付けない。次の起動でもう一度出す。
      console.warn('オンボーディングの保存に失敗:', e?.message || String(e));
      throw e;
    } finally {
      setSaving(false);
    }
  }, [saving, draft, accounts, commitAll, markSeen]);

  const summary = useMemo(() => summarize(draft), [draft]);

  const value = useMemo(() => ({
    active, saving, draft, setDraft, summary,
    step: STEPS[index], index, total: STEPS.length,
    next, back, skip, finish, checkAfterLogin,
  }), [active, saving, draft, summary, index, next, back, skip, finish, checkAfterLogin]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
