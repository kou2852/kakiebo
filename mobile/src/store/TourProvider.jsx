// 実画面をスポットライトで指して操作を誘導するツアー。Web 版 Onboarding/Tour.jsx の移植。
//
// Web は CSS セレクタで対象を探せるが、React Native にはそれが無い。
// 代わりに、指したい要素が自分を登録し、必要になったら measureInWindow で
// 画面座標を報告する仕組みにしている（useTourTarget）。
//
// 進行はハイブリッド。操作を伴うステップは「実際に操作したら自動で次へ」、
// それ以外は「次へ」を押して進む。説明を読むだけで終わらせないため。
// 設定のツアー（①〜⑤）は、ホームから設定のタブ・メニュー・追加・保存までを本人に押させる（2026-10-17 指示）。
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions } from 'react-native';
import { useFocusEffect, usePathname, useRouter } from 'expo-router';
import { TAB_TARGETS, TOURS, isInteractive, stepShown } from '../tours';
import { useData } from './DataProvider';
import { ScreenScroll, TourCover, TourPress, focusedScroll } from '../components/ui';

const Ctx = createContext(null);

// 測り直しの間隔（およそ 2 コマ）と、位置が止まったとみなすまでに同じ位置が続く回数
const FRAME = 32;
const STABLE = 3;

// 押させる段か（押したら自動で進む段）
const isAuto = (s) => !!(s && (s.awaitJournal || s.awaitAccount || s.awaitPath || s.awaitShown || s.awaitSave));
// target・awaitShown・awaitSave は1つでも配列でも書ける
const keysOf = (v) => (Array.isArray(v) ? v : v ? [v] : []);
// 'a|b' の候補を順に測り、最初に測れたもの（画面にあるもの）を返す測り方。どれも無ければ undefined。
// ⚠ 登録されているだけでは足りない。画面の関数の先頭で登録するので、編集の画面を開いていなくても登録はある（中身は測れない）
const firstMeasure = (map, joined) => {
  const list = joined.split('|').map((k) => map.get(k)).filter(Boolean);
  if (!list.length) return undefined;
  if (list.length === 1) return list[0];
  const measure = (cb) => {
    const tryAt = (i) => {
      if (i >= list.length) { cb(null); return; }
      list[i]((r) => (r ? cb(r) : tryAt(i + 1)));
    };
    tryAt(0);
  };
  measure.reveal = (r) => list.find((m) => m.reveal)?.reveal(r);
  return measure;
};
export const useTour = () => useContext(Ctx);

// ステップが出てからゲートを構えるまでの待ち時間。
// 画面遷移や同期の完了で件数が動くのを「ユーザーが操作した」と取り違えないための間。
const ARM_DELAY = 700;

export function TourProvider({ children }) {
  const router = useRouter();
  const data = useData();
  const { journals, accounts } = data;
  const pathname = usePathname();
  // 構えるときに使う最新の値（setTimeout の中から今の値を読むため）
  // ⚠ 下のステップ開始の effect より前に置く（同じ描画で先に更新される）
  const latest = useRef({ data, pathname });
  useEffect(() => { latest.current = { data, pathname }; });

  const [tourId, setTourId] = useState(null);
  const [index, setIndex] = useState(0);
  // 測った位置は「どのステップのものか」と一緒に持つ。
  // ステップが変わったら古い位置を使わないだけでよく、状態を消しに行かなくて済む。
  const [found, setFound] = useState(null); // { key, rect }
  // 操作を待つ段の吹き出しが画面の下を覆う高さ（Tour.jsx が測って入れる）
  const [cover, setCover] = useState(0);

  // 指し示す対象の登録簿。key → measureInWindow を呼ぶ関数。
  const targets = useRef(new Map());
  // ゲート判定用に、ステップ開始時点の件数を控える
  const atStep = useRef(null);
  // ステップ開始時の画面。「この画面へ移ったら次へ」の判定に使う（構える前でも見る。素早く押されても取りこぼさない）
  const startPath = useRef(null);

  const steps = useMemo(() => TOURS[tourId]?.steps || [], [tourId]);
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
  // 戻るは、押させる段（タブ・メニュー・行・保存）をとばして、前の説明の段へ戻る（2026-10-18）。
  // 押させる段に戻っても、本人はもう押した先の画面にいるので、押すものが無く進めなかった
  const prev = useCallback(() => setIndex((v) => {
    let i = v - 1;
    while (i > 0 && (isAuto(steps[i]) || !stepShown(steps[i], latest.current.data))) i -= 1;
    return Math.max(0, i);
  }), [steps]);
  // 指定した段へ（「ほかの口座も入れる」で、口座を選ぶ段へ戻る、など）
  const goto = useCallback((key) => {
    const i = (TOURS[tourId]?.steps || []).findIndex((s) => s.key === key);
    if (i >= 0) setIndex(i);
  }, [tourId]);
  const nextOrStop = useCallback(() => { if (last) stop(); else next(); }, [last, next, stop]);
  // 押させる段を本人が押さずに「とばす」。画面を次の段に合わせてから進む（2026-10-18）。
  // 以前は「次へ」で段だけ進み、画面はそのまま。ホームのまま「『口座・カード』を押す」が出て、押す先が無かった。
  //   タブ・メニューの段 … その画面へ移ってから次の段へ
  //   一覧の行を押す段の次が「保存」の段 … 編集の画面が開いていないので、保存の段もとばす
  //   保存をとばしたら、続く「ほかの…も入れますか」（afterSave）もとばす。何も入れていないのに「ほかの」と聞かない
  const skip = useCallback(() => {
    if (!step) return;
    if (step.awaitPath) router.navigate(step.awaitPath);
    let i = index + 1;
    if (step.awaitShown && steps[i]?.awaitSave) i += 1;
    if (step.awaitShown || step.awaitSave) while (steps[i]?.afterSave) i += 1;
    if (i >= steps.length) stop();
    else setIndex(i);
  }, [step, steps, index, stop, router]);

  // ステップ開始：対象の画面へ移動し、少し置いてから件数を控える。
  //
  // ⚠ push ではなく navigate。同じ経路を push すると画面が重なって増える。
  //   '/' を続けて2ステップ指すツアーがあり、push だとダッシュボードが二重になり、
  //   古い方が片付くときに新しい方の登録まで巻き添えで消えていた（＝指す先を見失う）。
  //
  // ⚠ 件数を控えるのを遅らせているのは、遷移直後や同期完了で件数が動くのを
  //   「ユーザーが操作した」と誤認して、読む前に次へ飛ぶのを防ぐため。
  useEffect(() => {
    if (!step) return undefined;
    // 今の帳簿では出さない段（when）は飛ばす。以降に出す段が無ければ終わる
    if (!stepShown(step, latest.current.data)) {
      let i = index + 1;
      while (i < steps.length && !stepShown(steps[i], latest.current.data)) i += 1;
      if (i >= steps.length) stop(); else setIndex(i);
      return undefined;
    }
    startPath.current = latest.current.pathname;
    if (step.route) router.navigate(step.route);
    atStep.current = null;
    const t = setTimeout(() => {
      const d = latest.current.data;
      atStep.current = { journals: d.journals.length, accounts: d.accounts.length };
    }, ARM_DELAY);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourId, index]);

  // 指した画面へ本人が移ったら次へ（タブ・メニューを押させる段）
  useEffect(() => {
    if (step?.awaitPath && pathname === step.awaitPath && startPath.current !== step.awaitPath) next();
  }, [pathname, step, next]);

  // 記帳・口座追加で自動的に次へ。構える前の変化では動かない。
  useEffect(() => {
    const base = atStep.current;
    if (!base) return;
    if (step?.awaitJournal && journals.length > base.journals) next();
    else if (step?.awaitAccount && accounts.length > base.accounts) next();
  }, [journals.length, accounts.length, step, next]);

  // 画面の「保存」が押された知らせ（tour.saved('wallet') など）。待っている段なら次へ。キャンセルでは呼ばれない。
  // ⚠ 帳簿の中身の変化では見ない。同期で読み直すと配列が作り直されて保存前に進み（実測）、
  //   中身で比べると、変えずに保存したときに進まなかった（実測）
  // ツアーが指しているタブ・メニューを押した（2026-10-18）。画面が移るのを待たずに次の段へ進む。
  // 以前は移った先の画面が描き終わって pathname が変わるまで（デバッグ版で約 1 秒）前の段の吹き出しが残っていた
  const pressed = useCallback((key) => {
    if (key && step?.awaitPath && keysOf(step.target).includes(key)) next();
  }, [step, next]);
  const saved = useCallback((name) => { if (keysOf(step?.awaitSave).includes(name)) next(); }, [step, next]);

  // 指した要素が画面に出たら次へ（「口座を押す」で編集の画面が開いた、など）。
  // いったん出ていない状態を見てから。戻るで来た段で、出たままの画面に即座に進まないため。
  const shownKey = keysOf(step?.awaitShown).join('|');
  useEffect(() => {
    if (!shownKey) return undefined;
    let alive = true;
    let seenHidden = false;
    const poll = () => {
      const measure = firstMeasure(targets.current, shownKey);
      const done = (r) => {
        if (!alive) return;
        // 画面にあれば出たとみなす（下の方でスクロールしないと見えなくてもよい。カードの編集は「保存」が画面の外にある）
        const vis = r && r.width > 0 && r.height > 0;
        if (!vis) seenHidden = true;
        else if (seenHidden) { next(); return; }
        timer = setTimeout(poll, 300);
      };
      if (measure) measure(done); else done(null);
    };
    let timer = setTimeout(poll, 0);
    return () => { alive = false; clearTimeout(timer); };
  }, [tourId, index, shownKey, next]);

  // 対象の位置を測る（2026-10-18 に速くした。以前は最初に 0.4 秒待ち、スクロールのたびに 0.35 秒待っていた）。
  //
  // ⚠ 画面の切り替えの動きの途中に measureInWindow を呼ぶと、まだ最終位置に来ていない座標が返る
  //   （実測: 勘定科目画面の「勘定科目を追加」が y=20dp と報告された。正しくは 130dp 付近）。
  //   以前はこれを避けるために一律 0.4 秒待っていた。いまは 1 コマごとに測り、同じ位置が STABLE 回続いたら止まったとみなす。
  //   待つのは本当に動いている間だけで済む。下のタブ（帯）は切り替えで動かないので、1 回で採る。
  //   見つけた後も間を置いて測り直し、ずれていれば直す（スクロールで動いても追える）。
  const targetKey = keysOf(step?.target).join('|');
  useEffect(() => {
    if (!targetKey) return undefined;

    let alive = true;
    let tries = 0;
    const timers = [];
    const at = (ms, fn) => timers.push(setTimeout(fn, ms));

    const fixed = keysOf(step?.target).every((k) => TAB_TARGETS.includes(k));
    let last = null;      // 前回測った位置
    let same = 0;         // 同じ位置が続いた回数
    let found = false;    // 一度でも出したか（出した後は、測り直しを間を置いて行う）
    // 見える所まで送るのは3回まで。送っても位置が変わらなければ（それ以上送れない）、そこでやめる
    let reveals = 0;
    let revealedFrom = null;
    const cur = TOURS[tourId]?.steps[index];
    // reveal: true の段は、操作を待たない説明の段でも、下の方にある対象を送る（吹き出し・広告・タブバーの裏に隠れるため）
    const gatedStep = isInteractive(cur) || !!cur?.reveal;
    // 「保存」を押させる段は送らない。フォームは上から入れるので、保存まで送ると入れる欄が画面の上へ消える（実測）。
    // 入れながら下へ送れば、保存のところで枠が出る
    // reveal: true の段は、保存の段でも指す先まで送る（記帳の費目・支払方法の欄は、吹き出しの裏に隠れて押せないため）
    const canReveal = (!cur?.awaitSave && !cur?.awaitJournal) || !!cur?.reveal;
    // 対象が無くなった（操作で別の画面に変わった）ら、測った位置を捨てる。残すと別の物を囲む
    const lose = () => { found = false; setFound((p) => (p && p.key === targetKey ? null : p)); };
    const near = (p, q) => p && q && Math.abs(p.x - q.x) < 1 && Math.abs(p.y - q.y) < 1
      && Math.abs(p.width - q.width) < 1 && Math.abs(p.height - q.height) < 1;

    const take = () => {
      if (!alive) return;
      const measure = firstMeasure(targets.current, targetKey);
      if (!measure) {
        lose();
        last = null; same = 0;
        at(tries++ < 90 ? FRAME : 500, take);
        return;
      }
      measure((r) => {
        if (!alive) return;
        // 要素が画面から消えた（保存して編集の画面が閉じた、など）。枠を残すと何も無い所を囲む
        if (!r) { lose(); last = null; same = 0; at(tries++ < 90 ? FRAME : 500, take); return; }
        // 位置が止まるまで待つ（下のタブは待たない）
        same = near(r, last) ? same + 1 : 0;
        last = r;
        if (!fixed && same < STABLE - 1) { at(FRAME, take); return; }

        // 画面に入っていて、まともな大きさがあるものだけを採る。
        const { height: sh, width: sw } = Dimensions.get('window');
        // 画面より高い対象（口座が多いときの一覧など）は、上端が見えていれば採る。はみ出した分は枠を切る（Tour.jsx）
        const tall = r.height > sh * 0.6;
        const ok = r.width > 8 && r.height > 8
          && r.y >= 0 && r.x >= 0 && r.x + r.width <= sw + 1
          && (r.y + r.height <= sh || (tall && r.y < sh * 0.5));
        // 操作を待つ段は、対象が画面の下の方だと吹き出しに隠れる。上の方まで送る。
        // 画面より高い対象は、上端が上の方にあれば送らない（何度送っても下端は入らない。以前は 3 回送り続けて 1 秒遅れた）
        const low = ok && gatedStep && (tall ? r.y > sh * 0.4 : r.y + r.height > sh * 0.6);
        // 送っても位置が変わらなかったら、それ以上は送れない
        if (revealedFrom && Math.abs(revealedFrom.y - r.y) < 1) reveals = 3;
        const reveal = canReveal && reveals < 3 && measure.reveal;
        if (ok && !(low && reveal)) {
          // 変わったときだけ更新する。測り直しは続くので、毎回入れると描き直しが止まらない。
          // 測った画面も一緒に持つ。画面が移ったら、測り直しを待たずに枠を消す（前の画面の位置に枠が残り、移った先の別の物を囲んでいた）
          const path = latest.current.pathname;
          setFound((prevFound) => {
            const q = prevFound && prevFound.key === targetKey && prevFound.path === path ? prevFound.rect : null;
            return near(q, r) ? prevFound : { key: targetKey, rect: r, path };
          });
          // 出した直後は早めに測り直して、ずれていればすぐ直す。その後は間を置いて追う
          at(found ? 450 : 150, take);
          found = true;
        } else if (reveal) {
          // 画面の外（ホームを並べ替えて下にある等）や吹き出しに隠れる所なら、見える所までスクロールしてから測り直す。
          // スクロールは動きなしで一気に送るので、次のコマで位置が決まる
          reveals += 1;
          revealedFrom = r;
          measure.reveal(r);
          same = 0;
          at(FRAME, take);
        } else {
          // 画面の外にある間は枠を出さない（前の位置に残すと別の物を囲む）。本人がスクロールして入ったら出す
          if (!ok) lose();
          at(tries++ < 90 ? FRAME * 3 : 500, take);
        }
      });
    };

    take();
    return () => { alive = false; timers.forEach(clearTimeout); };
    // step は tourId と index で決まる
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourId, index, targetKey]);

  // 今のステップで測ったものだけを使う。前のステップの位置が残って指し違えるのを防ぐ。
  const rect = found && found.key === targetKey && found.path === pathname ? found.rect : null;

  // when で出さない段は、出さない（飛ぶまでの一瞬も描かない）。「n / 全体」は出す段だけで数える
  const shownSteps = useMemo(() => steps.filter((s) => stepShown(s, data)), [steps, data]);
  const hidden = !!step && !shownSteps.includes(step);
  const pos = Math.max(0, shownSteps.indexOf(step));

  const value = useMemo(() => ({
    tourId, step: hidden ? null : step, index, pos, total: shownSteps.length, last, rect,
    start, stop, next, prev, nextOrStop, register, setCover, saved, goto, skip, pressed,
  }), [tourId, step, hidden, index, pos, shownSteps.length, last, rect, start, stop, next, prev, nextOrStop, register, saved, goto, skip, pressed]);

  return (
    <Ctx.Provider value={value}>
      <TourCover.Provider value={tourId ? cover : 0}>
        <TourPress.Provider value={tourId ? pressed : null}>{children}</TourPress.Provider>
      </TourCover.Provider>
    </Ctx.Provider>
  );
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
export function useTourTarget(key, { fixed = false } = {}) {
  const ref = useRef(null);
  // 表に出ている画面の要素だけを指す。タブの画面は裏に回っても消えずに残るので、測ると見えているかのような位置が返り、
  // 別の画面の上に枠を出していた（実測。設定のメニューの枠がホームに出て、ホームが勝手にスクロールした）
  const focused = useRef(true);
  useFocusEffect(useCallback(() => {
    focused.current = true;
    return () => { focused.current = false; };
  }, []));
  const tour = useTour();
  const register = tour?.register;
  // 入っている画面のスクロール（Screen）。画面の外にあるとき、見える所まで送るのに使う
  const scroller = useContext(ScreenScroll);

  useEffect(() => {
    if (!register) return undefined;
    const measure = (cb) => {
      const node = ref.current;
      if (!node || !node.measureInWindow || !focused.current) { cb(null); return; }
      node.measureInWindow((x, y, width, height) => cb({ x, y, width, height }));
    };
    // fixed はスクロールしない所（タブバー）。送ると表の画面が無駄に動く
    if (!fixed) measure.reveal = (r) => (scroller || focusedScroll.current)?.scrollBy(r.y - Dimensions.get('window').height * 0.3);
    register(key, measure);
    ref.tourKey = key; // 押したときに TourPress へ渡す（MenuList）
    // 自分が入れた関数のときだけ消す（同じ key の二重登録を巻き添えにしない）
    return () => register(key, null, measure);
  }, [key, register, scroller, fixed]);

  return ref;
}
