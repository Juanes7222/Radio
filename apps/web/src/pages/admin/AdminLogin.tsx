import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'framer-motion';
import { Radio, ShieldCheck, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { auth, googleProvider } from '@/lib/firebase';
import { signInWithPopup, type UserCredential } from 'firebase/auth';

interface FirebaseAuthError {
  code?: string;
  message?: string;
}

function isPopupClosedByUser(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as FirebaseAuthError).code === 'auth/popup-closed-by-user'
  );
}

function getFirebaseErrorMessage(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'message' in err) {
    return String((err as FirebaseAuthError).message ?? 'Error al iniciar sesion con Google.');
  }
  return 'Error al iniciar sesion con Google.';
}

export default function AdminLogin() {
  const { login, isLoading, error, user } = useAdminAuth();
  const navigate = useNavigate();
  const [firebaseError, setFirebaseError] = useState<string | null>(null);

  useEffect(() => {
    if (user) navigate('/admin/dashboard', { replace: true });
  }, [user, navigate]);

  const handleGoogleSignIn = async () => {
    if (!auth) {
      setFirebaseError('Firebase no esta configurado. Revisa VITE_FIREBASE_CONFIG.');
      return;
    }

    setFirebaseError(null);

    try {
      const result: UserCredential = await signInWithPopup(auth, googleProvider);
      const idToken = await result.user.getIdToken();
      const ok = await login(idToken);
      if (ok) navigate('/admin/dashboard');
    } catch (err: unknown) {
      if (isPopupClosedByUser(err)) {
        return;
      }
      setFirebaseError(getFirebaseErrorMessage(err));
    }
  };

  const displayError = error ?? firebaseError;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 transition-colors duration-300 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-sm"
      >
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="p-3 rounded-full bg-primary/10">
            <Radio className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Panel Admin</h1>
            <p className="text-sm text-slate-400">
              Gestion de la estacion
            </p>
          </div>
        </div>

        <Card className="border-slate-700 bg-slate-800/60 backdrop-blur">
          <CardHeader className="pb-4 text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <ShieldCheck className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold">Acceso seguro</h2>
            </div>
            <p className="text-sm text-slate-400">
              Solo cuentas Google autorizadas pueden acceder
            </p>
          </CardHeader>

          <CardContent className="flex flex-col items-center gap-4">
            <button
              onClick={handleGoogleSignIn}
              disabled={isLoading}
              className={`flex items-center justify-center gap-3 w-full px-6 py-3 rounded-lg border text-sm font-medium transition-colors ${
                isLoading ? 'opacity-50 pointer-events-none' : ''
              } bg-white text-slate-900 hover:bg-gray-100 border-gray-300`}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              {isLoading ? 'Verificando acceso...' : 'Iniciar sesion con Google'}
            </button>

            {isLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                Verificando acceso...
              </div>
            )}

            {displayError && (
              <div className="w-full flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{displayError}</span>
              </div>
            )}

            <p className="text-xs text-center text-slate-500">
              Si tienes problemas para acceder, contacta al administrador del sistema.
            </p>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
