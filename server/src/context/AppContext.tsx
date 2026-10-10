import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { UserSession } from '../lib/blog';
import { AUTH_EXPIRED_EVENT, logoutUserRequest, restoreUserSessionRequest } from '../lib/apiClient';
import { AppNotification, NotificationType, createNotification } from '../lib/notification';

const LEGACY_SESSION_KEYS = [
  'kitepop-admin-session',
  'kitepop-user-session',
  'kitepop-accounting-session'
];

interface AppContextType {
  notification: AppNotification | null;
  notify: (type: NotificationType, message: string, durationMs?: number) => void;
  clearNotification: () => void;
  authReady: boolean;
  userSession: UserSession | null;
  isAdmin: boolean;
  loginUser: (session: UserSession) => void;
  logoutUser: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

function clearLegacySessions() {
  for (const key of LEGACY_SESSION_KEYS) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Cookie identity still works when storage is unavailable.
    }
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [notification, setNotification] = useState<AppNotification | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [userSession, setUserSession] = useState<UserSession | null>(() => {
    clearLegacySessions();
    return null;
  });
  const identityRevisionRef = useRef(0);
  const mountedRef = useRef(true);
  const authRevalidationRef = useRef<{ revision: number; promise: Promise<void> } | null>(null);
  const logoutPromiseRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    if (!notification) return;
    const timer = window.setTimeout(() => {
      setNotification((current) => (current?.id === notification.id ? null : current));
    }, notification.durationMs);
    return () => window.clearTimeout(timer);
  }, [notification]);

  useEffect(() => {
    let cancelled = false;
    mountedRef.current = true;
    const restoreRevision = identityRevisionRef.current;
    const handleAuthExpired = () => {
      if (logoutPromiseRef.current) return;

      const revision = identityRevisionRef.current;
      if (authRevalidationRef.current?.revision === revision) return;

      const promise = restoreUserSessionRequest()
        .then((session) => {
          if (!cancelled && identityRevisionRef.current === revision) {
            identityRevisionRef.current = revision + 1;
            setUserSession(session);
          }
        })
        .catch(() => undefined)
        .finally(() => {
          if (authRevalidationRef.current?.promise === promise) {
            authRevalidationRef.current = null;
          }
        });
      authRevalidationRef.current = { revision, promise };
    };

    window.addEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
    void restoreUserSessionRequest()
      .then((session) => {
        if (!cancelled && identityRevisionRef.current === restoreRevision) {
          setUserSession(session);
        }
      })
      .catch(() => {
        if (!cancelled && identityRevisionRef.current === restoreRevision) {
          setUserSession(null);
        }
      })
      .finally(() => {
        if (!cancelled) setAuthReady(true);
      });

    return () => {
      cancelled = true;
      mountedRef.current = false;
      authRevalidationRef.current = null;
      window.removeEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
    };
  }, []);

  useEffect(() => {
    const head = document.head;
    let link = document.querySelector('link[rel="icon"]') as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      head.appendChild(link);
    }
    link.type = 'image/png';
    link.href = '/favicon.png';
  }, []);

  const notify = useCallback((type: NotificationType, message: string, durationMs?: number) => {
    setNotification(createNotification(type, message, durationMs));
  }, []);

  const clearNotification = useCallback(() => setNotification(null), []);

  const loginUser = useCallback((session: UserSession) => {
    identityRevisionRef.current += 1;
    setUserSession(session);
  }, []);

  const logoutUser = useCallback(() => {
    if (logoutPromiseRef.current) return logoutPromiseRef.current;

    const logoutRevision = identityRevisionRef.current + 1;
    identityRevisionRef.current = logoutRevision;
    const promise = logoutUserRequest().finally(() => {
      if (mountedRef.current && identityRevisionRef.current === logoutRevision) {
        setUserSession(null);
      }
      if (logoutPromiseRef.current === promise) {
        logoutPromiseRef.current = null;
      }
    });
    logoutPromiseRef.current = promise;
    return promise;
  }, []);

  const value = useMemo<AppContextType>(
    () => ({
      notification,
      notify,
      clearNotification,
      authReady,
      userSession,
      isAdmin: userSession?.user.permission === 'admin',
      loginUser,
      logoutUser
    }),
    [authReady, clearNotification, loginUser, logoutUser, notification, notify, userSession]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
}
