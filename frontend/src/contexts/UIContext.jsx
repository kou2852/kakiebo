import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { CORE_NAV } from '../config/nav';

const UIContext = createContext(null);

const HIDDEN_KEY = 'kk_nav_hidden';   // 非表示にした画面ID
const ONBOARD_KEY = 'kk_onboarded';   // 初回オンボーディング表示済みフラグ

function loadHidden() {
  try {
    const arr = JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]');
    return Array.isArray(arr) ? arr.filter((id) => !CORE_NAV.includes(id)) : [];
  } catch { return []; }
}

export function UIProvider({ children }) {
  // 初回（未オンボーディング）のユーザーは操作ガイドを最初に表示。以降はダッシュボード。
  const [currentPage, setCurrentPage] = useState(() => (localStorage.getItem(ONBOARD_KEY) ? 'dashboard' : 'guide'));
  const [hiddenNav, setHiddenNav] = useState(loadHidden);
  const [tourId, setTourId] = useState(null);      // 起動中のツアーID（null=なし）
  const [menuOpen, setMenuOpen] = useState(false); // チュートリアル選択メニュー
  const [journalEntryRequested, setJournalEntryRequested] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(HIDDEN_KEY, JSON.stringify(hiddenNav)); } catch {}
  }, [hiddenNav]);

  // 初回のみ「はじめてのツアー」を自動表示
  useEffect(() => {
    if (!localStorage.getItem(ONBOARD_KEY)) setTourId('firstRun');
  }, []);

  const navigate = useCallback((id) => setCurrentPage(id), []);

  const toggleNav = useCallback((id) => {
    if (CORE_NAV.includes(id)) return;
    setHiddenNav((h) => (h.includes(id) ? h.filter((x) => x !== id) : [...h, id]));
  }, []);

  const startTour = useCallback((id = 'firstRun') => { setMenuOpen(false); setTourId(id); }, []);
  const endTour = useCallback(() => {
    localStorage.setItem(ONBOARD_KEY, '1');
    setTourId(null);
  }, []);
  const openMenu = useCallback(() => setMenuOpen(true), []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const requestJournalEntry = useCallback(() => setJournalEntryRequested(true), []);
  const consumeJournalEntryRequest = useCallback(() => setJournalEntryRequested(false), []);

  const value = {
    currentPage, navigate,
    hiddenNav,
    isHidden: (id) => hiddenNav.includes(id),
    toggleNav,
    tourId, startTour, endTour,
    menuOpen, openMenu, closeMenu,
    journalEntryRequested, requestJournalEntry, consumeJournalEntryRequest,
  };
  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export function useUI() {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUI must be used within UIProvider');
  return ctx;
}
