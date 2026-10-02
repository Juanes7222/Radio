import { Link } from 'react-router';
import { ScrollReveal } from '@/components/layout/ScrollReveal';
import { MmmLogo } from './OptimizedLogo';
import { LEGAL_LINKS } from '@/lib/navigation';

interface AppFooterProps {
  stationName?: string;
}

export function AppFooter({ stationName }: AppFooterProps) {
  return (
    <footer className="border-t border-border/50 bg-card/20 px-4 py-8">
      <ScrollReveal className="max-w-6xl mx-auto flex flex-col items-center gap-4">
        <div className="h-7 w-auto opacity-70">
          <MmmLogo className="h-7 w-auto object-contain" />
        </div>
        <div className="text-center space-y-1">
          <p className="text-xs font-mono tracking-widest uppercase text-muted-foreground">
            Movimiento Misionero Mundial · Cartago
          </p>
          <p className="text-xs text-muted-foreground">
            {new Date().getFullYear()} {stationName || 'La Voz de la Verdad'} — 24/7 Online
          </p>
        </div>
        <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-xs" aria-label="Legal">
          {LEGAL_LINKS.map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              className="text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4 decoration-border hover:decoration-primary"
            >
              {label}
            </Link>
          ))}
        </nav>
      </ScrollReveal>
    </footer>
  );
}
