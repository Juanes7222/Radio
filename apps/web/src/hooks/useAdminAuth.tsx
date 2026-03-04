import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import axios from 'axios';
import type { AdminUser } from '@/types/admin';

const STORAGE_KEY = 'admin_session';
const STATION_ID = import.meta.env.VITE_STATION_ID || 'la_voz_de_la_verdad';

interface AdminAuthContextType {
  user: AdminUser | null;
  isLoading: boolean;
  error: string | null;
  login: (googleCredential: string) => Promise<boolean>;
  logout: () => void;
  token: string | null;
  apiKey: string | null;
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

  const login = useCallback(async (googleCredential: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await axios.post<{
        token: string;
        user: { email: string; name: string; picture: string; stationName: string };
      }>('/admin-api/auth/google', { credential: googleCredential }, { timeout: 10000 });

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
    axios.post('/admin-api/auth/logout').catch(() => {});
  }, []);

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
