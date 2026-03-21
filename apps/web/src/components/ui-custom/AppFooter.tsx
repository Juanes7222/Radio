import LOGO_BLANCO from '@assets/img/LOGO_MMM_BLANCO.png';
import LOGO_NEGRO from '@assets/img/LOGO_MMM_NEGRO.png';

interface AppFooterProps {
  isDark: boolean;
  stationName?: string;
}

export function AppFooter({ isDark, stationName }: AppFooterProps) {
  return (
    <footer className={`border-t px-4 py-6 text-center text-xs ${
      isDark ? 'border-slate-800 text-slate-500' : 'border-slate-200 text-slate-400'
    }`}>
      <div className="flex flex-col items-center gap-2">
        <img
          src={isDark ? LOGO_BLANCO : LOGO_NEGRO}
          alt="Logo-MMM"
          className="h-8 w-auto object-contain opacity-70"
        />
        <span>
          Movimiento Misionero Mundial | {new Date().getFullYear()} {stationName || 'La Voz de la Verdad'}
        </span>
      </div>
    </footer>
  );
}
