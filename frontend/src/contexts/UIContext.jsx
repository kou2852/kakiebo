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
  const [onboardingOpen, setOnboardingOpen] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(HIDDEN_KEY, JSON.stringify(hiddenNav)); } catch {}
  }, [hiddenNav]);

  // 初回のみ自動表示
  useEffect(() => {
    if (!localStorage.getItem(ONBOARD_KEY)) setOnboardingOpen(true);
  }, []);

  const navigate = useCallback((id) => setCurrentPage(id), []);

  const toggleNav = useCallback((id) => {
    if (CORE_NAV.includes(id)) return;
    setHiddenNav((h) => (h.includes(id) ? h.filter((x) => x !== id) : [...h, id]));
  }, []);

  const openOnboarding = useCallback(() => setOnboardingOpen(true), []);
  const closeOnboarding = useCallback(() => {
    localStorage.setItem(ONBOARD_KEY, '1');
    setOnboardingOpen(false);
  }, []);

  const value = {
    currentPage, navigate,
    hiddenNav,
    isHidden: (id) => hiddenNav.includes(id),
    toggleNav,
    onboardingOpen, openOnboarding, closeOnboarding,
  };
  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export function useUI() {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUI must be used within UIProvider');
  return ctx;
}
