import { useState } from 'react';
import { motion } from 'framer-motion';
import { Menu, Share2, Home, CalendarClock, CircleQuestionMark, FileKey, Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { ShareModal } from './SharedModla';
import { StationLogo } from './OptimizedLogo';
import { useNavigate, useLocation } from 'react-router';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface HeaderProps {
  stationName?: string;
  onOpenPrayer?: () => void;
}

export function Header({ stationName = 'La Voz de la Verdad', onOpenPrayer }: HeaderProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const isHome = location.pathname === '/';

  const [shareOpen, setShareOpen] = useState(false);

  return (

    <>
      <ShareModal
        open={shareOpen}
        onOpenChange={setShareOpen}
        stationName={stationName}
      />

    <motion.header
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
      className="sticky top-0 z-50 w-full border-b backdrop-blur-xl bg-background/70 border-border/50 supports-[backdrop-filter]:bg-background/60 will-change-transform"
    >
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-3">
          {!isHome && (
            <motion.div
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.14, ease: [0.23, 1, 0.32, 1] }}
              className="w-[72px] h-10 rounded-xl overflow-hidden flex items-center justify-center cursor-pointer p-1 will-change-transform"
              onClick={() => navigate('/')}
              role="button"
              tabIndex={0}
              aria-label="Ir al inicio"
              onKeyDown={(e) => e.key === 'Enter' && navigate('/')}
            >
              <StationLogo className="w-full h-full object-contain" />
            </motion.div>
          )}
          <div className="hidden sm:block">
            <h1 className="font-display text-[17px] leading-tight tracking-tight">{stationName}</h1>
            <p className="text-[11px] font-mono tracking-widest uppercase text-muted-foreground">24/7 · Cartago</p>
          </div>
        </div>
        {/* Desktop actions */}
        <TooltipProvider>
        <div className="hidden md:flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={() => setShareOpen(true)}>
                <Share2 className="w-5 h-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Compartir</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
                <Home className="w-5 h-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Inicio</TooltipContent>
          </Tooltip>

          {onOpenPrayer && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={onOpenPrayer}>
                  <Heart className="w-5 h-5 text-rose-500" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Oración</TooltipContent>
            </Tooltip>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={() => navigate('/programacion')}>
                <CalendarClock className="w-5 h-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Programación</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={() => navigate('/info/who-we-are')}>
                <CircleQuestionMark className="w-5 h-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>¿Quiénes somos?</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={() => navigate('/info/privacy')}>
                <FileKey className="w-5 h-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Política de Privacidad</TooltipContent>
          </Tooltip>

        </div>
      </TooltipProvider>

        {/* Mobile menu */}
        <div className="md:hidden flex items-center gap-2">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="w-5 h-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="bg-card border-border">
              <SheetHeader className="sr-only">
                <SheetTitle>Menú</SheetTitle>
                <SheetDescription>Opciones de la aplicación de radio</SheetDescription>
              </SheetHeader>
              <div className="flex flex-col gap-4 mt-8">
                <Button variant="ghost" className="justify-start" onClick={() => setShareOpen(true)}>
                  <Share2 className="w-5 h-5 mr-2" />
                  Compartir
                </Button>
                <Button variant="ghost" className="justify-start" onClick={() => {
                  navigate('/');
                }}>
                  <Home className="w-5 h-5 mr-2" />
                  Inicio
                </Button>
                {onOpenPrayer && (
                  <Button variant="ghost" className="justify-start" onClick={() => {
                    onOpenPrayer();
                  }}>
                    <Heart className="w-5 h-5 mr-2 text-rose-500" />
                    Oración
                  </Button>
                )}
                <Button variant="ghost" className="justify-start" onClick={() => {
                  navigate('/programacion');
                }}>
                  <CalendarClock className="w-5 h-5 mr-2" />
                  Programación
                </Button>
                <Button variant="ghost" className="justify-start" onClick={() => {
                  navigate('/info/who-we-are');
                }}>
                <CircleQuestionMark className="w-5 h-5 mr-2" />
                  Acerca de
                </Button>
                <Button variant="ghost" className="justify-start" onClick={() => {
                  navigate('/info/privacy');
                }}>
                  <FileKey className="w-5 h-5 mr-2" />
                  Política de Privacidad
                </Button>
                <div className="border-t border-border pt-4">
                  <p className="text-sm text-muted-foreground px-4">
                    {stationName}
                  </p>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </motion.header>
    </>
  );
}
