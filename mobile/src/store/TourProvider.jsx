// 実画面をスポットライトで指して操作を誘導するツアー。Web 版 Onboarding/Tour.jsx の移植。
//
// Web は CSS セレクタで対象を探せるが、React Native にはそれが無い。
// 代わりに、指したい要素が自分を登録し、必要になったら measureInWindow で
// 画面座標を報告する仕組みにしている（useTourTarget）。
//
// 進行はハイブリッド。記帳や口座追加を伴うステップは「実際に操作したら自動で次へ」、
// それ以外は「次へ」を押して進む。説明を読むだけで終わらせないため。
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { TOURS } from '../tours';
import { useData } from './DataProvider';

const Ctx = createContext(null);
export const useTour = () => useContext(Ctx);

const SEEN_KEY = 'tour.firstRun.seen';

export function TourProvider({ children }) {
  const router = useRouter();
  const { journals, accounts } = useData();

  const [tourId, setTourId] = useState(null);
  const [index, setIndex] = useState(0);
  // 測った位置は「どのステップのものか」と一緒に持つ。
  // ステップが変わったら古い位置を使わないだけでよく、状態を消しに行かなくて済む。
  const [found, setFound] = useState(null); // { key, rect }

  // 指し示す対象の登録簿。key → measureInWindow を呼ぶ関数。
  const targets = useRef(new Map());
  // ゲート判定用に、ステップ開始時点の件数を控える
  const atStep = useRef({ journals: 0, accounts: 0 });

  const steps = TOURS[tourId]?.steps || [];
  const step = steps[index] || null;
  const last = index >= steps.length - 1;

  const register = useCallback((key, measure) => {
    if (measure) targets.current.set(key, measure);
    else targets.current.delete(key);
  }, []);

  const stop = useCallback(() => { setTourId(null); setIndex(0); }, []);

  const start = useCallback((id) => {
    if (!TOURS[id]) return;
    setTourId(id);
    setIndex(0);
  }, []);

  const next = useCallback(() => setIndex((v) => Math.min(steps.length - 1, v + 1)), [steps.length]);
  const prev = useCallback(() => setIndex((v) => Math.max(0, v - 1)), []);
  const nextOrStop = useCallback(() => { if (last) stop(); else next(); }, [last, next, stop]);

  // ステップ開始：対象の画面へ移動し、件数を控える
  useEffect(() => {
    if (!step) return;
    if (step.route) router.push(step.route);
    atStep.current = { journals: journals.length, accounts: accounts.length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourId, index]);

  // 記帳したら自動で次へ
  useEffect(() => {
    if (step?.awaitJournal && journals.length > atStep.current.journals) next();
  }, [journals.length, step, next]);

  // 口座・科目を足したら自動で次へ
  useEffect(() => {
    if (step?.awaitAccount && accounts.length > atStep.current.accounts) next();
  }, [accounts.length, step, next]);

  // 対象の位置を測る。画面遷移の直後はまだ描画されていないので、見つかるまで少し粘る。
  // 見つからないまま諦めた場合は測らない。rect が null のままなら中央の吹き出しになる。
  const targetKey = step?.target;
  useEffect(() => {
    if (!targetKey) return undefined;

    let alive = true;
    let tries = 0;
    let timer;
    const find = () => {
      if (!alive) return;
      const measure = targets.current.get(targetKey);
      if (!measure) {
        if (tries++ < 40) timer = setTimeout(find, 100);
        return;
      }
      measure((r) => {
        if (!alive) return;
        // 画面に入っていて、まともな大きさがあるものだけを採る。
        // レイアウトが決まる前の measureInWindow は 0,0 を返すことがあり、
        // それを信じると画面の左上の何も無い所を指してしまう（実際に指した）。
        const { height: sh, width: sw } = Dimensions.get('window');
        const ok = r && r.width > 8 && r.height > 8
          && r.y >= 0 && r.x >= 0
          && r.y + r.height <= sh && r.x + r.width <= sw + 1;
        if (ok) setFound({ key: targetKey, rect: r });
        else if (tries++ < 40) timer = setTimeout(find, 120);
        // 見つからないまま尽きたら rect は null のまま。中央の吹き出しに落ちる。
      });
    };
    timer = setTimeout(find, 250); // 遷移アニメーションの分だけ待つ
    return () => { alive = false; clearTimeout(timer); };
  }, [tourId, index, targetKey]);

  // 今のステップで測ったものだけを使う。前のステップの位置が残って指し違えるのを防ぐ。
  const rect = found && found.key === targetKey ? found.rect : null;

  // 初回起動でのツアー。1度出したら記録して二度と自動では出さない。
  const maybeStartFirstRun = useCallback(async () => {
    try {
      if (await AsyncStorage.getItem(SEEN_KEY)) return;
      await AsyncStorage.setItem(SEEN_KEY, '1');
      start('firstRun');
    } catch {
      // 保存できなくてもツアー自体は出す。出ないより出た方がよい。
      start('firstRun');
    }
  }, [start]);

  const value = useMemo(() => ({
    tourId, step, index, total: steps.length, last, rect,
    start, stop, next, prev, nextOrStop, register, maybeStartFirstRun,
  }), [tourId, step, index, steps.length, last, rect, start, stop, next, prev, nextOrStop, register, maybeStartFirstRun]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * ツアーで指したい要素に付ける。
 *
 *   const ref = useTourTarget('networth');
 *   <View ref={ref} collapsable={false}>…</View>
 *
 * ⚠ collapsable={false} が要る。Android は中身だけの View を実体から消してしまい、
 * 消えた View は measureInWindow に応答しない。
 */
export function useTourTarget(key) {
  const ref = useRef(null);
  const tour = useTour();
  const register = tour?.register;

  useEffect(() => {
    if (!register) return undefined;
    register(key, (cb) => {
      const node = ref.current;
      if (!node || !node.measureInWindow) { cb(null); return; }
      node.measureInWindow((x, y, width, height) => cb({ x, y, width, height }));
    });
    return () => register(key, null);
  }, [key, register]);

  return ref;
}
