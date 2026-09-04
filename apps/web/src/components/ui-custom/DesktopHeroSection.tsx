import { StationLogo } from './OptimizedLogo';

/**
 * @deprecated Replaced by StationConsole — kept for backwards compatibility only.
 * Will be removed in next major. Do not use in new code.
 */
export function DesktopHeroSection() {
  return (
    <section className="hidden md:block px-4 pt-10 pb-8 text-center relative overflow-hidden bg-gradient-to-b from-background via-card to-background border-b border-border/30">
      <div className="mx-auto w-96 opacity-90">
        <StationLogo className="w-full h-auto" />
      </div>
    </section>
  );
}
