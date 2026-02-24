import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import axios from 'axios';
import type { AdminUser } from '@/types/admin';

const STORAGE_KEY = 'admin_api_key';
const STATION_ID = import.meta.env.VITE_STATION_ID || 'la_voz_de_la_verdad';
const STATION_URL = import.meta.env.VITE_STATION_URL || '';

interface AdminAuthContextType {
  user: AdminUser | null;
  isLoading: boolean;
  error: string | null;
  login: (apiKey: string) => Promise<boolean>;
  logout: () => void;
  apiKey: string | null;
}

const AdminAuthContext = createContext<AdminAuthContextType | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return { apiKey: stored, stationId: STATION_ID };
    return null;
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = useCallback(async (apiKey: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      // Verificar que la API key sea válida consultando el estado de la estación
      const res = await axios.get(
        `${STATION_URL}/api/station/${STATION_ID}/status`,
        {
          headers: { Authorization: `Bearer ${apiKey}` },
          timeout: 8000,
        }
      );
      const stationName: string = res.data?.name || '';
      const adminUser: AdminUser = { apiKey, stationId: STATION_ID, stationName };
      setUser(adminUser);
      localStorage.setItem(STORAGE_KEY, apiKey);
      return true;
    } catch (err) {
      if (axios.isAxiosError(err)) {
        if (err.response?.status === 403 || err.response?.status === 401) {
          setError('API key inválida o sin permisos suficientes.');
        } else {
          setError('No se pudo conectar con el servidor.');
        }
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
  }, []);

  return (
    <AdminAuthContext.Provider
      value={{ user, isLoading, error, login, logout, apiKey: user?.apiKey ?? null }}
    >
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth(): AdminAuthContextType {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth must be used within AdminAuthProvider');
  return ctx;
}
