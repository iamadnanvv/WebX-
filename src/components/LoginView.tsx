import { useEffect, useState } from 'react';
import {
  BookOpenCheck,
  KeyRound,
  LifeBuoy,
  Lock,
  Mail,
  ShieldCheck,
  User,
  UserPlus,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import {
  OFFICIAL_SUPPORT_EMAIL,
  type SupportCategory,
  buildSupportMailtoUrl,
} from '../lib/supportCatalog.ts';
import { PreLoginSupportModal } from './PreLoginSupportModal.tsx';
import { hasOpenModalDialog, isEditableTarget } from '../lib/shortcuts.ts';

export function LoginView() {
  const { bootstrapAdmin, loginWithCredentials, loginWithGoogle, loading } = useAuth();
  const [needsAdminSetup, setNeedsAdminSetup] = useState<boolean | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [supportModalOpen, setSupportModalOpen] = useState(false);
  const [supportCategory, setSupportCategory] =
    useState<SupportCategory>('ACCOUNT_SUPPORT');

  const openSupport = (cat: SupportCategory) => {
    setSupportCategory(cat);
    setSupportModalOpen(true);
  };

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/bootstrap-status')
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setNeedsAdminSetup(Boolean(d.needsAdminSetup));
      })
      .catch(() => {
        if (!cancelled) setNeedsAdminSetup(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (hasOpenModalDialog()) return;
      if (e.altKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        openSupport('ACCOUNT_SUPPORT');
        return;
      }
      if (!isEditableTarget(e.target) && !e.ctrlKey && !e.metaKey && !e.altKey && e.key === '?') {
        e.preventDefault();
        openSupport('ACCOUNT_SUPPORT');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      if (needsAdminSetup) {
        if (password.length < 8) {
          setError('Administrator password must be at least 8 characters.');
          return;
        }
        if (password !== confirmPassword) {
          setError('Passwords do not match.');
          return;
        }
        await bootstrapAdmin(name, email, password);
      } else {
        await loginWithCredentials(email, password);
      }
    } catch (err: any) {
      setError(err?.message || 'Authentication failed');
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    try {
      await loginWithGoogle();
    } catch (err: any) {
      setError(err?.message || 'Google Sign-In failed');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex items-center justify-center gap-2.5">
          <div className="w-10 h-10 rounded-lg bg-blue-700 text-white flex items-center justify-center">
            <BookOpenCheck className="w-5 h-5" />
          </div>
          <span className="text-2xl font-bold tracking-tight text-slate-900 font-display">
            WebX
          </span>
        </div>
        <h1 className="mt-4 text-center text-2xl font-semibold text-slate-900">
          {needsAdminSetup
            ? 'Initialize Workspace Administrator'
            : 'Multi-Currency Bookkeeping Portal'}
        </h1>
        <p className="mt-1.5 text-center text-sm text-slate-600">
          {needsAdminSetup
            ? 'Set up the primary Administrator account to activate your WebX ledger.'
            : 'AED & INR Ledger Operations · Asia/Dubai (GST)'}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white border border-slate-200 rounded-lg p-7 space-y-6">
          {needsAdminSetup === null ? (
            <div className="space-y-3">
              <div className="h-10 bg-slate-100 rounded animate-pulse" />
              <div className="h-10 bg-slate-100 rounded animate-pulse" />
              <div className="h-10 bg-slate-100 rounded animate-pulse" />
            </div>
          ) : (
            <>
              {needsAdminSetup && (
                <div className="flex items-start gap-2.5 p-3 bg-violet-50 border border-violet-200 rounded-md text-xs text-violet-900">
                  <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-violet-700" />
                  <span>
                    First-run setup: create your Administrator credentials below or sign in with Google to claim workspace ownership.
                  </span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {needsAdminSetup && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">
                      Administrator Full Name
                    </label>
                    <div className="relative">
                      <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        required
                        minLength={2}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Enter your full name"
                        className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Work Email
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@company.ae"
                      className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="password"
                      required
                      minLength={needsAdminSetup ? 8 : 1}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={
                        needsAdminSetup ? 'Minimum 8 characters' : 'Enter password'
                      }
                      className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                    />
                  </div>
                </div>

                {needsAdminSetup && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">
                      Confirm Password
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="password"
                        required
                        minLength={8}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Re-enter password"
                        className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                      />
                    </div>
                  </div>
                )}

                {error && (
                  <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className={`w-full py-2.5 px-4 text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50 ${
                    needsAdminSetup
                      ? 'bg-violet-700 hover:bg-violet-800'
                      : 'bg-blue-700 hover:bg-blue-800'
                  }`}
                >
                  {loading
                    ? 'Processing...'
                    : needsAdminSetup
                      ? 'Create Administrator & Launch WebX'
                      : 'Sign in with Credentials'}
                </button>
              </form>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-white px-3 text-slate-500">or continue with SSO</span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="w-full py-2.5 px-4 bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 text-sm font-medium rounded-md transition-colors flex items-center justify-center gap-2.5 disabled:opacity-50"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96z"
                  />
                </svg>
                Sign in with Google
              </button>
            </>
          )}
        </div>

        {/* Official WebX Support Desk Access */}
        <div className="mt-4 bg-white border border-slate-200 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
              <LifeBuoy className="w-4 h-4 text-blue-700 shrink-0" />
              <span>Need Assistance?</span>
              <kbd className="hidden sm:inline px-1.5 py-0.5 text-[10px] font-mono bg-slate-100 border border-slate-200 rounded text-slate-500">
                Alt+S
              </kbd>
            </div>
            <a
              href={buildSupportMailtoUrl({ category: 'ACCOUNT_SUPPORT' })}
              className="text-xs font-mono font-medium text-blue-700 hover:underline"
            >
              {OFFICIAL_SUPPORT_EMAIL}
            </a>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => openSupport('ACCOUNT_SUPPORT')}
              className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 text-xs font-medium bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-200 text-slate-700 hover:text-blue-800 rounded-md transition-colors"
            >
              <KeyRound className="w-3.5 h-3.5 text-blue-700" />
              Login & Recovery
            </button>
            <button
              type="button"
              onClick={() => openSupport('STAFF_ONBOARDING')}
              className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 text-xs font-medium bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-200 text-slate-700 hover:text-blue-800 rounded-md transition-colors"
            >
              <UserPlus className="w-3.5 h-3.5 text-blue-700" />
              Staff Onboarding
            </button>
            <button
              type="button"
              onClick={() => openSupport('CUSTOMER_SUPPORT')}
              className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 text-xs font-medium bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-200 text-slate-700 hover:text-blue-800 rounded-md transition-colors"
            >
              <Mail className="w-3.5 h-3.5 text-blue-700" />
              General & Billing
            </button>
          </div>
        </div>
      </div>

      <PreLoginSupportModal
        open={supportModalOpen}
        initialCategory={supportCategory}
        onClose={() => setSupportModalOpen(false)}
      />
    </div>
  );
}
