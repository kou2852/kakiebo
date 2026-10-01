// 帳簿データの単一の入口。画面はここ以外の保存先を触らない。
// 書き込みは常にローカル(SQLite)へ即時反映し、未送信の操作をキューに積む。
// sync() がそれをサーバーの最新状態へ載せ直す（store/sync.js）。
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { clearPendingUpTo, listPending, loadIdMap, readLocal, rememberId, writeLocal } from '../db';
import { applyIntent, upsert, remove, replace } from '../db/intents';
import { emptyDataset } from '../db/defaults';
import { syncNow } from './sync';
import { readOnboardingIds } from './onboardingMark';
import { clearDek, loadDek, saveDek } from '../crypto/dekStore';
import { useAuth } from './AuthProvider';
import { rollbackNextDate } from '../utils/autoGen';

const Ctx = createContext(null);
export const useData = () => useContext(Ctx);

export function DataProvider({ children }) {
  const { env, signedIn } = useAuth();
  const [dek, setDekState] = useState(null); // 解錠済みデータ鍵。メモリと Keychain のみ。
  const [dataset, setDataset] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(null); // { at, notes } | { error }
  const rev = useRef(0);

  const refreshPending = useCallback(async () => setPendingCount((await listPending()).length), []);

  useEffect(() => {
    (async () => {
      const local = await readLocal();
      if (local) {
        rev.current = local.rev;
        setDataset(local.dataset);
      } else {
        const seed = emptyDataset();
        await writeLocal(seed, 0, null); // 初期投入は「操作」ではないのでキューに積まない
        setDataset(seed);
      }
      refreshPending();
    })();
  }, [refreshPending]);

  useEffect(() => { loadDek(env).then(setDekState); }, [env]);

  // 解錠した鍵を端末に預ける。次回起動からパスフレーズ入力が不要になる。
  const rememberDek = useCallback(async (k) => { setDekState(k); await saveDek(env, k); }, [env]);
  const forgetDek = useCallback(async () => { setDekState(null); await clearDek(env); }, [env]);

  // 変更のあとに自動同期を予約する。実体は下の autoSync（定義順の都合で ref 経由）。
  // 一括編集のように連続で積まれる場合をまとめたいので、少し待ってから走らせる。
  const autoSyncRef = useRef(null);
  const flushTimer = useRef(null);
  const [scheduleSync] = useState(() => () => {
    if (flushTimer.current) clearTimeout(flushTimer.current);
    flushTimer.current = setTimeout(() => { flushTimer.current = null; autoSyncRef.current?.(); }, 1500);
  });
  useEffect(() => () => { if (flushTimer.current) clearTimeout(flushTimer.current); }, []);

  /**
   * 端末への書き込みを直列化する。
   *
   * ⚠ writeLocal は withTransactionAsync を使う。同じ接続で重ねると
   *   「cannot start a transaction within a transaction」で片方が落ち、
   *   その意図が失われる。commit は完了を待たないので、1つの操作で save を
   *   2回以上呼ぶと後の分が消える。
   *
   *   実際、「科目＋開始残高の仕訳＋口座」を1操作で作る画面で、仕訳と口座が
   *   永続化されなかった。画面には反映されるので（メモリ上は正しい）、
   *   アプリを再起動するまで気づけない。失敗は console.warn に消えていた。
   */
  const writeChain = useRef(Promise.resolve());
  const queueWrite = useCallback((fn) => {
    const next = writeChain.current.then(fn, fn);
    writeChain.current = next.catch(() => {});
    return next;
  }, []);

  // 意図を1つ適用して即座に保存する。UI は保存完了を待たない（オフライン前提のため）。
  const commit = useCallback((intent) => {
    setDataset((prev) => {
      const next = applyIntent(prev, intent);
      queueWrite(() => writeLocal(next, rev.current, intent))
        .then(() => { refreshPending(); scheduleSync(); })
        .catch((e) => console.warn('保存に失敗:', e?.message));
      return next;
    });
  }, [queueWrite, refreshPending, scheduleSync]);

  /**
   * 複数の意図をまとめて積む。**積み終わってから解決する。**
   *
   * ⚠ commit は setDataset の中で writeLocal を投げっぱなしにするので、直後に
   *   sync すると「まだ積まれていない意図」を置き去りにしたまま同期が走り、
   *   その戻り（サーバーの内容）で端末が上書きされて消える。
   *   同期の前に確実に積みたい場所では必ずこちらを使う。
   */
  const commitAll = useCallback(async (intents) => {
    if (!intents.length) return;
    let cur = (await readLocal())?.dataset || emptyDataset();
    for (const intent of intents) {
      cur = applyIntent(cur, intent);
      await queueWrite(() => writeLocal(cur, rev.current, intent));
    }
    setDataset(cur);
    await refreshPending();
  }, [queueWrite, refreshPending]);

  // サーバーから取り込んだ帳簿でローカルを丸ごと置き換える（読み取り専用の取り込み）。
  const replaceAll = useCallback(async (next, serverRev = 0) => {
    rev.current = serverRev;
    await queueWrite(() => writeLocal(next, serverRev, null));
    setDataset(next);
  }, [queueWrite]);

  // 未送信の操作をサーバーへ反映し、確定した状態でローカルを置き換える。
  const runSync = useCallback(async (overrideDek) => {
    setSyncing(true);
    try {
      const pending = await listPending();
      const local = await readLocal();
      const idMap = await loadIdMap();
      const r = await syncNow({ dek: overrideDek || dek, local: local.dataset, pending, idMap, rememberId });
      rev.current = r.rev;
      await queueWrite(() => writeLocal(r.dataset, r.rev, null));
      await clearPendingUpTo(r.upTo);
      setDataset(r.dataset);
      await refreshPending();
      setLastSync({ at: Date.now(), notes: r.notes });
      return r;
    } catch (e) {
      setLastSync({ at: Date.now(), error: e?.message || String(e) });
      throw e;
    } finally {
      setSyncing(false);
    }
  }, [dek, queueWrite, refreshPending]);

  /**
   * 同期を直列化する。
   *
   * ⚠ ログイン直後は autoSync と接続画面の同期が同時に走る。並行して走ると、
   *   両方が同じ未送信を「サーバーに無い」と判断して二重に作る。実測で
   *   科目1件・仕訳1件が5件ずつに増えた。後から来たものは前を待たせる。
   */
  const syncChain = useRef(Promise.resolve());
  const sync = useCallback((overrideDek) => {
    const run = syncChain.current.then(
      () => runSync(overrideDek),
      () => runSync(overrideDek)
    );
    syncChain.current = run.catch(() => {});
    return run;
  }, [runSync]);

  // 未送信の操作を自動で送る。
  //
  // きっかけは3つ: 記帳などの変更のあと・アプリを前面に戻したとき・通信が復活したとき。
  // 以前は通信の復活だけを見ていたが、NetInfo は「状態が変わったとき」しか発火しない。
  // つないだままだとイベントが一度も来ず、手動で同期するまで送られないままだった。
  // 呼ばれるのは常にイベントの中なので、最新値は ref 経由で読む。
  const syncRef = useRef(sync);
  const syncingRef = useRef(false);
  const signedInRef = useRef(signedIn);
  const failedAt = useRef(0);
  useEffect(() => { syncRef.current = sync; }, [sync]);
  useEffect(() => { syncingRef.current = syncing; }, [syncing]);
  useEffect(() => { signedInRef.current = signedIn; }, [signedIn]);

  const [autoSync] = useState(() => async (force) => {
    if (!signedInRef.current || syncingRef.current) return;
    // ⚠ オンボーディングの書き込みは、ログイン時の判定（connect.jsx の reconcile）が済むまで送らない。
    //   ログインが成立した瞬間にここが走るので、既にアカウントを持っている人の帳簿へ
    //   「現金・銀行口座・クレジットカード」が入っていた（2026-09-19）。
    //   印は判定側で必ず消える（捨てる・送る・3択のいずれでも）。
    if ((await readOnboardingIds()).length) return;
    // 失敗した直後に何度も叩かない。解錠待ちや通信断はすぐには直らない。
    if (!force && failedAt.current && Date.now() - failedAt.current < 60_000) return;
    if (!(await listPending()).length) return;
    try {
      await syncRef.current();
      failedAt.current = 0;
    } catch {
      // 失敗してもキューは残る。次の変更・前面復帰・通信復活で再試行する。
      failedAt.current = Date.now();
    }
  });

  useEffect(() => { autoSyncRef.current = autoSync; }, [autoSync]);

  // 前面に戻ったとき（別端末で編集した内容の取り込みも兼ねる）と、通信が復活したとき。
  useEffect(() => {
    if (!signedIn) return undefined;
    autoSync(true);
    const app = AppState.addEventListener('change', (s) => { if (s === 'active') autoSync(true); });
    const net = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable) autoSync(true);
    });
    return () => { app.remove(); net(); };
  }, [signedIn, autoSync]);

  const api = useMemo(() => ({
    save: (collection, item) => commit(upsert(collection, item)),
    commitAll,
    del: (collection, id) => {
      // 定期取引で生成した仕訳を消したら、その定期取引の次回予定日をその日へ戻す（ウェブ版と同じ）。
      // 期日の計算は nextDate から数えるので、戻さないと消した分が再生成されない。
      if (collection === 'journals' && dataset) {
        const before = dataset.recurring || [];
        const rolled = rollbackNextDate(before, (dataset.journals || []).find((j) => j.id === id));
        const changed = rolled.filter((r, i) => r !== before[i]);
        if (changed.length) return commitAll([remove('journals', id), ...changed.map((r) => upsert('recurring', r))]);
      }
      return commit(remove(collection, id));
    },
    setAll: (collection, items) => commit(replace(collection, items)),
    replaceAll,
    sync,
    rememberDek,
    forgetDek,
  }), [commit, commitAll, replaceAll, sync, rememberDek, forgetDek, dataset]);

  const value = useMemo(() => ({
    loading: dataset === null,
    pendingCount, syncing, lastSync,
    unlocked: !!dek,
    dek, // 暗号化の管理画面が再ラップに使う。サーバーへは送らない。
    ...(dataset || emptyDataset()),
    ...api,
  }), [dataset, pendingCount, syncing, lastSync, dek, api]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
