import { Link } from 'react-router';
import LOGO_BLANCO from '@assets/img/LOGO_MMM_BLANCO.png';

interface AppFooterProps {
  stationName?: string;
}

const LEGAL_LINKS = [
  { label: 'Términos y condiciones', href: '/info/terms' },
  { label: 'Política de privacidad', href: '/info/privacy' },
  { label: 'Tratamiento de datos personales', href: '/info/data-treatment' },
  { label: 'Política de cookies', href: '/info/cookies' },
];

export function AppFooter({ stationName }: AppFooterProps) {
  return (
    <footer className="border-t border-slate-800 px-4 py-6 text-center text-xs text-slate-500">
      <div className="flex flex-col items-center gap-2">
        <img
          src={LOGO_BLANCO}
          alt="Logo-MMM"
          className="h-8 w-auto object-contain opacity-70"
        />
        <span>
          Movimiento Misionero Mundial | {new Date().getFullYear()} {stationName || 'La Voz de la Verdad'}
        </span>
        <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
          {LEGAL_LINKS.map((link) => (
            <Link
              key={link.href}
              to={link.href}
              className="text-slate-400 hover:text-primary transition-colors underline underline-offset-2"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
