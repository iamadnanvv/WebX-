import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Archive,
  ArrowLeftRight,
  BookOpenCheck,
  CalendarCheck2,
  ClipboardList,
  Coins,
  Command,
  FileBarChart2,
  Headphones,
  History,
  Keyboard,
  LayoutDashboard,
  LifeBuoy,
  LockKeyhole,
  LogOut,
  Menu,
  PlusCircle,
  Scale,
  Settings,
  ShieldCheck,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { LoginView } from './components/LoginView.tsx';
import { CurrencyConverterWidget } from './components/CurrencyConverterWidget.tsx';
import { CommandPaletteModal } from './components/CommandPaletteModal.tsx';
import { ShortcutHelpModal } from './components/ShortcutHelpModal.tsx';
import { ConfirmModal } from './components/ConfirmModal.tsx';
import {
  type ShortcutDefinition,
  getAvailableShortcuts,
  getShortcutForPage,
  hasOpenModalDialog,
  isEditableTarget,
  matchChordShortcut,
  matchSingleShortcut,
} from './lib/shortcuts.ts';

// Staff Pages
import { StaffDashboard } from './pages/staff/StaffDashboard.tsx';
import { AccountListPage } from './pages/staff/AccountListPage.tsx';
import { NewEntryPage } from './pages/staff/NewEntryPage.tsx';
import { TransactionHistoryPage } from './pages/staff/TransactionHistoryPage.tsx';
import { DailyLedgerPage } from './pages/staff/DailyLedgerPage.tsx';
import { ReportsPage } from './pages/staff/ReportsPage.tsx';

// Admin Pages
import { AdminDashboard } from './pages/admin/AdminDashboard.tsx';
import { StaffManagementPage } from './pages/admin/StaffManagementPage.tsx';
import { AccountManagementPage } from './pages/admin/AccountManagementPage.tsx';
import { TransactionManagementPage } from './pages/admin/TransactionManagementPage.tsx';
import { BalanceManagementPage } from './pages/admin/BalanceManagementPage.tsx';
import { DailyClosingPage } from './pages/admin/DailyClosingPage.tsx';
import { ExchangeRatesPage } from './pages/admin/ExchangeRatesPage.tsx';
import { ActivityLogsPage } from './pages/admin/ActivityLogsPage.tsx';
import { SystemSettingsPage } from './pages/admin/SystemSettingsPage.tsx';
import { SupportCenterPage } from './pages/SupportCenterPage.tsx';
import { MonthlyBackupsPage } from './pages/MonthlyBackupsPage.tsx';

interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const STAFF_NAV: NavItem[] = [
  { id: 'staff-dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'accounts', label: 'Account List', icon: Wallet },
  { id: 'new-entry', label: 'Add New Entry', icon: PlusCircle },
  { id: 'transactions', label: 'Transaction History', icon: History },
  { id: 'daily-ledger', label: 'Daily Ledger', icon: ClipboardList },
  { id: 'reports', label: 'Basic Reports', icon: FileBarChart2 },
  { id: 'monthly-backups', label: 'Monthly Backups', icon: Archive },
  { id: 'support-center', label: 'Help & Support', icon: LifeBuoy },
];

const ADMIN_NAV: NavItem[] = [
  { id: 'admin-dashboard', label: 'Admin Overview', icon: ShieldCheck },
  { id: 'admin-staff', label: 'Staff Management', icon: Users },
  { id: 'admin-accounts', label: 'Account Management', icon: Wallet },
  { id: 'admin-transactions', label: 'Transaction Audit', icon: LockKeyhole },
  { id: 'admin-balances', label: 'Balance Check', icon: Scale },
  { id: 'admin-closing', label: 'Daily Closing', icon: CalendarCheck2 },
  { id: 'admin-rates', label: 'Exchange Rates', icon: Coins },
  { id: 'admin-reports', label: 'Comprehensive Reports', icon: FileBarChart2 },
  { id: 'admin-logs', label: 'Activity Logs', icon: Activity },
  { id: 'admin-support', label: 'Support Desk', icon: Headphones },
  { id: 'admin-settings', label: 'System Settings', icon: Settings },
];

function ToastContainer() {
  const { toasts, dismissToast } = useAuth();
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm no-print">
      {toasts.map((t) => {
        const colors =
          t.type === 'error'
            ? 'bg-red-700 text-white border-red-800'
            : t.type === 'success'
              ? 'bg-emerald-700 text-white border-emerald-800'
              : 'bg-slate-900 text-white border-slate-800';
        return (
          <div
            key={t.id}
            className={`px-4 py-3 rounded-md border shadow-lg text-xs font-medium flex items-center justify-between gap-3 ${colors}`}
          >
            <span>{t.text}</span>
            <button
              type="button"
              onClick={() => dismissToast(t.id)}
              className="opacity-75 hover:opacity-100"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function WorkspaceShell() {
  const {
    user,
    rateInfo,
    primaryCurrency,
    setPrimaryCurrency,
    logout,
    settings,
    refreshActiveViews,
    notify,
  } = useAuth();

  const [activePage, setActivePage] = useState<string>('staff-dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [converterOpen, setConverterOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [pendingChord, setPendingChord] = useState<'g' | 'a' | null>(null);
  const chordTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const converterRef = useRef<HTMLDivElement | null>(null);

  const isAdmin = user?.role === 'ADMIN';
  const staffReportsAllowed = Boolean(isAdmin || settings?.staffCanViewReports);
  const staffBackupsAllowed = Boolean(isAdmin || (settings?.staffCanDownloadBackups ?? true));

  const availableShortcuts = useMemo(
    () =>
      getAvailableShortcuts({
        isAdmin: Boolean(isAdmin),
        staffCanViewReports: staffReportsAllowed,
        staffCanDownloadBackups: staffBackupsAllowed,
      }),
    [isAdmin, staffReportsAllowed, staffBackupsAllowed]
  );

  const navigate = useCallback((pageId: string) => {
    setActivePage(pageId);
    setMobileMenuOpen(false);
    setConverterOpen(false);
  }, []);

  const clearPendingChord = useCallback(() => {
    if (chordTimerRef.current) {
      clearTimeout(chordTimerRef.current);
      chordTimerRef.current = null;
    }
    setPendingChord(null);
  }, []);

  const executeShortcut = useCallback(
    (shortcut: ShortcutDefinition) => {
      if (shortcut.pageId) {
        navigate(shortcut.pageId);
        return;
      }
      switch (shortcut.actionId) {
        case 'open-command-palette':
          setShortcutHelpOpen(false);
          setCommandPaletteOpen(true);
          break;
        case 'open-shortcut-help':
          setCommandPaletteOpen(false);
          setShortcutHelpOpen(true);
          break;
        case 'toggle-currency': {
          const next = primaryCurrency === 'AED' ? 'INR' : 'AED';
          setPrimaryCurrency(next);
          notify('info', `Primary display switched to ${next}`);
          break;
        }
        case 'toggle-converter':
          setConverterOpen((prev) => !prev);
          break;
        case 'focus-search': {
          const searchInput = document.querySelector<HTMLInputElement>(
            'main input[type="text"][placeholder*="Search" i], main input[type="search"]'
          );
          if (searchInput) {
            searchInput.focus();
            searchInput.select();
          } else {
            setCommandPaletteOpen(true);
          }
          break;
        }
        case 'refresh-workspace':
          refreshActiveViews()
            .then(() => notify('success', 'Workspace data & live rates refreshed'))
            .catch((err: any) =>
              notify('error', err?.message || 'Failed to refresh workspace')
            );
          break;
        case 'open-support':
          navigate(isAdmin ? 'admin-support' : 'support-center');
          break;
        case 'print-page':
          window.print();
          break;
        case 'logout-prompt':
          setLogoutConfirmOpen(true);
          break;
        default:
          break;
      }
    },
    [navigate, primaryCurrency, setPrimaryCurrency, notify, refreshActiveViews, isAdmin]
  );

  useEffect(() => {
    if (user) {
      setActivePage(user.role === 'ADMIN' ? 'admin-dashboard' : 'staff-dashboard');
    } else {
      setActivePage('staff-dashboard');
      setConverterOpen(false);
      setMobileMenuOpen(false);
      setCommandPaletteOpen(false);
      setShortcutHelpOpen(false);
      setLogoutConfirmOpen(false);
      clearPendingChord();
    }
  }, [user?.id, user?.role, clearPendingChord]);

  useEffect(() => {
    return () => {
      if (chordTimerRef.current) {
        clearTimeout(chordTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!converterOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (converterRef.current && !converterRef.current.contains(e.target as Node)) {
        setConverterOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [converterOpen]);

  useEffect(() => {
    if (!user) return;

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Ctrl+K / Cmd+K always toggles Command Palette
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        clearPendingChord();
        setShortcutHelpOpen(false);
        setCommandPaletteOpen((prev) => !prev);
        return;
      }

      if (e.key === 'Escape') {
        if (pendingChord) {
          e.preventDefault();
          clearPendingChord();
          return;
        }
        if (commandPaletteOpen) {
          e.preventDefault();
          setCommandPaletteOpen(false);
          return;
        }
        if (shortcutHelpOpen) {
          e.preventDefault();
          setShortcutHelpOpen(false);
          return;
        }
        if (converterOpen) {
          e.preventDefault();
          setConverterOpen(false);
          return;
        }
        if (mobileMenuOpen) {
          e.preventDefault();
          setMobileMenuOpen(false);
        }
        return;
      }

      // Pause navigation/action shortcuts while overlays/modals are open or typing inside form inputs
      if (commandPaletteOpen || shortcutHelpOpen || logoutConfirmOpen || hasOpenModalDialog()) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isEditableTarget(e.target)) return;

      const permOptions = {
        isAdmin: Boolean(isAdmin),
        staffCanViewReports: staffReportsAllowed,
        staffCanDownloadBackups: staffBackupsAllowed,
      };

      // Handle second key of an active G or A chord
      if (pendingChord) {
        const matched = matchChordShortcut(pendingChord, e.key, permOptions);
        clearPendingChord();
        if (matched) {
          e.preventDefault();
          executeShortcut(matched);
        }
        return;
      }

      const lower = e.key.toLowerCase();
      if (!e.shiftKey && (lower === 'g' || (lower === 'a' && isAdmin))) {
        e.preventDefault();
        setPendingChord(lower as 'g' | 'a');
        chordTimerRef.current = setTimeout(() => {
          setPendingChord(null);
          chordTimerRef.current = null;
        }, 1000);
        return;
      }

      const singleMatch = matchSingleShortcut(e.key, e.shiftKey, permOptions);
      if (singleMatch) {
        e.preventDefault();
        executeShortcut(singleMatch);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [
    user,
    isAdmin,
    staffReportsAllowed,
    staffBackupsAllowed,
    pendingChord,
    commandPaletteOpen,
    shortcutHelpOpen,
    logoutConfirmOpen,
    converterOpen,
    mobileMenuOpen,
    clearPendingChord,
    executeShortcut,
  ]);

  if (!user) {
    return <LoginView />;
  }

  // Enforce strict role guard on activePage
  const safePage =
    activePage.startsWith('admin-') && !isAdmin
      ? 'staff-dashboard'
      : activePage === 'reports' && !staffReportsAllowed
        ? 'staff-dashboard'
        : activePage === 'monthly-backups' && !staffBackupsAllowed
          ? 'staff-dashboard'
          : activePage;

  const allNavItems = [...STAFF_NAV, ...(isAdmin ? ADMIN_NAV : [])];
  const currentNav = allNavItems.find((n) => n.id === safePage) || STAFF_NAV[0];
  const isAdminPage = safePage.startsWith('admin-');

  const renderPage = () => {
    switch (safePage) {
      case 'staff-dashboard':
        return <StaffDashboard onNavigate={navigate} />;
      case 'accounts':
        return <AccountListPage />;
      case 'new-entry':
        return <NewEntryPage onSuccess={() => navigate('transactions')} />;
      case 'transactions':
        return <TransactionHistoryPage />;
      case 'daily-ledger':
        return <DailyLedgerPage />;
      case 'reports':
        return <ReportsPage key={safePage} adminMode={false} />;
      case 'monthly-backups':
        return <MonthlyBackupsPage />;
      case 'support-center':
        return <SupportCenterPage key={safePage} adminMode={false} onNavigate={navigate} />;
      case 'admin-dashboard':
        return <AdminDashboard onNavigate={navigate} />;
      case 'admin-staff':
        return <StaffManagementPage />;
      case 'admin-accounts':
        return <AccountManagementPage />;
      case 'admin-transactions':
        return <TransactionManagementPage />;
      case 'admin-balances':
        return <BalanceManagementPage />;
      case 'admin-closing':
        return <DailyClosingPage />;
      case 'admin-rates':
        return <ExchangeRatesPage />;
      case 'admin-reports':
        return <ReportsPage key={safePage} adminMode />;
      case 'admin-logs':
        return <ActivityLogsPage />;
      case 'admin-support':
        return <SupportCenterPage key={safePage} adminMode onNavigate={navigate} />;
      case 'admin-settings':
        return <SystemSettingsPage />;
      default:
        return <StaffDashboard onNavigate={navigate} />;
    }
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-white border-r border-slate-200 w-64">
      <div className="h-16 px-5 border-b border-slate-200 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-md bg-blue-700 text-white flex items-center justify-center">
            <BookOpenCheck className="w-4 h-4" />
          </div>
          <span className="text-lg font-bold tracking-tight text-slate-900 font-display">
            WebX
          </span>
        </div>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          aria-label="Close navigation menu"
          className="lg:hidden p-1 text-slate-500"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        <div>
          <div className="px-3 mb-2 text-[11px] font-semibold tracking-wider text-slate-400">
            Staff Panel
          </div>
          <div className="space-y-0.5">
            {STAFF_NAV.filter((item) =>
              item.id === 'reports'
                ? staffReportsAllowed
                : item.id === 'monthly-backups'
                  ? staffBackupsAllowed
                  : true
            ).map((item) => {
              const Icon = item.icon;
              const active = safePage === item.id;
              const shortcut = getShortcutForPage(item.id, {
                isAdmin: Boolean(isAdmin),
                staffCanViewReports: staffReportsAllowed,
                staffCanDownloadBackups: staffBackupsAllowed,
              });
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigate(item.id)}
                  title={
                    shortcut
                      ? `${item.label} (${shortcut.keys.join(' then ')})`
                      : item.label
                  }
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm rounded-md transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-blue-50 text-blue-800 font-semibold'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-medium'
                  }`}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <Icon
                      className={`w-4 h-4 shrink-0 ${
                        active ? 'text-blue-700' : 'text-slate-400'
                      }`}
                    />
                    <span className="truncate">{item.label}</span>
                  </span>
                  {shortcut && (
                    <kbd className="text-[10px] font-mono text-slate-400 shrink-0">
                      {shortcut.keys.join(' ')}
                    </kbd>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {isAdmin && (
          <div className="pt-3 border-t border-slate-100">
            <div className="px-3 mb-2 text-[11px] font-semibold tracking-wider text-violet-700">
              Admin Panel
            </div>
            <div className="space-y-0.5">
              {ADMIN_NAV.map((item) => {
                const Icon = item.icon;
                const active = safePage === item.id;
                const shortcut = getShortcutForPage(item.id, {
                  isAdmin: Boolean(isAdmin),
                  staffCanViewReports: staffReportsAllowed,
                });
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navigate(item.id)}
                    title={
                      shortcut
                        ? `${item.label} (${shortcut.keys.join(' then ')})`
                        : item.label
                    }
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm rounded-md transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-violet-50 text-violet-900 font-semibold'
                        : 'text-slate-600 hover:bg-violet-50/40 hover:text-slate-900 font-medium'
                    }`}
                  >
                    <span className="flex items-center gap-2.5 min-w-0">
                      <Icon
                        className={`w-4 h-4 shrink-0 ${
                          active ? 'text-violet-700' : 'text-slate-400'
                        }`}
                      />
                      <span className="truncate">{item.label}</span>
                    </span>
                    {shortcut && (
                      <kbd className="text-[10px] font-mono text-slate-400 shrink-0">
                        {shortcut.keys.join(' ')}
                      </kbd>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </nav>

      <div className="p-4 border-t border-slate-200 text-xs text-slate-500">
        <div className="font-medium text-slate-700 truncate">{user.name}</div>
        <div className="truncate text-[11px] text-slate-400">
          {user.role} · Asia/Dubai (GST)
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block shrink-0 no-print">{sidebarContent}</aside>

      {/* Mobile Sidebar Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/40"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative z-10 h-full">{sidebarContent}</div>
        </div>
      )}

      {/* Main Column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4 shrink-0 no-print">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-2 -ml-2 text-slate-600 hover:text-slate-900"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm truncate">
              <span
                className={
                  isAdminPage
                    ? 'font-semibold text-violet-700'
                    : 'font-semibold text-blue-700'
                }
              >
                {isAdminPage ? 'Admin' : 'Staff'}
              </span>
              <span className="text-slate-300">/</span>
              <span className="font-medium text-slate-800 truncate">
                {currentNav.label}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {/* Primary Display Currency Toggle */}
            <div className="hidden sm:flex items-center gap-1 p-1 bg-slate-100 rounded-md">
              <button
                type="button"
                onClick={() => setPrimaryCurrency('AED')}
                className={`px-2.5 py-1 text-xs font-semibold rounded transition-colors ${
                  primaryCurrency === 'AED'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                AED
              </button>
              <button
                type="button"
                onClick={() => setPrimaryCurrency('INR')}
                className={`px-2.5 py-1 text-xs font-semibold rounded transition-colors ${
                  primaryCurrency === 'INR'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                INR (₹)
              </button>
            </div>

            {/* Top Bar Quick Currency Converter */}
            <div ref={converterRef} className="relative">
              <button
                type="button"
                onClick={() => setConverterOpen((o) => !o)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono tabular-nums bg-slate-50 border border-slate-200 hover:border-blue-300 text-slate-700 rounded-md transition-colors whitespace-nowrap"
              >
                <ArrowLeftRight className="w-3.5 h-3.5 text-blue-700" />
                <span>
                  {rateInfo?.rateAvailable && rateInfo.rate
                    ? `1 AED = ₹${Number(rateInfo.rate).toFixed(2)}`
                    : 'Rate unavailable'}
                </span>
              </button>
              {converterOpen && (
                <div className="absolute right-0 mt-2 z-40">
                  <CurrencyConverterWidget compact />
                </div>
              )}
            </div>

            <div className="hidden md:flex flex-col text-right leading-tight">
              <span className="text-xs font-semibold text-slate-900">{user.name}</span>
              <span
                className={`text-[11px] font-medium ${
                  isAdmin ? 'text-violet-700' : 'text-blue-700'
                }`}
              >
                {user.role}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setCommandPaletteOpen(true)}
              title="Open Command Palette (Ctrl+K / ⌘K)"
              className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 bg-slate-50 border border-slate-200 hover:border-slate-300 hover:text-slate-900 rounded-md transition-colors whitespace-nowrap"
            >
              <Command className="w-3.5 h-3.5 text-slate-500" />
              <span className="hidden xl:inline">Quick Jump</span>
              <kbd className="px-1 py-0.2 bg-white border border-slate-200 rounded text-[10px] font-mono text-slate-500">
                ⌘K
              </kbd>
            </button>

            <button
              type="button"
              onClick={() => setShortcutHelpOpen(true)}
              title="Keyboard Shortcuts Reference (?)"
              aria-label="Keyboard Shortcuts Reference"
              className="inline-flex items-center justify-center p-1.5 text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 hover:text-slate-900 rounded-md transition-colors"
            >
              <Keyboard className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => navigate(isAdmin ? 'admin-support' : 'support-center')}
              title="Open Support Desk (S)"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50/70 border border-blue-200 hover:bg-blue-100/70 rounded-md transition-colors whitespace-nowrap"
            >
              <LifeBuoy className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Support</span>
            </button>

            <button
              type="button"
              onClick={logout}
              title="Sign Out (Shift+L)"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-md transition-colors whitespace-nowrap"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </header>

        {/* Fallback Rate Warning Banner */}
        {rateInfo?.fallbackWarning && (
          <div className="bg-amber-50 border-b border-amber-200 px-6 py-2.5 flex items-center gap-2 text-xs text-amber-900 no-print">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
            <span>{rateInfo.warningMessage}</span>
          </div>
        )}

        {/* Viewport Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1400px] w-full mx-auto">
          {renderPage()}
        </main>
      </div>

      {/* Pending Two-Key Chord Feedback Pill */}
      {pendingChord && (
        <div className="fixed bottom-4 left-4 z-50 px-3.5 py-2 rounded-md bg-slate-900 text-white text-xs font-mono shadow-lg flex items-center gap-2 no-print">
          <Keyboard className="w-3.5 h-3.5 text-blue-400" />
          <span>
            Press target key after <strong className="uppercase">{pendingChord}</strong>…
          </span>
          <span className="text-slate-400">(Esc cancels)</span>
        </div>
      )}

      <CommandPaletteModal
        open={commandPaletteOpen}
        shortcuts={availableShortcuts}
        onClose={() => setCommandPaletteOpen(false)}
        onExecute={executeShortcut}
      />

      <ShortcutHelpModal
        open={shortcutHelpOpen}
        shortcuts={availableShortcuts}
        onClose={() => setShortcutHelpOpen(false)}
      />

      <ConfirmModal
        open={logoutConfirmOpen}
        title="Sign Out of WebX"
        description="Confirm signing out of your active WebX bookkeeping session."
        confirmLabel="Sign Out"
        variant="primary"
        onConfirm={async () => {
          setLogoutConfirmOpen(false);
          await logout();
        }}
        onCancel={() => setLogoutConfirmOpen(false)}
      />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <WorkspaceShell />
      <ToastContainer />
    </AuthProvider>
  );
}
