import { useEffect, useRef, useState } from 'react';
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
import Tour from './components/Onboarding/Tour';
import TutorialMenu from './components/Onboarding/TutorialMenu';
import WhatsNewModal from './components/Common/WhatsNewModal';
import FeedbackModal from './components/Common/FeedbackModal';
import { AD_CONFIG } from './config/tiers';
import { APP_UPDATES } from './config/updates';
import { track } from './utils/track';

const FEEDBACK_ASKED_KEY = 'kk_feedback_asked';
const FEEDBACK_MONTH_KEY = 'kk_feedback_month';
const FEEDBACK_DAY = 20; // 毎月この日以降、その月にまだ聞いていなければ改めて伺う

const ym = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

// アンケートを出す理由を返す（null なら出さない）。記帳3件未満の人には出さない。
function feedbackReason(journalCount) {
  if (journalCount < 3) return null;
  const now = new Date();
  if (now.getDate() >= FEEDBACK_DAY && localStorage.getItem(FEEDBACK_MONTH_KEY) !== ym(now)) return 'monthly';
  if (!localStorage.getItem(FEEDBACK_ASKED_KEY)) return 'first';
  return null;
}

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
  const { currentPage, navigate, hiddenNav, tourId, startTour, endTour, menuOpen, openMenu, closeMenu, requestJournalEntry } = useUI();
  const { encLocked, journals, loading } = useData();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [navCount, setNavCount] = useState(0);
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const previousJournalCount = useRef(null);

  useEffect(() => {
    if (loading) return;
    const previous = previousJournalCount.current;
    previousJournalCount.current = journals.length;
    if (devMode) return;
    const reason = feedbackReason(journals.length);
    if (!reason) return;
    // 起動直後は間を置く（読み込み完了前の誤発火も防ぐ）。セッション中に3件目を記帳した場合は即座に。
    const delay = previous === null ? 1500 : 0;
    const timer = setTimeout(() => {
      if (!feedbackReason(journals.length)) return;
      localStorage.setItem(FEEDBACK_ASKED_KEY, '1');
      localStorage.setItem(FEEDBACK_MONTH_KEY, ym(new Date()));
      setFeedbackOpen(true);
      track(reason === 'monthly' ? 'feedback_shown_monthly' : 'feedback_shown');
    }, delay);
    return () => clearTimeout(timer);
  }, [devMode, journals.length, loading]);

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
          onOpenGuide={openMenu}
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
            <img src="/favicon.svg" width="24" height="24" style={{ borderRadius: 6 }} alt="" aria-hidden="true" />
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
      <Tour tourId={tourId} onClose={endTour} onNavigate={onNavigate} onOpenSidebar={() => setSidebarOpen(true)} onStartTour={startTour} />
      <TutorialMenu open={menuOpen} onClose={closeMenu} onStart={startTour} />
      <WhatsNewModal open={whatsNewOpen} onClose={closeWhatsNew} />
      <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
      <button
        className="journal-fab"
        type="button"
        aria-label="新しい仕訳を入力"
        onClick={() => {
          if (currentPage !== 'journal') navigate('journal');
          requestJournalEntry();
        }}
      >
        <span aria-hidden="true">＋</span> 仕訳
      </button>
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
