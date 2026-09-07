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

// ステップが出てからゲートを構えるまでの待ち時間。
// 画面遷移や同期の完了で件数が動くのを「ユーザーが操作した」と取り違えないための間。
const ARM_DELAY = 700;

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
  const atStep = useRef(null);

  const steps = TOURS[tourId]?.steps || [];
  const step = steps[index] || null;
  const last = index >= steps.length - 1;

  // 同じ画面が重なって開かれると、同じ key の要素が二つ登録される。
  // 先にマウントした方が後から片付くと、後から登録した生きている方まで消えてしまう。
  // 消すのは「自分が入れた関数がまだ入っているとき」だけにする。
  const register = useCallback((key, measure, mine) => {
    if (measure) targets.current.set(key, measure);
    else if (!mine || targets.current.get(key) === mine) targets.current.delete(key);
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

  // ステップ開始：対象の画面へ移動し、少し置いてから件数を控える。
  //
  // ⚠ push ではなく navigate。同じ経路を push すると画面が重なって増える。
  //   firstRun は '/' を続けて2ステップ指すので、push だとダッシュボードが二重になり、
  //   古い方が片付くときに新しい方の登録まで巻き添えで消えていた（＝指す先を見失う）。
  //
  // ⚠ 件数を控えるのを遅らせているのは、遷移直後や同期完了で件数が動くのを
  //   「ユーザーが操作した」と誤認して、読む前に次へ飛ぶのを防ぐため。
  useEffect(() => {
    if (!step) return undefined;
    if (step.route) router.navigate(step.route);
    atStep.current = null;
    const t = setTimeout(() => {
      atStep.current = { journals: journals.length, accounts: accounts.length };
    }, ARM_DELAY);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourId, index]);

  // 記帳・口座追加で自動的に次へ。構える前の変化では動かない。
  useEffect(() => {
    const base = atStep.current;
    if (!base) return;
    if (step?.awaitJournal && journals.length > base.journals) next();
    else if (step?.awaitAccount && accounts.length > base.accounts) next();
  }, [journals.length, accounts.length, step, next]);

  // 対象の位置を測る。
  //
  // ⚠ 最初に得た値を信じてはいけない。画面遷移のアニメーション中に measureInWindow を
  // 呼ぶと、まだ最終位置へ配置される前の座標が返る。実測では、勘定科目画面の
  // 「勘定科目を追加」が y=20dp と報告された（正しくは 130dp 付近）。x=13dp は画面の
  // 余白と一致していたので、ScrollView の内側での位置をそのまま返していたと分かる。
  //
  // そこで、見つかった後も間を置いて測り直し、最後の値を使う。
  const targetKey = step?.target;
  useEffect(() => {
    if (!targetKey) return undefined;

    let alive = true;
    let tries = 0;
    const timers = [];
    const at = (ms, fn) => timers.push(setTimeout(fn, ms));

    const take = () => {
      if (!alive) return;
      const measure = targets.current.get(targetKey);
      if (!measure) {
        if (tries++ < 40) at(100, take);
        return;
      }
      measure((r) => {
        if (!alive) return;
        // 画面に入っていて、まともな大きさがあるものだけを採る。
        const { height: sh, width: sw } = Dimensions.get('window');
        const ok = r && r.width > 8 && r.height > 8
          && r.y >= 0 && r.x >= 0
          && r.y + r.height <= sh && r.x + r.width <= sw + 1;
        if (ok) {
          // 変わったときだけ更新する。測り直しは続くので、毎回入れると描き直しが止まらない。
          setFound((prevFound) => {
            const q = prevFound && prevFound.key === targetKey ? prevFound.rect : null;
            const same = q && Math.abs(q.x - r.x) < 1 && Math.abs(q.y - r.y) < 1
              && Math.abs(q.width - r.width) < 1 && Math.abs(q.height - r.height) < 1;
            return same ? prevFound : { key: targetKey, rect: r };
          });
          // 遷移が落ち着いてからもう一度。スクロールで動いても追える。
          at(450, take);
        } else if (tries++ < 40) {
          at(120, take);
        }
      });
    };

    at(400, take);
    return () => { alive = false; timers.forEach(clearTimeout); };
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
    const measure = (cb) => {
      const node = ref.current;
      if (!node || !node.measureInWindow) { cb(null); return; }
      node.measureInWindow((x, y, width, height) => cb({ x, y, width, height }));
    };
    register(key, measure);
    // 自分が入れた関数のときだけ消す（同じ key の二重登録を巻き添えにしない）
    return () => register(key, null, measure);
  }, [key, register]);

  return ref;
}
