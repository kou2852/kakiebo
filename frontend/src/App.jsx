import { useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { DataProvider, useData } from './contexts/DataContext';
import { UIProvider, useUI } from './contexts/UIContext';
import ErrorBoundary from './components/Common/ErrorBoundary';
import EncryptionUnlock from './components/Common/EncryptionUnlock';
import Sidebar from './components/Layout/Sidebar';
import AuthPage from './components/Layout/AuthPage';
import Dashboard from './components/Dashboard/Dashboard';
import JournalPage from './components/Journal/JournalPage';
import CreditPage from './components/Credit/CreditPage';
import LedgerPage from './components/Ledger/LedgerPage';
import BSPage from './components/Reports/BSPage';
import PLPage from './components/Reports/PLPage';
import CFPage from './components/Reports/CFPage';
import AccountsPage from './components/Accounts/AccountsPage';
import TagsPage from './components/Tags/TagsPage';
import CalendarPage from './components/Calendar/CalendarPage';
import RecurringPage from './components/Recurring/RecurringPage';
import SettingsPage from './components/Settings/SettingsPage';
import GuidePage from './components/Guide/GuidePage';
import Toast from './components/Common/Toast';
import Ad from './components/Common/Ad';
import { GuestBanner, GuestPromoModal } from './components/Common/Guest';
import OnboardingModal from './components/Onboarding/OnboardingModal';
import WhatsNewModal from './components/Common/WhatsNewModal';
import { AD_CONFIG } from './config/tiers';
import { APP_UPDATES } from './config/updates';

const PAGES = {
  dashboard: Dashboard,
  journal: JournalPage,
  credit: CreditPage,
  ledger: LedgerPage,
  bs: BSPage,
  pl: PLPage,
  cf: CFPage,
  accounts: AccountsPage,
  tags: TagsPage,
  calendar: CalendarPage,
  recurring: RecurringPage,
  settings: SettingsPage,
  guide: GuidePage,
};

function AppShell({ devMode, guestMode, tier }) {
  const { currentPage, navigate, hiddenNav, onboardingOpen, openOnboarding, closeOnboarding } = useUI();
  const { encLocked } = useData();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [navCount, setNavCount] = useState(0);
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);

  // 更新情報は自動表示せず、ヘッダーのベルから開く。未読は赤ドットで示す。
  const latestUpdate = APP_UPDATES[0]?.id;
  const [updateSeen, setUpdateSeen] = useState(() => localStorage.getItem('kk_update_seen'));
  const hasUnreadUpdate = !!latestUpdate && updateSeen !== latestUpdate;
  const closeWhatsNew = () => { localStorage.setItem('kk_update_seen', latestUpdate || ''); setUpdateSeen(latestUpdate); setWhatsNewOpen(false); };

  const PageComponent = PAGES[currentPage] || Dashboard;
  const navEvery = AD_CONFIG[tier]?.navEvery || 0;
  const showNavAd = navEvery > 0 && navCount > 0 && navCount % navEvery === 0;

  const onNavigate = (page) => { navigate(page); setSidebarOpen(false); setNavCount((c) => c + 1); };

  if (encLocked) return <EncryptionUnlock />;

  return (
    <>
      {devMode && (
        <div style={{
          position: 'fixed', top: 0, left: 210, right: 0, zIndex: 80,
          background: 'var(--warn)', borderBottom: '1px solid var(--ac)',
          padding: '4px 16px', fontSize: 11, color: 'var(--ac)', textAlign: 'center',
        }}>
          開発モード — Cognito未設定のためlocalStorageで動作中。.env.local を設定するとAPI接続に切り替わります。
        </div>
      )}
      <div className="app">
        <Sidebar
          currentPage={currentPage}
          onNavigate={onNavigate}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          tier={tier}
          hiddenNav={hiddenNav}
          onOpenGuide={openOnboarding}
          onOpenWhatsNew={() => setWhatsNewOpen(true)}
          hasUnread={hasUnreadUpdate}
        />
        <header className="m-header">
          <button className="hamburger" onClick={() => setSidebarOpen(true)} aria-label="メニュー">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="22" height="22">
              <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <span className="m-logo" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg viewBox="0 0 512 512" width="24" height="24" style={{ borderRadius: 6 }} aria-hidden="true">
              <rect width="512" height="512" rx="116" fill="#0d9488" />
              <polyline points="118,338 212,300 296,206 392,156" fill="none" stroke="#fff" strokeWidth="38" strokeLinecap="round" strokeLinejoin="round" />
              <polyline points="338,156 392,156 392,210" fill="none" stroke="#fff" strokeWidth="38" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="118" y1="398" x2="394" y2="398" stroke="#bdeee6" strokeWidth="20" strokeLinecap="round" />
            </svg>
            kurofukubo
          </span>
        </header>
        {sidebarOpen && <div className="s-overlay open" onClick={() => setSidebarOpen(false)} />}
        <main className="main" style={devMode ? { paddingTop: 52 } : undefined}>
          {guestMode && <GuestBanner />}
          {showNavAd && <Ad />}
          <PageComponent />
        </main>
      </div>
      {guestMode && <GuestPromoModal />}
      <OnboardingModal open={onboardingOpen} onClose={closeOnboarding} onNavigate={onNavigate} />
      <WhatsNewModal open={whatsNewOpen} onClose={closeWhatsNew} />
      <Toast />
    </>
  );
}

function AppContent() {
  const { isAuthenticated, loading, devMode, guestMode, tier } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <span style={{ color: 'var(--tx3)' }}>読み込み中...</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AuthPage />;
  }

  return (
    <DataProvider>
      <UIProvider>
        <AppShell devMode={devMode} guestMode={guestMode} tier={tier} />
      </UIProvider>
    </DataProvider>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ErrorBoundary>
  );
}
