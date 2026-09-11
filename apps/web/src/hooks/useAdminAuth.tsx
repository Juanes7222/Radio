import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';
import axios from 'axios';
import type { AdminPermission, AdminRole, AdminUser } from '@radio/types';
import { hasAdminPermission } from '@radio/types';
import { apiUrl } from '@/config';

const STORAGE_KEY = 'admin_session';
const STATION_ID = import.meta.env.VITE_STATION_ID || 'la_voz_de_la_verdad';

interface AdminAuthContextType {
  user: AdminUser | null;
  isLoading: boolean;
  error: string | null;
  login: (idToken: string) => Promise<boolean>;
  logout: () => void;
  token: string | null;
  apiKey: string | null;
  hasPermission: (permission: AdminPermission) => boolean;
  isSuperAdmin: boolean;
}

const AdminAuthContext = createContext<AdminAuthContextType | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? (JSON.parse(stored) as AdminUser) : null;
    } catch {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Validate the persisted session on mount: a stored JWT does not
  // guarantee it is still valid, so check it against the backend once.
  // The response carries fresh role/permissions; network failures keep
  // the session, only an explicit 401 clears it. A 403 (revoked
  // permission set mid-session) refreshes from cache then forces login.
  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    axios
      .get<{ user: AdminUser }>(apiUrl('/admin-api/auth/me'), {
        headers: { Authorization: `Bearer ${user.token}` },
        timeout: 10000,
      })
      .then((res) => {
        if (cancelled) return;
        const fresh: AdminUser = { ...res.data.user, stationId: STATION_ID, token: user.token };
        setUser(fresh);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
      })
      .catch((err) => {
        if (cancelled) return;
        if (axios.isAxiosError(err) && err.response?.status === 401) {
          localStorage.removeItem(STORAGE_KEY);
          setUser(null);
        }
      });

    return () => {
      cancelled = true;
    };
    // Only revalidate when the stored token changes, not on every user refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.token]);

  const login = useCallback(async (idToken: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await axios.post<{
        token: string;
        user: {
          email: string;
          name: string;
          picture: string;
          stationName: string;
          role: AdminRole;
          permissions: AdminPermission[];
        };
      }>(apiUrl('/admin-api/auth/google'), { credential: idToken }, { timeout: 10000 });

      const adminUser: AdminUser = {
        ...res.data.user,
        stationId: STATION_ID,
        token: res.data.token,
      };

      setUser(adminUser);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(adminUser));
      return true;
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const msg = err.response?.data?.error as string | undefined;
        setError(
          err.response?.status === 403
            ? (msg ?? 'Tu cuenta de Google no tiene acceso a este panel.')
            : (msg ?? 'Error al conectar con el servidor.')
        );
      } else {
        setError('Error desconocido.');
      }
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
    axios.post(apiUrl('/admin-api/auth/logout')).catch(() => {});
  }, []);

  const hasPermission = useCallback(
    (permission: AdminPermission) =>
      hasAdminPermission(user?.role, user?.permissions, permission),
    [user?.role, user?.permissions]
  );

  return (
    <AdminAuthContext.Provider
      value={{
        user,
        isLoading,
        error,
        login,
        logout,
        token: user?.token ?? null,
        apiKey: user?.token ?? null,
        hasPermission,
        isSuperAdmin: user?.role === 'SUPERADMIN',
      }}
    >
      {children}
    </AdminAuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAdminAuth(): AdminAuthContextType {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth must be used within AdminAuthProvider');
  return ctx;
}
