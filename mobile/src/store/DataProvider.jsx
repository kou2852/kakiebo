// 帳簿データの単一の入口。画面はここ以外の保存先を触らない。
// 書き込みは常にローカル(SQLite)へ即時反映し、未送信の操作をキューに積む。
// sync() がそれをサーバーの最新状態へ載せ直す（store/sync.js）。
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { clearPendingUpTo, listPending, readLocal, writeLocal } from '../db';
import { applyIntent, upsert, remove, replace } from '../db/intents';
import { emptyDataset } from '../db/defaults';
import { syncNow } from './sync';
import { clearDek, loadDek, saveDek } from '../crypto/dekStore';
import { useAuth } from './AuthProvider';

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

  // 意図を1つ適用して即座に保存する。UI は保存完了を待たない（オフライン前提のため）。
  const commit = useCallback((intent) => {
    setDataset((prev) => {
      const next = applyIntent(prev, intent);
      writeLocal(next, rev.current, intent)
        .then(refreshPending)
        .catch((e) => console.warn('保存に失敗:', e?.message));
      return next;
    });
  }, [refreshPending]);

  // サーバーから取り込んだ帳簿でローカルを丸ごと置き換える（読み取り専用の取り込み）。
  const replaceAll = useCallback(async (next, serverRev = 0) => {
    rev.current = serverRev;
    await writeLocal(next, serverRev, null);
    setDataset(next);
  }, []);

  // 未送信の操作をサーバーへ反映し、確定した状態でローカルを置き換える。
  const sync = useCallback(async (overrideDek) => {
    setSyncing(true);
    try {
      const pending = await listPending();
      const local = await readLocal();
      const r = await syncNow({ dek: overrideDek || dek, local: local.dataset, pending });
      rev.current = r.rev;
      await writeLocal(r.dataset, r.rev, null);
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
  }, [dek, refreshPending]);

  // オフライン中に溜めた操作を、接続が戻った時点で自動的に送る。
  // 手動同期を待たせるとユーザーは「保存されていない」と誤解するため。
  const syncRef = useRef(sync);
  useEffect(() => { syncRef.current = sync; }, [sync]);
  useEffect(() => {
    if (!signedIn) return;
    return NetInfo.addEventListener((state) => {
      if (!state.isConnected || !state.isInternetReachable) return;
      listPending().then((p) => {
        if (p.length) syncRef.current().catch(() => { /* 失敗はキューに残るので次の機会に再試行 */ });
      });
    });
  }, [signedIn]);

  const api = useMemo(() => ({
    save: (collection, item) => commit(upsert(collection, item)),
    del: (collection, id) => commit(remove(collection, id)),
    setAll: (collection, items) => commit(replace(collection, items)),
    replaceAll,
    sync,
    rememberDek,
    forgetDek,
  }), [commit, replaceAll, sync, rememberDek, forgetDek]);

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
