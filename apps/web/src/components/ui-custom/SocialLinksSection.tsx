import { motion } from 'framer-motion';

interface SocialLink {
  label: string;
  href: string;
  bg: string;
  shadow?: string;
  icon: React.ReactNode;
  isLive?: boolean;
  featured?: boolean;
}
interface SocialLinksSectionProps {
  links: SocialLink[];
}

export function DesktopSocialLinks({ links }: SocialLinksSectionProps) {
  const regularLinks = links.filter(l => !l.featured);
  const featuredLinks = links.filter(l => l.featured);

  return (
    <section className="hidden md:block px-4 pt-8 pb-8 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <span className="h-px flex-1 bg-border/50" aria-hidden />
        <h2 className="font-mono text-[11px] tracking-[0.14em] uppercase text-muted-foreground">Síguenos</h2>
        <span className="h-px flex-1 bg-border/50" aria-hidden />
      </div>
      <div className="grid grid-cols-2 gap-3 max-w-2xl mx-auto">
        {regularLinks.map(({ label, href, bg, shadow = '', icon, isLive }) => (
          <motion.a
            key={label}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            whileTap={{ scale: 0.97 }}
            transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
            className={`relative flex items-center justify-center gap-2.5 px-4 py-3.5 rounded-2xl ${bg} text-white font-semibold text-sm shadow-md ${shadow} hover:shadow-lg transition-[transform,box-shadow] duration-150 ease-out hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background [@media(hover:none)]:hover:transform-none`}
            aria-label={isLive ? `${label} — transmisión en vivo` : `Seguir en ${label}`}
          >
            {isLive && (
              <>
                <span className="absolute inset-0 rounded-2xl ring-2 ring-white/60 animate-ping opacity-20" aria-hidden />
                <span className="absolute -top-2 -right-2 flex items-center gap-1 bg-white text-tally text-[10px] font-black px-2 py-1 rounded-full leading-none shadow-md border border-tally/10">
                  <span className="w-1.5 h-1.5 rounded-full bg-tally animate-pulse" aria-hidden />
                  LIVE
                </span>
              </>
            )}
            {icon}
            {label}
          </motion.a>
        ))}
      </div>
      {featuredLinks.length > 0 && (
        <div className="flex justify-center mt-4">
          {featuredLinks.map(({ label, href, bg, shadow = '', icon }) => (
            <motion.a
              key={label}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
              className={`flex items-center gap-4 px-6 py-3.5 rounded-2xl ${bg} text-white shadow-md ${shadow} hover:shadow-lg transition-[transform,box-shadow] duration-150 ease-out hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background [@media(hover:none)]:hover:transform-none`}
              aria-label="Descargar en Google Play"
            >
              <span className="w-8 h-8 flex-shrink-0" aria-hidden>{icon}</span>
              <span className="flex flex-col leading-tight text-left">
                <span className="text-[10px] font-normal tracking-widest uppercase text-white/70">Disponible en</span>
                <span className="text-lg font-bold tracking-tight">Google Play</span>
              </span>
            </motion.a>
          ))}
        </div>
      )}
    </section>
  );
}

export function MobileSocialLinks({ links }: SocialLinksSectionProps) {
  const regularLinks = links.filter(l => !l.featured);
  const featuredLinks = links.filter(l => l.featured);

  return (
    <section className="md:hidden px-5 pt-6 pb-4" aria-label="Redes sociales">
      <div className="flex items-center gap-3 mb-4">
        <span className="h-px flex-1 bg-border/50" aria-hidden />
        <p className="font-mono text-[11px] tracking-[0.14em] uppercase text-muted-foreground">Síguenos</p>
        <span className="h-px flex-1 bg-border/50" aria-hidden />
      </div>
      <div className="flex items-center justify-center gap-3 mb-4">
        {regularLinks.map(({ label, href, bg, icon, isLive }) => (
          <motion.a
            key={label}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            whileTap={{ scale: 0.93 }}
            className={`relative flex flex-col items-center gap-1.5 px-3 py-3 rounded-2xl ${bg} text-white shadow-md min-w-[64px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background`}
            aria-label={isLive ? `${label} en vivo` : label}
          >
            {isLive && (
              <>
                <span className="absolute inset-0 rounded-2xl ring-2 ring-white/60 animate-ping opacity-20" aria-hidden />
                <span className="absolute -top-1.5 -right-1.5 flex items-center gap-0.5 bg-white text-tally text-[9px] font-black px-1.5 py-0.5 rounded-full leading-none shadow-md">
                  <span className="w-1.5 h-1.5 rounded-full bg-tally animate-pulse" aria-hidden />
                  LIVE
                </span>
              </>
            )}
            <span aria-hidden>{icon}</span>
            <span className="text-[10px] font-semibold leading-none">{label}</span>
          </motion.a>
        ))}
      </div>
      {featuredLinks.length > 0 && (
        <div className="flex justify-center">
          {featuredLinks.map(({ label, href, bg, shadow = '', icon }) => (
            <motion.a
              key={label}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
              className={`flex items-center gap-4 px-5 py-3.5 rounded-2xl ${bg} text-white shadow-md ${shadow} hover:shadow-lg transition-[transform,box-shadow] duration-150 ease-out hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background [@media(hover:none)]:hover:transform-none`}
              aria-label="Descargar en Google Play"
            >
              <span className="w-8 h-8 flex-shrink-0" aria-hidden>{icon}</span>
              <span className="flex flex-col leading-tight text-left">
                <span className="text-[10px] font-normal tracking-widest uppercase text-white/70">Disponible en</span>
                <span className="text-lg font-bold tracking-tight">Google Play</span>
              </span>
            </motion.a>
          ))}
        </div>
      )}
    </section>
  );
}