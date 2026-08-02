import LOGO from '@assets/img/LOGO_COMPLETO_SINFONDO2.png';

export function DesktopHeroSection() {
  return (
    <section className="hidden md:block px-4 pt-10 pb-8 text-center relative overflow-hidden bg-gradient-to-b from-indigo-950/60 to-slate-950">
      <img src={LOGO} alt="Logo la voz de la verdad" className="mx-auto mb-6 w-96 h-auto" />
    </section>
  );
}
