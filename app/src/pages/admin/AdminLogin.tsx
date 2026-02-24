import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Radio, Key, Eye, EyeOff, ExternalLink, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { useTheme } from '@/hooks';
import { ThemeToggle } from '@/components/ui-custom';

export default function AdminLogin() {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const { login, isLoading, error } = useAdminAuth();
  const navigate = useNavigate();
  const { resolvedTheme } = useTheme();

  const isDark = resolvedTheme === 'dark';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim()) return;
    const ok = await login(apiKey.trim());
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
        className="w-full max-w-md"
      >
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
          <CardHeader className="pb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Key className="w-4 h-4 text-primary" />
              Acceso con API Key
            </h2>
            <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Ingresa tu API Key de AzuraCast para continuar
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="relative">
                <Input
                  type={showKey ? 'text' : 'password'}
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className={`pr-10 font-mono text-sm ${
                    isDark ? 'bg-slate-900 border-slate-600' : ''
                  }`}
                  disabled={isLoading}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {error && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <Button type="submit" className="w-full" disabled={isLoading || !apiKey.trim()}>
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Verificando...
                  </span>
                ) : (
                  'Ingresar al panel'
                )}
              </Button>
            </form>

            <div className={`border-t pt-4 ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
              <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                ¿No tienes una API Key?
              </p>
              <a
                href="http://localhost/admin/api-keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline inline-flex items-center gap-1 mt-1"
              >
                Generar en el panel de AzuraCast
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </CardContent>
        </Card>

        <div className="mt-6 text-center">
          <a href="/" className={`text-sm hover:underline ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            ← Volver al reproductor
          </a>
        </div>
      </motion.div>
    </div>
  );
}
