import LOGO from '@assets/img/LOGO_COMPLETO_SINFONDO2.png';

interface DesktopHeroSectionProps {
  isDark: boolean;
}

export function DesktopHeroSection({ isDark }: DesktopHeroSectionProps) {
  return (
    <section className={`hidden md:block px-4 pt-10 pb-8 text-center relative overflow-hidden ${
      isDark ? 'bg-gradient-to-b from-indigo-950/60 to-slate-950' : 'bg-gradient-to-b from-indigo-50 to-slate-50'
    }`}>
      <img src={LOGO} alt="Logo la voz de la verdad" className="mx-auto mb-6 w-96 h-auto" />
    </section>
  );
}
