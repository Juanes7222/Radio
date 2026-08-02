import LOGO_BLANCO from '@assets/img/LOGO_MMM_BLANCO.png';

interface AppFooterProps {
  stationName?: string;
}

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
      </div>
    </footer>
  );
}
