import { useState, useEffect } from 'react';
import { Download, X, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallDialog, setShowInstallDialog] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Verificar si ya está instalada
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
      return;
    }

    // Escuchar evento beforeinstallprompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      
      // Mostrar diálogo después de 5 segundos
      setTimeout(() => {
        setShowInstallDialog(true);
      }, 5000);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Escuchar evento appinstalled
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      setShowInstallDialog(false);
    };

    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
    
    setShowInstallDialog(false);
  };

  const handleDismiss = () => {
    setShowInstallDialog(false);
    // Guardar en localStorage para no mostrar de nuevo
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
  };

  // No mostrar si ya está instalada o fue descartada recientemente
  if (isInstalled) return null;
  
  const dismissed = localStorage.getItem('pwa-install-dismissed');
  if (dismissed && Date.now() - parseInt(dismissed) < 7 * 24 * 60 * 60 * 1000) {
    return null;
  }

  return (
    <Dialog open={showInstallDialog} onOpenChange={setShowInstallDialog}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="w-5 h-5" />
            Instalar aplicación
          </DialogTitle>
          <DialogDescription>
            Instala nuestra radio en tu dispositivo para acceder rápidamente y escuchar offline.
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-4 p-4 bg-slate-100 dark:bg-slate-800 rounded-lg">
            <div className="w-16 h-16 bg-primary rounded-xl flex items-center justify-center">
              <span className="text-2xl font-bold text-primary-foreground">R</span>
            </div>
            <div>
              <h3 className="font-semibold">RadioStream</h3>
              <p className="text-sm text-muted-foreground">Tu emisora online 24/7</p>
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleInstall} className="flex-1">
              <Download className="w-4 h-4 mr-2" />
              Instalar
            </Button>
            <Button variant="outline" onClick={handleDismiss}>
              <X className="w-4 h-4 mr-2" />
              Ahora no
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
