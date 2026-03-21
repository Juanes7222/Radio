import { motion } from 'framer-motion';

interface SocialLink {
  label: string;
  href: string;
  bg: string;
  shadow?: string;
  icon: React.ReactNode;
  isLive?: boolean;
}

interface SocialLinksSectionProps {
  links: SocialLink[];
  isDark: boolean;
}

export function DesktopSocialLinks({ links, isDark }: SocialLinksSectionProps) {
  return (
    <section className="hidden md:block px-4 pt-6 pb-8 max-w-2xl mx-auto">
      <h2 className={`font-semibold text-base mb-4 flex items-center gap-2 ${
        isDark ? 'text-slate-300' : 'text-slate-700'
      }`}>
        Síguenos
      </h2>
      <div className="grid grid-cols-2 gap-3">
        {links.map(({ label, href, bg, shadow = '', icon, isLive }) => (
          <motion.a
            key={label}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            whileTap={{ scale: 0.95 }}
            className={`relative flex items-center justify-center gap-2.5 px-4 py-3.5 rounded-2xl ${bg} text-white font-semibold text-sm shadow-md ${shadow} transition-opacity hover:opacity-90`}
          >
            {isLive && (
              <>
                <span className="absolute inset-0 rounded-xl ring-2 ring-white animate-ping opacity-30" />
                <span className="absolute -top-1.5 -right-1.5 flex items-center gap-0.5 bg-white text-red-600 text-[9px] font-black px-1.5 py-0.5 rounded-full leading-none shadow-md">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  LIVE
                </span>
              </>
            )}
            {icon}
            {label}
          </motion.a>
        ))}
      </div>
    </section>
  );
}

export function MobileSocialLinks({ links, isDark }: SocialLinksSectionProps) {
  return (
    <section className="md:hidden px-5 pt-3 pb-4">
      <p className={`text-xs font-medium mb-3 text-center ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
        Síguenos
      </p>
      <div className="flex items-center justify-center gap-3">
        {links.map(({ label, href, bg, icon, isLive }) => (
          <motion.a
            key={label}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            whileTap={{ scale: 0.9 }}
            className={`relative flex flex-col items-center gap-1 px-3 py-2.5 rounded-xl ${bg} text-white shadow-md min-w-[60px]`}
          >
            {isLive && (
              <>
                <span className="absolute inset-0 rounded-xl ring-2 ring-white animate-ping opacity-30" />
                <span className="absolute -top-1.5 -right-1.5 flex items-center gap-0.5 bg-white text-red-600 text-[9px] font-black px-1.5 py-0.5 rounded-full leading-none shadow-md">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  LIVE
                </span>
              </>
            )}
            {icon}
            <span className="text-[10px] font-semibold leading-none">{label}</span>
          </motion.a>
        ))}
      </div>
    </section>
  );
}
