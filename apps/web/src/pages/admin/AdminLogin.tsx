import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Radio, ShieldCheck, AlertCircle } from 'lucide-react';
import { GoogleLogin, type CredentialResponse } from '@react-oauth/google';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { useTheme } from '@/hooks';
import { ThemeToggle } from '@/components/ui-custom';

export default function AdminLogin() {
  const { login, isLoading, error, user } = useAdminAuth();
  const navigate = useNavigate();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  // Si ya tiene sesión, redirigir
  useEffect(() => {
    if (user) navigate('/admin/dashboard', { replace: true });
  }, [user, navigate]);

  const handleGoogleSuccess = async (response: CredentialResponse) => {
    if (!response.credential) return;
    const ok = await login(response.credential);
    if (ok) navigate('/admin/dashboard');
  };

  return (
    <div
      className={`min-h-screen flex items-center justify-center p-4 transition-colors duration-300 ${
        isDark
          ? 'bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white'
          : 'bg-gradient-to-br from-slate-50 via-white to-slate-100 text-slate-900'
      }`}
    >
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-sm"
      >
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="p-3 rounded-full bg-primary/10">
            <Radio className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Panel Admin</h1>
            <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Gestión de la estación
            </p>
          </div>
        </div>

        <Card className={isDark ? 'border-slate-700 bg-slate-800/60 backdrop-blur' : ''}>
          <CardHeader className="pb-4 text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <ShieldCheck className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold">Acceso seguro</h2>
            </div>
            <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Solo cuentas Google autorizadas pueden acceder
            </p>
          </CardHeader>

          <CardContent className="flex flex-col items-center gap-4">
            {/* Botón de Google */}
            <div className={`${isLoading ? 'opacity-50 pointer-events-none' : ''}`}>
              <GoogleLogin
                onSuccess={handleGoogleSuccess}
                onError={() => {}}
                theme={isDark ? 'filled_black' : 'outline'}
                shape="rectangular"
                size="large"
                text="signin_with"
              />
            </div>

            {isLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                Verificando acceso…
              </div>
            )}

            {error && (
              <div className="w-full flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <p className={`text-xs text-center ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              Si tienes problemas para acceder, contacta al administrador del sistema.
            </p>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}