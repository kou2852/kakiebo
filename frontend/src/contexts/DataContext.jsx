import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useAuth } from './AuthContext';
import * as api from '../api/client';
import { rollbackNextDate } from '../utils/autoGen';
import { hasEncryption, loadEncrypted, saveEncrypted, enableEncryption as csEnable, unlockLocal, recoverLocal, changeLocalPassphrase, disableEncryption as csDisable } from '../utils/cryptoStore';
import { setupEncryption, unlock as cryptoUnlock, recover as cryptoRecover, changePassphrase as cryptoChangePass, regenerateRecovery as regenRecovery, seal as cryptoSeal, open as cryptoOpen } from '../utils/crypto';
import { readBundle, writeBundle } from '../utils/cryptoStore';
import { saveDek, loadDek, clearDek } from '../utils/dekStore';
import { track, trackOnce } from '../utils/track';

const DataContext = createContext(null);

const STORAGE_KEY = 'kk4';
const GUEST_KEY = 'kk4_guest'; // ゲストのデータは通常の kk4 と分離して保存

// デフォルト勘定科目
const DEFAULT_ACCOUNTS = [
  {id:'a01',code:'1001',name:'現金',type:'asset',sys:1},{id:'a02',code:'1002',name:'普通預金',type:'asset',sys:1},{id:'a03',code:'1003',name:'定期預金',type:'asset',sys:1},{id:'a04',code:'1101',name:'売掛金',type:'asset',sys:1},{id:'a05',code:'1201',name:'有価証券',type:'asset',sys:1},{id:'a06',code:'1301',name:'固定資産',type:'asset',sys:1},
  {id:'b01',code:'2001',name:'買掛金',type:'liability',sys:1},{id:'b02',code:'2002',name:'未払金',type:'liability',sys:1},{id:'b03',code:'2101',name:'クレジットカード',type:'liability',sys:1},{id:'b04',code:'2201',name:'借入金',type:'liability',sys:1},
  {id:'c01',code:'3001',name:'元入金',type:'equity',sys:1},{id:'c02',code:'3101',name:'繰越利益',type:'equity',sys:1},
  {id:'d01',code:'4001',name:'給与収入',type:'income',sys:1},{id:'d02',code:'4002',name:'副業収入',type:'income',sys:1},{id:'d03',code:'4003',name:'利子収入',type:'income',sys:1},{id:'d04',code:'4004',name:'雑収入',type:'income',sys:1},
  {id:'e01',code:'5001',name:'食費',type:'expense',sys:1},{id:'e02',code:'5002',name:'日用品費',type:'expense',sys:1},{id:'e03',code:'5003',name:'光熱費',type:'expense',sys:1},{id:'e04',code:'5004',name:'通信費',type:'expense',sys:1},{id:'e05',code:'5005',name:'交通費',type:'expense',sys:1},{id:'e06',code:'5006',name:'医療費',type:'expense',sys:1},{id:'e07',code:'5007',name:'娯楽費',type:'expense',sys:1},{id:'e08',code:'5008',name:'衣服費',type:'expense',sys:1},{id:'e09',code:'5009',name:'住居費',type:'expense',sys:1},{id:'e10',code:'5010',name:'保険料',type:'expense',sys:1},{id:'e11',code:'5011',name:'教育費',type:'expense',sys:1},{id:'e12',code:'5012',name:'雑費',type:'expense',sys:1},
];

// デフォルトプリセット（手動作成と同じ扱い・特別フラグなし。口座未登録のため walletId は空）
const DEFAULT_PRESETS = [
  { id: 'pd1', walletId: '', type: 'out', name: '食費（カード払い）', desc: '', lines: [{ accountId: 'e01', side: 'dr', amount: 0, tagId: '' }, { accountId: 'b03', side: 'cr', amount: 0, tagId: '' }] },
  { id: 'pd2', walletId: '', type: 'in', name: '給与（入金）', desc: '', lines: [{ accountId: 'a02', side: 'dr', amount: 0, tagId: '' }, { accountId: 'd01', side: 'cr', amount: 0, tagId: '' }] },
  { id: 'pd3', walletId: '', type: 'out', name: '現金引き出し', desc: '', lines: [{ accountId: 'a01', side: 'dr', amount: 0, tagId: '' }, { accountId: 'a02', side: 'cr', amount: 0, tagId: '' }] },
];

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
        .then((ct) => api.encdata.save({ bundle: encBundle, ct }))
        .catch((e) => console.warn('暗号化保存(API)に失敗:', e?.message));
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
        // ゲスト登録直後の移行。暗号化ゲストは（解錠済みdekで）復号して移行する。
        let g = null;
        const guestRaw = localStorage.getItem(GUEST_KEY);
        if (guestRaw) { try { g = JSON.parse(guestRaw); } catch {} }
        else if (hasEncryption(GUEST_KEY) && dek) { try { g = await loadEncrypted(GUEST_KEY, dek); } catch {} }
        if (g && (g.journals?.length || g.accounts?.length)) await api.data.importAll(g);
        localStorage.removeItem(GUEST_KEY);
        localStorage.removeItem(`${GUEST_KEY}__enc`);
        localStorage.removeItem(`${GUEST_KEY}__encmeta`);

        // E2E暗号化が有効なら暗号文を取得（取得失敗時は通常ロードへフォールバック）
        let ed = null;
        try { ed = await api.encdata.get(); } catch { ed = null; }
        if (ed && ed.bundle) {
          setEncEnabled(true); setEncBundle(ed.bundle);
          const k = dek || await loadDek('api'); // 端末保持の鍵で自動解錠
          if (!k) { setEncLocked(true); setLoading(false); return; }
          try { applyDataset(ed.ct ? await cryptoOpen(k, ed.ct) : {}); setDek(k); setEncLocked(false); }
          catch { await clearDek('api'); setEncLocked(true); }
          setLoading(false); return;
        }
        applyDataset(await api.data.exportAll());
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
  const addJournal = useCallback(async (data) => {
    const newJ = { id: uid(), ...data };
    // 初回記帳は登録の有無にかかわらず計上する。journal_added は記帳のたびに出る
    // 「回数」なので、何人が記帳に到達したかはこちらで見る。
    trackOnce('first_journal');
    if (useLocal || encEnabled) {
      setJournals((prev) => [...prev, newJ]);
      if (guestMode) track('journal_added'); // ゲストの記帳はサーバに残らないため件数のみ計測
      return newJ;
    }
    const created = await api.journals.create(data);
    setJournals((prev) => [...prev, created]);
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
  const saveRecurring = useCallback(async (newRecurring) => {
    if (!useLocal && !encEnabled) {
      try { await api.recurring.save(newRecurring); } catch (e) { console.warn('recurring save failed:', e?.message); }
    }
    setRecurring(newRecurring);
  }, [useLocal, encEnabled]);

  // ── Presets（プリセット: サーバー保存付き。useLocal時はlocalStorageへ） ──
  const savePresets = useCallback(async (newPresets) => {
    if (!useLocal && !encEnabled) {
      try { await api.presets.save(newPresets); } catch (e) { console.warn('presets save failed:', e?.message); }
    }
    setPresets(newPresets);
  }, [useLocal, encEnabled]);

  // ── Rules（自動仕訳ルール: サーバー保存付き。useLocal時はlocalStorageへ） ──
  const saveRules = useCallback(async (newRules) => {
    if (!useLocal && !encEnabled) {
      try { await api.rules.save(newRules); } catch (e) { console.warn('rules save failed:', e?.message); }
    }
    setRules(newRules);
  }, [useLocal, encEnabled]);

  const deleteJournal = useCallback(async (id) => {
    const removed = journals.find((j) => j.id === id);
    if (useLocal || encEnabled) { setJournals((prev) => prev.filter((j) => j.id !== id)); }
    else { await api.journals.delete(id); setJournals((prev) => prev.filter((j) => j.id !== id)); }
    // 定期取引の巻き戻し: 削除した仕訳が定期生成分なら次回生成日を戻す（保存して永続化）
    if (removed && recurring.length) {
      const rolled = rollbackNextDate(recurring, removed);
      if (rolled.some((r, i) => r.nextDate !== recurring[i].nextDate)) await saveRecurring(rolled);
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
  const saveBudgets = useCallback(async (newBudgets) => {
    if (useLocal || encEnabled) { setBudgets(newBudgets); return; }
    await api.budgets.save(newBudgets);
    setBudgets(newBudgets);
  }, [useLocal, encEnabled]);

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
    return api.data.exportAll();
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
    await api.encdata.save({ bundle, ct, clearPlaintext: true });
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
    const k = await cryptoRecover(recoveryKey, ed.bundle);
    applyDataset(ed.ct ? await cryptoOpen(k, ed.ct) : {});
    setDek(k); setEncBundle(ed.bundle); setEncLocked(false);
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
    await api.encdata.save({ bundle: null, ct: null });
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
    await api.encdata.save({ bundle: newBundle, ct: ed.ct });
    setEncBundle(newBundle);
  }, [useLocal, guestMode, dek]);

  // リカバリーキー再発行（既存DEKを新キーで再ラップ）。新しいリカバリーキー文字列を返す。
  const regenerateRecoveryKey = useCallback(async () => {
    if (!dek) return null;
    const rec = await regenRecovery(dek);
    if (useLocal) {
      const key = guestMode ? GUEST_KEY : STORAGE_KEY;
      const b = readBundle(key);
      if (b) writeBundle(key, { ...b, recoverySalt: rec.recoverySalt, recoveryWrappedDEK: rec.recoveryWrappedDEK });
    } else {
      const ed = await api.encdata.get();
      const newBundle = { ...(ed.bundle || {}), recoverySalt: rec.recoverySalt, recoveryWrappedDEK: rec.recoveryWrappedDEK };
      await api.encdata.save({ bundle: newBundle, ct: ed.ct });
      setEncBundle(newBundle);
    }
    return rec.recoveryKey;
  }, [useLocal, guestMode, dek]);

  const value = {
    accounts, journals, tags, wallets, budgets, presets, recurring, rules, allocs, loading,
    encLocked, encEnabled, encAvailable: useLocal || isAuthenticated, recoverySaved,
    enableEncryption, unlockEncryption, recoverEncryption, disableEncryption, changeEncPassphrase,
    regenerateRecoveryKey, markRecoverySaved,
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
