import { useState } from 'react';
import { motion } from 'framer-motion';
import { Menu, Share2, Home, CircleQuestionMark } from 'lucide-react';
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
import { ShareModal } from './SharedModla';
import LOGO1 from '@assets/img/LOGO_COMPLETO_SINFONDO.png';
import LOGO2 from '@assets/img/LOGO_COMPLETO_SINFONDO2.png';
import { useNavigate } from 'react-router-dom';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface HeaderProps {
  stationName?: string;
}

export function Header({ stationName = 'La Voz de la Verdad' }: HeaderProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const navigate = useNavigate();

  const [shareOpen, setShareOpen] = useState(false);

  return (

    <>
      <ShareModal
        open={shareOpen}
        onOpenChange={setShareOpen}
        stationName={stationName}
      />

    <motion.header
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`sticky top-0 z-50 w-full border-b backdrop-blur-lg ${
        isDark 
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
            className="w-15 h-10 rounded-xl overflow-hidden flex items-center justify-center cursor-pointer"
            onClick={() => navigate('/')}
          >
            <img src={isDark ? LOGO2 : LOGO1} alt="Logo" className="w-full h-full object-cover" />
          </motion.div>
          <div className="hidden sm:block">
            <h1 className="font-bold text-lg leading-tight">{stationName}</h1>
            <p className="text-xs text-muted-foreground">24/7 Online Radio</p>
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

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={() => navigate('/info/who-we-are')}>
                <CircleQuestionMark className="w-5 h-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>¿Quiénes somos?</TooltipContent>
          </Tooltip>

          <ThemeToggle />
        </div>
      </TooltipProvider>

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
              isDark ? 'bg-slate-900 border-slate-800' : ''
            }>
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
                  Inicio
                </Button>
                <Button variant="ghost" className="justify-start" onClick={() => {
                  navigate('/info/who-we-are');
                }}>
                  Acerca de
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
          <ShareModal open={shareOpen} onOpenChange={setShareOpen} stationName={stationName} />
        </div>
      </div>
    </motion.header>
    </>
  );
}
