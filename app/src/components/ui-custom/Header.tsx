import { motion } from 'framer-motion';
import { Radio, Menu, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { ThemeToggle } from './ThemeToggle';
import { useTheme } from '@/hooks';

interface HeaderProps {
  stationName?: string;
}

export function Header({ stationName = 'RadioStream' }: HeaderProps) {
  const { resolvedTheme } = useTheme();

  const shareApp = async () => {
    const shareData = {
      title: stationName,
      text: `Escucha ${stationName} - Tu emisora online 24/7`,
      url: window.location.href,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err: unknown) {
        if ((err as Error)?.name !== 'AbortError') {
          await copyToClipboard(shareData.url);
        }
      }
    } else {
      await copyToClipboard(shareData.url);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Enlace copiado al portapapeles');
    } catch {
      toast.error('No se pudo copiar. URL: ' + text);
    }
  };

  return (
    <motion.header
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`sticky top-0 z-50 w-full border-b backdrop-blur-lg ${
        resolvedTheme === 'dark'
          ? 'bg-slate-900/80 border-slate-800'
          : 'bg-white/80 border-slate-200'
      }`}
    >
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <motion.div
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center"
          >
            <Radio className="w-5 h-5 text-primary-foreground" />
          </motion.div>
          <div className="hidden sm:block">
            <h1 className="font-bold text-lg leading-tight">{stationName}</h1>
            <p className="text-xs text-muted-foreground">24/7 Online Radio</p>
          </div>
        </div>

        {/* Desktop actions */}
        <div className="hidden md:flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={shareApp}>
            <Share2 className="w-5 h-5" />
          </Button>
          <ThemeToggle />
        </div>

        {/* Mobile menu */}
        <div className="md:hidden flex items-center gap-2">
          <ThemeToggle />
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="w-5 h-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className={
              resolvedTheme === 'dark' ? 'bg-slate-900 border-slate-800' : ''
            }>
              <SheetHeader className="sr-only">
                <SheetTitle>Menú</SheetTitle>
                <SheetDescription>Opciones de la aplicación de radio</SheetDescription>
              </SheetHeader>
              <div className="flex flex-col gap-4 mt-8">
                <Button variant="ghost" className="justify-start" onClick={shareApp}>
                  <Share2 className="w-5 h-5 mr-2" />
                  Compartir
                </Button>
                <div className="border-t border-slate-200 dark:border-slate-800 pt-4">
                  <p className="text-sm text-muted-foreground px-4">
                    {stationName}
                  </p>
                  <p className="text-xs text-muted-foreground px-4 mt-1">
                    Versión 1.0.0
                  </p>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </motion.header>
  );
}
