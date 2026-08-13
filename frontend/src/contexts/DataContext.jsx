import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from './AuthContext';
import * as api from '../api/client';
import { rollbackNextDate } from '../utils/autoGen';
import { hasEncryption, loadEncrypted, saveEncrypted, enableEncryption as csEnable, unlockLocal, recoverLocal, changeLocalPassphrase, disableEncryption as csDisable } from '../utils/cryptoStore';
import { setupEncryption, unlock as cryptoUnlock, recover as cryptoRecover, changePassphrase as cryptoChangePass, regenerateRecovery as regenRecovery, seal as cryptoSeal, open as cryptoOpen } from '../utils/crypto';
import { readBundle, writeBundle, readCipher, clearEncryption } from '../utils/cryptoStore';
import { saveDek, loadDek, clearDek } from '../utils/dekStore';
import { track, trackOnce } from '../utils/track';
import { DEFAULT_ACCOUNTS, DEFAULT_PRESETS, planGuestMigration } from '../utils/guestMigration';

const DataContext = createContext(null);

const STORAGE_KEY = 'kk4';
const GUEST_KEY = 'kk4_guest'; // ゲストのデータは通常の kk4 と分離して保存

// 解錠できないまま持ち出すバックアップの識別子。インポート時にこれで平文JSONと見分ける。
export const ENC_BACKUP_TYPE = 'kurofukubo-encrypted-backup';


function loadLocal(key = STORAGE_KEY) {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const s = JSON.parse(raw);
      return {
        accounts: s.accounts || DEFAULT_ACCOUNTS,
        journals: s.journals || [],
        tags: s.tags || [],
        allocs: s.allocs || [],
        wallets: s.wallets || [],
        presets: s.presets || [],
        budgets: s.budgets || [],
        recurring: s.recurring || [],
        rules: s.rules || [],
      };
    }
  } catch {}
  return {
    accounts: [...DEFAULT_ACCOUNTS],
    journals: [], tags: [], allocs: [], wallets: [],
    presets: [], budgets: [], recurring: [], rules: [],
  };
}

function saveLocal(state, key = STORAGE_KEY) {
  try { localStorage.setItem(key, JSON.stringify(state)); } catch {}
}

/**
 * 他端末が先に保存していたとき（409）、サーバーの最新一覧に「ユーザーがした操作」を載せ直す。
 * 呼び出し元は1件のupsert/deleteをしているので、その意図さえ渡せば入力値は失われない。
 * 別の項目を触っていた場合は両方残る。同じ項目を同時に編集した場合だけ、後から保存した側が残る。
 */
function applyIntent(list, intent) {
  if (!intent) return list;
  if (intent.op === 'delete') return list.filter((x) => x.id !== intent.id);
  if (intent.op === 'upsert') {
    const i = list.findIndex((x) => x.id === intent.item.id);
    return i >= 0 ? list.map((x, n) => (n === i ? { ...x, ...intent.item } : x)) : [...list, intent.item];
  }
  // 予算は科目ごとの入力フォーム。ユーザーが触った科目だけ載せ替える（0=予算なし＝削除）。
  // 触っていない科目は他端末が設定した値をそのまま残す。
  if (intent.op === 'budgets') {
    const touched = intent.changed;
    return [
      ...list.filter((b) => !(b.accountId in touched)),
      ...Object.entries(touched).filter(([, amount]) => amount > 0).map(([accountId, amount]) => ({ accountId, amount })),
    ];
  }
  return list;
}

export function DataProvider({ children }) {
  const { isAuthenticated, devMode, guestMode } = useAuth();

  const [accounts, setAccounts] = useState([]);
  const [journals, setJournals] = useState([]);
  const [tags, setTags] = useState([]);
  const [wallets, setWallets] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [presets, setPresets] = useState([]);
  const [recurring, setRecurring] = useState([]);
  const [rules, setRules] = useState([]);
  const [allocs, setAllocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [useLocal, setUseLocal] = useState(false);
  // 全置換保存するコレクションの版番号。他端末が先に保存していれば 409 で弾かれる。
  // 既存ユーザーはマーカー未作成＝0 から始まる（サーバー側でバックフィル不要）。
  const revs = useRef({ budgets: 0, presets: 0, recurring: 0, rules: 0 });
  const encRev = useRef(0);
  // 暗号化データが他端末と競合し、サーバーへ保存できていない状態
  const [encConflict, setEncConflict] = useState(false);
  // E2E（端末側）暗号化。useLocal（ゲスト/開発/フォールバック）時のみ有効。既定OFF・後方互換。
  const [dek, setDek] = useState(null);            // 解錠中のデータ鍵（メモリのみ・サーバー非送信）
  const [encEnabled, setEncEnabled] = useState(false); // このストレージが暗号化済みか
  const [encLocked, setEncLocked] = useState(false);   // 暗号化済みだが未解錠
  const [encBundle, setEncBundle] = useState(null);    // 鍵バンドル（APIモードの再保存用。平文鍵なし）
  const [recoverySaved, setRecoverySaved] = useState(() => { try { return localStorage.getItem('kk_recovery_saved') === '1'; } catch { return false; } });
  const markRecoverySaved = useCallback(() => { try { localStorage.setItem('kk_recovery_saved', '1'); } catch {} setRecoverySaved(true); }, []);

  const applyDataset = useCallback((d) => {
    setAccounts(d.accounts || []); setJournals(d.journals || []); setTags(d.tags || []);
    setWallets(d.wallets || []); setBudgets(d.budgets || []); setPresets(d.presets && d.presets.length ? d.presets : [...DEFAULT_PRESETS]);
    setRecurring(d.recurring || []); setRules(d.rules || []); setAllocs(d.allocs || []);
    // サーバーから読んだときは版番号も受け取る（ローカル/バックアップ復元時は入っていない）
    if (d.revs) revs.current = { ...revs.current, ...d.revs };
  }, []);

  // ローカル読み込み（暗号化対応）。暗号化済み・未解錠ならデータは読まず解錠待ちにする。
  const loadLocalEncAware = useCallback(async (key) => {
    setUseLocal(true);
    if (hasEncryption(key)) {
      setEncEnabled(true);
      const k = dek || await loadDek(key); // 端末に保持した鍵があれば自動解錠（パス入力不要）
      if (!k) { setEncLocked(true); setLoading(false); return; }
      try {
        applyDataset((await loadEncrypted(key, k)) || loadLocal(key));
        setDek(k); setEncLocked(false);
      } catch { await clearDek(key); setEncLocked(true); } // 鍵不一致→破棄して解錠待ち
      setLoading(false);
      return;
    }
    setEncEnabled(false);
    applyDataset(loadLocal(key));
    setEncLocked(false);
    setLoading(false);
  }, [dek, applyDataset]);

  // 解錠済み鍵を端末(IndexedDB)に保持＝次回オープン時にパス入力を不要にする
  useEffect(() => {
    if (!dek || !encEnabled) return;
    const name = useLocal ? (guestMode ? GUEST_KEY : STORAGE_KEY) : 'api';
    saveDek(name, dek);
  }, [dek, encEnabled, useLocal, guestMode]);

  // 永続化。useLocal=localStorage（暗号化時は封緘）／API＋暗号化有効なら /api/encdata へ封緘保存。
  useEffect(() => {
    if (loading || encLocked) return;
    const dataset = { accounts, journals, tags, allocs, wallets, presets, budgets, recurring, rules };
    if (useLocal) {
      const key = guestMode ? GUEST_KEY : STORAGE_KEY;
      if (dek) saveEncrypted(key, dek, dataset).catch((e) => console.warn('暗号化保存に失敗:', e?.message));
      else saveLocal(dataset, key);
    } else if (encEnabled && dek) {
      cryptoSeal(dek, dataset)
        .then((ct) => api.encdata.save({ bundle: encBundle, ct, rev: encRev.current }))
        .then((r) => { encRev.current = r.rev; setEncConflict(false); })
        .catch((e) => {
          // 409＝他端末が先に保存していた。上書きすると相手の記帳が消えるので書かない。
          // 手元のデータはメモリに残っているため、利用者に知らせて判断してもらう。
          // E2Eなのでサーバーでは統合できず、突き合わせはクライアントでしか行えない。
          if (e?.status === 409) { setEncConflict(true); return; }
          console.warn('暗号化保存(API)に失敗:', e?.message);
        });
    }
  }, [useLocal, loading, encLocked, dek, encEnabled, encBundle, guestMode, accounts, journals, tags, allocs, wallets, presets, budgets, recurring, rules]);

  // 初回ロード
  useEffect(() => {
    // ユーザー切り替え時、前ユーザーのデータ/復号鍵が新セッションの取得完了まで残らないよう即座に破棄する
    setLoading(true);
    applyDataset({});
    setDek(null); setEncEnabled(false); setEncLocked(false); setEncBundle(null);

    if (!isAuthenticated) { setLoading(false); return; }
    if (guestMode) { loadLocalEncAware(GUEST_KEY); return; }
    if (devMode) { loadLocalEncAware(STORAGE_KEY); return; }

    // 本番: APIから読む
    (async () => {
      try {
        // E2E暗号化が有効なら暗号文を取得（取得失敗時は通常ロードへフォールバック）。
        // ゲスト移行の可否判定にも使うため、移行より先に取得する。
        let ed = null;
        try { ed = await api.encdata.get(); encRev.current = ed?.rev || 0; } catch { ed = null; }

        // ゲスト登録直後の移行。暗号化ゲストは（解錠済みdekで）復号して移行する。
        // 既存アカウントへ流し込むと利用者の科目が既定名に戻るため、新規のときだけ実行する。
        let g = null;
        const guestRaw = localStorage.getItem(GUEST_KEY);
        if (guestRaw) { try { g = JSON.parse(guestRaw); } catch {} }
        else if (hasEncryption(GUEST_KEY) && dek) { try { g = await loadEncrypted(GUEST_KEY, dek); } catch {} }
        // served は判定のために取得した内容。移行しなければそのまま初期表示に使う
        const plan = await planGuestMigration({
          guest: g, encBundle: ed?.bundle, fetchServer: () => api.data.exportAll(),
        });
        let served = plan.served;
        if (plan.migrate) await api.data.importAll(plan.payload);
        localStorage.removeItem(GUEST_KEY);
        localStorage.removeItem(`${GUEST_KEY}__enc`);
        localStorage.removeItem(`${GUEST_KEY}__encmeta`);

        if (ed && ed.bundle) {
          setEncEnabled(true); setEncBundle(ed.bundle);
          const k = dek || await loadDek('api'); // 端末保持の鍵で自動解錠
          if (!k) { setEncLocked(true); setLoading(false); return; }
          try { applyDataset(ed.ct ? await cryptoOpen(k, ed.ct) : {}); setDek(k); setEncLocked(false); }
          catch { await clearDek('api'); setEncLocked(true); }
          setLoading(false); return;
        }
        applyDataset(served ?? await api.data.exportAll());
        setLoading(false);
      } catch (err) {
        console.warn('API unavailable, falling back to localStorage:', err.message);
        await loadLocalEncAware(STORAGE_KEY);
      }
    })();
  }, [isAuthenticated, devMode, guestMode]);

  // ── uid ──
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  // ── Journals CRUD ──
  // opts.silent: 口座の開始残高のように「アプリが自動で作る仕訳」。簿記上は正しい仕訳だが、
  // 「ユーザーが取引を記帳した」という指標には含めない（口座を登録しただけで記帳到達に
  // なってしまうため）。目印の auto はローカル状態にだけ持つ（サーバーは既知の項目しか
  // 保存しないので、リロードすると消える。ツアーの判定はセッション内で完結するため足りる）。
  const addJournal = useCallback(async (data, opts = {}) => {
    const silent = !!opts.silent;
    const newJ = { id: uid(), ...data, ...(silent ? { auto: 1 } : {}) };
    // 初回記帳は登録の有無にかかわらず計上する。journal_added は記帳のたびに出る
    // 「回数」なので、何人が記帳に到達したかはこちらで見る。
    if (!silent) trackOnce('first_journal');
    if (useLocal || encEnabled) {
      setJournals((prev) => [...prev, newJ]);
      if (guestMode && !silent) track('journal_added'); // ゲストの記帳はサーバに残らないため件数のみ計測
      return newJ;
    }
    const created = await api.journals.create(data);
    setJournals((prev) => [...prev, silent ? { ...created, auto: 1 } : created]);
    return created;
  }, [useLocal, encEnabled, guestMode]);

  const updateJournal = useCallback(async (id, data) => {
    if (useLocal || encEnabled) {
      setJournals((prev) => prev.map((j) => j.id === id ? { ...j, ...data } : j));
      return { id, ...data };
    }
    const updated = await api.journals.update(id, data);
    setJournals((prev) => prev.map((j) => j.id === id ? updated : j));
    return updated;
  }, [useLocal, encEnabled]);

  // ── Recurring（定期取引: サーバー保存付き。useLocal時はlocalStorageへ） ──
  /**
   * 全置換コレクションの保存。版番号を添えて送り、他端末が先に保存していれば 409 が返る。
   * そのときは入力を捨てず、最新を取り直して同じ操作を載せ直し、1回だけ再試行する。
   * 2回目も競合したら呼び出し元へ投げる（モーダルは入力を保持したまま残る）。
   * 保存に失敗したら state を更新せずに投げる。握りつぶすと
   * 「画面では保存できたのに、リロードすると消えている」になる。
   */
  const saveCollection = useCallback(async (key, endpoint, next, intent) => {
    try {
      const r = await endpoint.save(next, revs.current[key]);
      revs.current[key] = r.rev;
      return next;
    } catch (e) {
      if (e.status !== 409 || !intent) throw e;
      const fresh = await endpoint.list();
      const merged = applyIntent(fresh.items || [], intent);
      const r = await endpoint.save(merged, fresh.rev);
      revs.current[key] = r.rev;
      return merged;
    }
  }, []);

  const saveRecurring = useCallback(async (newRecurring, intent) => {
    if (useLocal || encEnabled) { setRecurring(newRecurring); return; }
    setRecurring(await saveCollection('recurring', api.recurring, newRecurring, intent));
  }, [useLocal, encEnabled, saveCollection]);

  // ── Presets（プリセット: サーバー保存付き。useLocal時はlocalStorageへ） ──
  const savePresets = useCallback(async (newPresets, intent) => {
    if (useLocal || encEnabled) { setPresets(newPresets); return; }
    setPresets(await saveCollection('presets', api.presets, newPresets, intent));
  }, [useLocal, encEnabled, saveCollection]);

  // ── Rules（自動仕訳ルール: サーバー保存付き。useLocal時はlocalStorageへ） ──
  const saveRules = useCallback(async (newRules, intent) => {
    if (useLocal || encEnabled) { setRules(newRules); return; }
    setRules(await saveCollection('rules', api.rules, newRules, intent));
  }, [useLocal, encEnabled, saveCollection]);

  const deleteJournal = useCallback(async (id) => {
    const removed = journals.find((j) => j.id === id);
    if (useLocal || encEnabled) { setJournals((prev) => prev.filter((j) => j.id !== id)); }
    else { await api.journals.delete(id); setJournals((prev) => prev.filter((j) => j.id !== id)); }
    // 定期取引の巻き戻し: 削除した仕訳が定期生成分なら次回生成日を戻す（保存して永続化）。
    // ここは仕訳削除の副次処理。失敗しても仕訳の削除自体は成功しているので、
    // 投げ直すと「削除に失敗しました」と誤って表示される。次回生成日が戻らないだけに留める。
    if (removed && recurring.length) {
      const rolled = rollbackNextDate(recurring, removed);
      if (rolled.some((r, i) => r.nextDate !== recurring[i].nextDate)) {
        try { await saveRecurring(rolled); } catch (e) { console.warn('nextDate rollback failed:', e?.message); }
      }
    }
  }, [useLocal, encEnabled, journals, recurring, saveRecurring]);

  // ── Accounts CRUD ──
  const addAccount = useCallback(async (data) => {
    const newA = { id: uid(), ...data, sys: 0 };
    if (useLocal || encEnabled) { setAccounts((prev) => [...prev, newA]); return newA; }
    const created = await api.accounts.create(data);
    setAccounts((prev) => [...prev, created]);
    return created;
  }, [useLocal, encEnabled]);

  const updateAccount = useCallback(async (id, data) => {
    if (useLocal || encEnabled) { setAccounts((prev) => prev.map((a) => a.id === id ? { ...a, ...data } : a)); return { id, ...data }; }
    const updated = await api.accounts.update(id, data);
    setAccounts((prev) => prev.map((a) => a.id === id ? updated : a));
    return updated;
  }, [useLocal, encEnabled]);

  const deleteAccount = useCallback(async (id) => {
    if (useLocal || encEnabled) { setAccounts((prev) => prev.filter((a) => a.id !== id)); return; }
    await api.accounts.delete(id);
    setAccounts((prev) => prev.filter((a) => a.id !== id));
  }, [useLocal, encEnabled]);

  // ── Tags ──
  const saveTags = useCallback(async (newTags) => {
    if (useLocal || encEnabled) { setTags(newTags); return; }
    await api.tags.save(newTags);
    setTags(newTags);
  }, [useLocal, encEnabled]);

  // ── Wallets ──
  const saveWallets = useCallback(async (newWallets) => {
    if (useLocal || encEnabled) { setWallets(newWallets); return; }
    await api.wallets.save(newWallets);
    setWallets(newWallets);
  }, [useLocal, encEnabled]);

  // ── Budgets ──
  const saveBudgets = useCallback(async (newBudgets, intent) => {
    if (useLocal || encEnabled) { setBudgets(newBudgets); return; }
    setBudgets(await saveCollection('budgets', api.budgets, newBudgets, intent));
  }, [useLocal, encEnabled, saveCollection]);

  // ── サンプルデータ（ゲスト/ローカル体験用。sample:1 フラグ付き＝まとめて削除可能） ──
  const loadSampleData = useCallback(() => {
    const today = new Date();
    const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const mAgo = (n, day) => fmt(new Date(today.getFullYear(), today.getMonth() - n, n === 0 ? Math.min(day, today.getDate()) : day));
    const J = (date, desc, dr, cr, amount) => ({
      id: uid(), date, desc: `【サンプル】${desc}`, sample: 1,
      lines: [{ accountId: dr, side: 'dr', amount, taxRate: 0 }, { accountId: cr, side: 'cr', amount, taxRate: 0 }],
    });
    const list = [
      J(mAgo(3, 25), '開始残高（普通預金）', 'a02', 'c01', 1250000),
      J(mAgo(2, 25), '給与', 'a02', 'd01', 285000),
      J(mAgo(2, 27), '家賃', 'e09', 'a02', 78000),
      J(mAgo(2, 28), '食費まとめ（カード）', 'e01', 'b03', 42000),
      J(mAgo(1, 5), '電気・ガス', 'e03', 'a02', 11800),
      J(mAgo(1, 10), 'カード引き落とし', 'b03', 'a02', 42000),
      J(mAgo(1, 25), '給与', 'a02', 'd01', 285000),
      J(mAgo(1, 27), '家賃', 'e09', 'a02', 78000),
      J(mAgo(0, 3), '食費まとめ（カード）', 'e01', 'b03', 38000),
      J(mAgo(0, 5), '外食・レジャー', 'e07', 'a01', 6800),
    ];
    setJournals((prev) => [...prev.filter((j) => !j.sample), ...list]);
  }, []);

  const clearSampleData = useCallback(() => {
    setJournals((prev) => prev.filter((j) => !j.sample));
  }, []);

  // ── Export / Import ──
  const exportAll = useCallback(async () => {
    // 暗号化時は端末内の復号済みデータ（in-memory）から平文JSONを生成（サーバーは暗号文のみ）
    if (useLocal || encEnabled) return { accounts, journals, tags, wallets, budgets, presets, recurring, rules, allocs };
    // 版番号は内部用。ユーザーがダウンロードするバックアップJSONには含めない。
    const { revs: _serverRevs, ...data } = await api.data.exportAll();
    return data;
  }, [useLocal, encEnabled, accounts, journals, tags, wallets, budgets, presets, recurring, rules, allocs]);

  const applyAll = (d) => {
    setAccounts(d.accounts || []); setJournals(d.journals || []);
    setTags(d.tags || []); setWallets(d.wallets || []); setBudgets(d.budgets || []);
    setPresets(d.presets || []); setRecurring(d.recurring || []);
    setRules(d.rules || []); setAllocs(d.allocs || []);
  };

  const importAll = useCallback(async (payload) => {
    if (useLocal) {
      applyAll(payload);
      return { imported: 'ok' };
    }
    const result = await api.data.importAll(payload);
    applyAll(await api.data.exportAll());
    return result;
  }, [useLocal]);

  // ── E2E暗号化（useLocal=ローカル/ゲストはlocalStorage、APIはサーバーの暗号文ブロブ /api/encdata） ──
  const enableEncryption = useCallback(async (passphrase) => {
    setRecoverySaved(false); try { localStorage.removeItem('kk_recovery_saved'); } catch {}
    const dataset = { accounts, journals, tags, allocs, wallets, presets, budgets, recurring, rules };
    if (useLocal) {
      const key = guestMode ? GUEST_KEY : STORAGE_KEY;
      const { dek: k, recoveryKey } = await csEnable(key, passphrase, dataset);
      setDek(k); setEncEnabled(true); setEncLocked(false);
      return recoveryKey;
    }
    // API: 端末で鍵生成→暗号化→サーバー保存。既存の平文(per-type items)はサーバーから削除。
    const { dek: k, recoveryKey, bundle } = await setupEncryption(passphrase);
    const ct = await cryptoSeal(k, dataset);
    const saved = await api.encdata.save({ bundle, ct, clearPlaintext: true, rev: encRev.current });
    encRev.current = saved.rev;
    setDek(k); setEncBundle(bundle); setEncEnabled(true); setEncLocked(false);
    return recoveryKey;
  }, [useLocal, guestMode, accounts, journals, tags, allocs, wallets, presets, budgets, recurring, rules]);

  const unlockEncryption = useCallback(async (passphrase) => {
    if (useLocal) {
      const key = guestMode ? GUEST_KEY : STORAGE_KEY;
      const k = await unlockLocal(key, passphrase);
      applyDataset((await loadEncrypted(key, k)) || {});
      setDek(k); setEncLocked(false);
      return;
    }
    const ed = await api.encdata.get();
    encRev.current = ed?.rev || 0;
    const k = await cryptoUnlock(passphrase, ed.bundle);
    applyDataset(ed.ct ? await cryptoOpen(k, ed.ct) : {});
    setDek(k); setEncBundle(ed.bundle); setEncLocked(false);
  }, [useLocal, guestMode, applyDataset]);

  const recoverEncryption = useCallback(async (recoveryKey) => {
    if (useLocal) {
      const key = guestMode ? GUEST_KEY : STORAGE_KEY;
      const k = await recoverLocal(key, recoveryKey);
      applyDataset((await loadEncrypted(key, k)) || {});
      setDek(k); setEncLocked(false);
      return;
    }
    const ed = await api.encdata.get();
    encRev.current = ed?.rev || 0;
    const k = await cryptoRecover(recoveryKey, ed.bundle);
    applyDataset(ed.ct ? await cryptoOpen(k, ed.ct) : {});
    setDek(k); setEncBundle(ed.bundle); setEncLocked(false);
  }, [useLocal, guestMode, applyDataset]);

  // ── パスフレーズもリカバリーキーも失った人の経路 ──
  // 暗号文と鍵バンドルをそのまま書き出す。bundle だけで復号に必要な情報が揃うので
  // （crypto.js の unlock/recover を参照）、後から思い出せばこのファイルから復元できる。
  // 解錠画面が出ている＝ bundle は手元にある、なので鍵は不要。
  const exportEncryptedBackup = useCallback(async () => {
    let bundle = null; let ct = null;
    if (useLocal) {
      const key = guestMode ? GUEST_KEY : STORAGE_KEY;
      bundle = readBundle(key); ct = readCipher(key);
    } else {
      const ed = await api.encdata.get();
      bundle = ed?.bundle || null; ct = ed?.ct || null;
    }
    if (!bundle || !ct) throw new Error('書き出せる暗号化データがありません');
    return { type: ENC_BACKUP_TYPE, v: 1, exportedAt: new Date().toISOString(), bundle, ct };
  }, [useLocal, guestMode]);

  // バックアップファイルを復号する。ファイルは自己完結（bundle だけで鍵を導出できる）ので、
  // いまのアカウントが暗号化中かどうか・どのパスフレーズかには依存しない。
  // secret 未指定なら現在の鍵で試す（破棄を挟んでいなければ鍵が同じなので、そのまま開く）。
  const decryptBackup = useCallback(async (backup, secret, kind = 'pass') => {
    const b = backup?.bundle; const ct = backup?.ct;
    if (!b || !ct) throw new Error('バックアップの形式が正しくありません');
    if (secret == null) {
      if (!dek) throw new Error('鍵がありません');
      return cryptoOpen(dek, ct); // 鍵違いは AES-GCM の認証で必ず失敗する
    }
    const k = kind === 'recovery' ? await cryptoRecover(secret.trim(), b) : await cryptoUnlock(secret, b);
    return cryptoOpen(k, ct);
  }, [dek]);

  // 復号できない暗号文を捨てて、使える状態に戻す。データは戻らない（戻せたらE2Eではない）。
  // アカウントとログインは維持する。呼ぶ前に exportEncryptedBackup を促すこと。
  const wipeEncryption = useCallback(async () => {
    const fresh = {
      accounts: [...DEFAULT_ACCOUNTS], journals: [], tags: [], allocs: [],
      wallets: [], presets: [], budgets: [], recurring: [], rules: [],
    };
    if (useLocal) {
      const key = guestMode ? GUEST_KEY : STORAGE_KEY;
      clearEncryption(key);
      saveLocal(fresh, key);
      await clearDek(key);
    } else {
      const ed = await api.encdata.get();
      await api.encdata.save({ bundle: null, ct: null, rev: ed?.rev || 0 });
      encRev.current = 0;
      // 有効化時に平文をサーバーから消しているため、そのままだと科目が1つも無い状態になる。
      // 既定科目は固定ID（a01/b03/e01…）なので、後から古いバックアップを取り込んでも二重にならない。
      await api.data.importAll(fresh);
      await clearDek('api');
    }
    applyDataset(fresh); // 既定プリセットはここで入る（通常の読み込みと同じ経路）
    setDek(null); setEncBundle(null); setEncEnabled(false); setEncLocked(false);
  }, [useLocal, guestMode, applyDataset]);

  const disableEncryption = useCallback(async () => {
    if (!dek) return;
    if (useLocal) {
      const key = guestMode ? GUEST_KEY : STORAGE_KEY;
      applyDataset((await csDisable(key, dek)) || {});
      await clearDek(key);
      setDek(null); setEncEnabled(false); setEncLocked(false);
      return;
    }
    // API: 復号済みデータを平文でサーバーへ戻し、暗号ブロブを空に
    await api.data.importAll({ accounts, journals, tags, allocs, wallets, presets, budgets, recurring, rules });
    const cleared = await api.encdata.save({ bundle: null, ct: null, rev: encRev.current });
    encRev.current = cleared.rev;
    await clearDek('api');
    setDek(null); setEncBundle(null); setEncEnabled(false); setEncLocked(false);
  }, [useLocal, guestMode, dek, applyDataset, accounts, journals, tags, allocs, wallets, presets, budgets, recurring, rules]);

  const changeEncPassphrase = useCallback(async (newPassphrase) => {
    if (!dek) return;
    if (useLocal) {
      const key = guestMode ? GUEST_KEY : STORAGE_KEY;
      await changeLocalPassphrase(key, dek, newPassphrase);
      return;
    }
    const ed = await api.encdata.get();
    const newBundle = await cryptoChangePass(dek, newPassphrase, ed.bundle);
    const saved = await api.encdata.save({ bundle: newBundle, ct: ed.ct, rev: ed.rev || 0 });
    encRev.current = saved.rev;
    setEncBundle(newBundle);
  }, [useLocal, guestMode, dek]);

  // リカバリーキー再発行（既存DEKを新キーで再ラップ）。新しいリカバリーキー文字列を返す。
  const regenerateRecoveryKey = useCallback(async () => {
    if (!dek) return null;
    const rec = await regenRecovery(dek);
    // recoveryIterations も一緒に更新する。落とすと、新しく作ったラップを古い回数で開こうとして失敗する。
    const patch = { recoveryIterations: rec.recoveryIterations, recoverySalt: rec.recoverySalt, recoveryWrappedDEK: rec.recoveryWrappedDEK };
    if (useLocal) {
      const key = guestMode ? GUEST_KEY : STORAGE_KEY;
      const b = readBundle(key);
      if (b) writeBundle(key, { ...b, ...patch });
    } else {
      const ed = await api.encdata.get();
      const newBundle = { ...(ed.bundle || {}), ...patch };
      const saved = await api.encdata.save({ bundle: newBundle, ct: ed.ct, rev: ed.rev || 0 });
      encRev.current = saved.rev;
      setEncBundle(newBundle);
    }
    return rec.recoveryKey;
  }, [useLocal, guestMode, dek]);

  const value = {
    accounts, journals, tags, wallets, budgets, presets, recurring, rules, allocs, loading,
    encLocked, encEnabled, encAvailable: useLocal || isAuthenticated, recoverySaved, encConflict,
    enableEncryption, unlockEncryption, recoverEncryption, disableEncryption, changeEncPassphrase,
    regenerateRecoveryKey, markRecoverySaved, exportEncryptedBackup, wipeEncryption, decryptBackup,
    addJournal, updateJournal, deleteJournal,
    addAccount, updateAccount, deleteAccount,
    saveTags, saveWallets, saveBudgets,
    exportAll, importAll,
    setPresets, setRecurring, setRules, setAllocs, saveRecurring, savePresets, saveRules,
    loadSampleData, clearSampleData,
    sampleAvailable: useLocal,
    hasSampleData: journals.some((j) => j.sample),
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}
