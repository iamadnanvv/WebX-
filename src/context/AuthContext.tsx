import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { signInWithPopup, signOut } from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase.ts';

export type RealtimeEventType =
  | 'ledger:updated'
  | 'accounts:updated'
  | 'rates:updated'
  | 'closing:updated'
  | 'staff:updated'
  | 'settings:updated'
  | 'activity:updated'
  | 'support:updated'
  | 'backups:updated';

export interface UserProfile {
  id: number;
  uid: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'STAFF';
  status: 'ACTIVE' | 'DISABLED';
}

export interface RateInfo {
  rate: string | null;
  baseRate: string | null;
  rateDate: string;
  source: 'API' | 'MANUAL' | 'FALLBACK' | 'UNAVAILABLE';
  rateAvailable: boolean;
  fallbackWarning: boolean;
  warningMessage?: string;
}

export interface SystemSettings {
  defaultCurrency: 'AED' | 'INR';
  reportingCurrency: 'INR' | 'AED';
  rateRefreshMode: 'AUTO' | 'MANUAL';
  rateRefreshSchedule: string;
  rateMarkup: string;
  timezone: string;
  staffCanViewReports: boolean;
  staffCanExport: boolean;
  staffCanAddAccounts: boolean;
  staffCanDownloadBackups?: boolean;
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  text: string;
}

interface AuthContextValue {
  user: UserProfile | null;
  token: string | null;
  settings: SystemSettings | null;
  rateInfo: RateInfo | null;
  primaryCurrency: 'AED' | 'INR';
  setPrimaryCurrency: (c: 'AED' | 'INR') => void;
  loading: boolean;
  realtimeConnected: boolean;
  bootstrapAdmin: (name: string, email: string, password: string) => Promise<void>;
  loginWithCredentials: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  refreshWorkspace: () => Promise<void>;
  refreshActiveViews: () => Promise<void>;
  apiFetch: <T = any>(url: string, options?: RequestInit) => Promise<T>;
  downloadFile: (url: string, filename: string) => Promise<void>;
  subscribeRealtime: (
    eventTypes: RealtimeEventType[],
    callback: () => void
  ) => () => void;
  notify: (type: ToastMessage['type'], text: string) => void;
  toasts: ToastMessage[];
  dismissToast: (id: string) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Token held strictly in React memory (never persisted in localStorage/sessionStorage)
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [rateInfo, setRateInfo] = useState<RateInfo | null>(null);
  const [primaryCurrency, setPrimaryCurrency] = useState<'AED' | 'INR'>('AED');
  const [loading, setLoading] = useState(false);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const listenersRef = useRef<
    Array<{ events: RealtimeEventType[]; cb: () => void }>
  >([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback(
    (type: ToastMessage['type'], text: string) => {
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev, { id, type, text }]);
      setTimeout(() => {
        dismissToast(id);
      }, 4500);
    },
    [dismissToast]
  );

  const subscribeRealtime = useCallback(
    (eventTypes: RealtimeEventType[], callback: () => void) => {
      const entry = { events: eventTypes, cb: callback };
      listenersRef.current.push(entry);
      return () => {
        listenersRef.current = listenersRef.current.filter((l) => l !== entry);
      };
    },
    []
  );

  const clearExpiredSession = useCallback(
    (message: string) => {
      signOut(auth).catch(() => {});
      setToken(null);
      setUser(null);
      setSettings(null);
      setRateInfo(null);
      hasUserToggledCurrencyRef.current = false;
      setRealtimeConnected(false);
      notify('error', message);
    },
    [notify]
  );

  const apiFetch = useCallback(
    async <T = any>(url: string, options: RequestInit = {}): Promise<T> => {
      if (!token) {
        throw new Error('Authentication required');
      }
      const headers = new Headers(options.headers || {});
      headers.set('Authorization', `Bearer ${token}`);
      if (options.body && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }

      const resp = await fetch(url, { ...options, headers });
      const data = await resp.json().catch(() => ({}));
      if (resp.status === 401) {
        clearExpiredSession(
          data.error || 'Session expired or access revoked. Please sign in again.'
        );
        throw new Error(data.error || 'Session expired');
      }
      if (!resp.ok) {
        throw new Error(data.error || `Request failed (${resp.status})`);
      }
      return data as T;
    },
    [token, clearExpiredSession]
  );

  const downloadFile = useCallback(
    async (url: string, filename: string) => {
      if (!token) throw new Error('Authentication required');
      const resp = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (resp.status === 401) {
        const err = await resp.json().catch(() => ({}));
        clearExpiredSession(
          err.error || 'Session expired or access revoked. Please sign in again.'
        );
        throw new Error(err.error || 'Session expired');
      }
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || 'Export failed');
      }
      const blob = await resp.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objUrl);
    },
    [token, clearExpiredSession]
  );

  const hasUserToggledCurrencyRef = useRef(false);

  const handleSetPrimaryCurrency = useCallback((c: 'AED' | 'INR') => {
    hasUserToggledCurrencyRef.current = true;
    setPrimaryCurrency(c);
  }, []);

  const loadWorkspaceWithToken = useCallback(
    async (activeToken: string) => {
      const resp = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${activeToken}` },
      });
      const data = await resp.json().catch(() => ({}));
      if (resp.status === 401) {
        clearExpiredSession(
          data.error || 'Session expired or access revoked. Please sign in again.'
        );
        throw new Error(data.error || 'Session expired');
      }
      if (!resp.ok) {
        throw new Error(data.error || 'Failed to verify session');
      }
      setUser(data.user);
      setSettings(data.settings);
      setRateInfo(data.rateInfo);
      if (!hasUserToggledCurrencyRef.current && data.settings?.defaultCurrency) {
        setPrimaryCurrency(data.settings.defaultCurrency);
      }
    },
    [clearExpiredSession]
  );

  const refreshWorkspace = useCallback(async () => {
    if (!token) return;
    await loadWorkspaceWithToken(token);
  }, [token, loadWorkspaceWithToken]);

  const refreshActiveViews = useCallback(async () => {
    if (!token) return;
    await loadWorkspaceWithToken(token);
    listenersRef.current.forEach((listener) => listener.cb());
  }, [token, loadWorkspaceWithToken]);

  const bootstrapAdmin = useCallback(
    async (name: string, email: string, password: string) => {
      setLoading(true);
      try {
        const resp = await fetch('/api/auth/bootstrap', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, password }),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          throw new Error(data.error || 'Administrator setup failed');
        }
        setToken(data.token);
        await loadWorkspaceWithToken(data.token);
        notify('success', `Workspace administrator ${data.user.name} initialized`);
      } finally {
        setLoading(false);
      }
    },
    [loadWorkspaceWithToken, notify]
  );

  const loginWithCredentials = useCallback(
    async (email: string, password: string) => {
      setLoading(true);
      try {
        const resp = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          throw new Error(data.error || 'Invalid credentials');
        }
        setToken(data.token);
        await loadWorkspaceWithToken(data.token);
        notify('success', `Signed in as ${data.user.name}`);
      } finally {
        setLoading(false);
      }
    },
    [loadWorkspaceWithToken, notify]
  );

  const loginWithGoogle = useCallback(async () => {
    setLoading(true);
    try {
      const cred = await signInWithPopup(auth, googleAuthProvider);
      const idToken = await cred.user.getIdToken();
      const syncResp = await fetch('/api/auth/firebase-sync', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const syncData = await syncResp.json().catch(() => ({}));
      if (!syncResp.ok) {
        throw new Error(syncData.error || 'Google Sign-In verification failed');
      }
      setToken(idToken);
      await loadWorkspaceWithToken(idToken);
      notify('success', `Signed in as ${syncData.user.name}`);
    } finally {
      setLoading(false);
    }
  }, [loadWorkspaceWithToken, notify]);

  const logout = useCallback(async () => {
    try {
      if (token) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => {});
      }
      await signOut(auth).catch(() => {});
    } finally {
      setToken(null);
      setUser(null);
      setSettings(null);
      setRateInfo(null);
      hasUserToggledCurrencyRef.current = false;
      setRealtimeConnected(false);
      notify('info', 'Signed out of WebX');
    }
  }, [token, notify]);

  // Periodically refresh Firebase ID token before its 60m expiry when signed in with Google SSO
  useEffect(() => {
    if (!token || token.startsWith('webx.')) return;
    const timer = setInterval(async () => {
      try {
        if (auth.currentUser) {
          const fresh = await auth.currentUser.getIdToken(true);
          setToken(fresh);
        }
      } catch {
        // Ignore transient refresh failures
      }
    }, 45 * 60 * 1000);
    return () => clearInterval(timer);
  }, [token]);

  // Real-time WebSocket connection with automatic reconnect and state resync
  useEffect(() => {
    if (!token) {
      setRealtimeConnected(false);
      return;
    }

    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    let attempt = 0;

    const connect = () => {
      if (stopped) return;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${proto}//${window.location.host}/ws`;
      ws = new WebSocket(url);

      ws.onopen = () => {
        ws?.send(JSON.stringify({ type: 'auth', token }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg?.type === 'connected') {
            setRealtimeConnected(true);
            if (attempt > 0) {
              // Full state resync after reconnect
              loadWorkspaceWithToken(token).catch(() => {});
              listenersRef.current.forEach((l) => l.cb());
            }
            attempt = 0;
            return;
          }

          const eventType = msg?.type as RealtimeEventType | undefined;
          if (!eventType) return;

          if (eventType === 'rates:updated' || eventType === 'settings:updated') {
            loadWorkspaceWithToken(token).catch(() => {});
          }

          listenersRef.current.forEach((listener) => {
            if (listener.events.includes(eventType)) {
              listener.cb();
            }
          });
        } catch {
          // Ignore malformed message
        }
      };

      ws.onclose = () => {
        setRealtimeConnected(false);
        if (!stopped) {
          attempt += 1;
          const delay = Math.min(15000, 1000 * Math.pow(2, Math.min(attempt, 4)));
          reconnectTimer = setTimeout(connect, delay);
        }
      };
    };

    connect();

    return () => {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [token, loadWorkspaceWithToken]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        settings,
        rateInfo,
        primaryCurrency,
        setPrimaryCurrency: handleSetPrimaryCurrency,
        loading,
        realtimeConnected,
        bootstrapAdmin,
        loginWithCredentials,
        loginWithGoogle,
        logout,
        refreshWorkspace,
        refreshActiveViews,
        apiFetch,
        downloadFile,
        subscribeRealtime,
        notify,
        toasts,
        dismissToast,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

export function useRealtimeRefresh(
  events: RealtimeEventType[],
  onEvent: () => void
) {
  const { subscribeRealtime } = useAuth();
  const callbackRef = useRef(onEvent);
  callbackRef.current = onEvent;
  const key = events.join(',');

  useEffect(() => {
    const eventList = key.split(',') as RealtimeEventType[];
    return subscribeRealtime(eventList, () => callbackRef.current());
  }, [key, subscribeRealtime]);
}
