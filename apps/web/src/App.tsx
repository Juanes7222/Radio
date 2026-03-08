import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  RadioPlayer,
  SongRequest,
} from '@/components/player';
import { Header } from '@/components/ui-custom';
import { useAzuraCast, useTheme } from '@/hooks';
import type { StreamQuality } from '@/types/azuracast';
import { Facebook, Instagram, Youtube, Send } from 'lucide-react';

const SOCIAL_LINKS = [
  {
    label: 'Facebook',
    href: 'https://www.facebook.com/profile.php?id=100074024491964',
    bg: 'bg-[#1877F2]',
    shadow: 'shadow-blue-500/20',
    icon: <Facebook className="w-5 h-5" />,
  },
  {
    label: 'Instagram',
    href: 'https://www.instagram.com/iglesiacartagommm/',
    bg: 'bg-gradient-to-br from-[#833ab4] via-[#fd1d1d] to-[#fcb045]',
    shadow: 'shadow-pink-500/20',
    icon: <Instagram className="w-5 h-5" />,
  },
  {
    label: 'YouTube',
    href: 'https://www.youtube.com/@emisoralavozdelaverdad9188',
    bg: 'bg-[#cf0a0a]',
    shadow: 'shadow-red-500/20',
    icon: <Youtube className="w-5 h-5" />,
  },
  {
    label: 'Spotify',
    href: 'https://open.spotify.com/show/7hSkCQDHvdjr4aYE5X6Gv4?si=a4cfd87d109543a2',
    bg: 'bg-[#1DB954]',
    shadow: 'shadow-green-500/20',
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
        <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.517 17.32a.748.748 0 0 1-1.03.25c-2.82-1.724-6.373-2.114-10.56-1.158a.748.748 0 1 1-.334-1.458c4.579-1.047 8.504-.596 11.674 1.337a.748.748 0 0 1 .25 1.03zm1.473-3.275a.936.936 0 0 1-1.287.308c-3.226-1.983-8.143-2.557-11.963-1.4a.937.937 0 0 1-.543-1.79c4.358-1.322 9.776-.682 13.485 1.595a.936.936 0 0 1 .308 1.287zm.127-3.408C15.32 8.39 9.325 8.19 5.7 9.296a1.123 1.123 0 1 1-.652-2.148c4.175-1.267 11.115-1.023 15.497 1.617a1.123 1.123 0 1 1-1.428 1.872z"/>
      </svg>
    ),
  },
] as const;

function App() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const [showRequests, setShowRequests] = useState(false);
  const [quality, setQuality]           = useState<StreamQuality>('128');

  const { data, isLoading, error, getStreamUrl } =
    useAzuraCast({ pollInterval: 15000 });

  const streamUrl = getStreamUrl(quality);

  return (
    <div className={`min-h-screen w-full overflow-x-hidden transition-colors duration-300 ${
      isDark ? 'bg-slate-950 text-white' : 'bg-slate-50 text-slate-900'
    }`}>
      <Header stationName={data?.station?.name} />

      <main className="bottom-player-clearance">

        <section className={`px-4 pt-8 pb-6 text-center ${
          isDark
            ? 'bg-gradient-to-b from-indigo-950/60 to-slate-950'
            : 'bg-gradient-to-b from-indigo-50 to-slate-50'
        }`}>
          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-2xl sm:text-3xl md:text-5xl font-bold tracking-tight mb-2"
          >
            {data?.station?.name || 'La Voz de la Verdad'}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.15 }}
            className={`text-sm sm:text-base max-w-xl mx-auto ${
              isDark ? 'text-slate-400' : 'text-slate-500'
            }`}
          >
            Emisora cristiana online — proclamando el mensaje de Jesucristo 24/7
          </motion.p>
        </section>

        <section className="hidden md:block max-w-2xl mx-auto px-4 py-8">
          <RadioPlayer
            stationData={data}
            streamUrl={streamUrl}
            isLoading={isLoading}
            error={error}
            onQualityChange={setQuality}
            onShowRequests={() => setShowRequests(true)}
          />
        </section>

        <section className="md:hidden flex gap-3 px-4 pt-6 pb-2">
          <button
            onClick={() => setShowRequests(true)}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-medium bg-indigo-600 text-white active:scale-95 transition-transform shadow-md"
          >
            <Send className="w-4 h-4" />
            Pedir cancion
          </button>
        </section>

        <section className="px-4 pt-6 pb-8 max-w-2xl mx-auto">
          <h2 className={`font-semibold text-base mb-4 flex items-center gap-2 ${
            isDark ? 'text-slate-300' : 'text-slate-700'
          }`}>
            Síguenos
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {SOCIAL_LINKS.map(({ label, href, bg, shadow, icon }) => (
              <motion.a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                whileTap={{ scale: 0.95 }}
                className={`flex items-center justify-center gap-2.5 px-4 py-3.5 rounded-2xl ${bg} text-white font-semibold text-sm shadow-md ${shadow} transition-opacity hover:opacity-90`}
              >
                {icon}
                {label}
              </motion.a>
            ))}
          </div>
        </section>

        <footer className={`border-t px-4 py-6 text-center text-xs ${
          isDark ? 'border-slate-800 text-slate-500' : 'border-slate-200 text-slate-400'
        }`}>
          {new Date().getFullYear()} {data?.station?.name || 'La Voz de la Verdad'}
        </footer>
      </main>

      <div className={`md:hidden fixed bottom-0 left-0 right-0 z-50 pb-safe ${
        isDark
          ? 'bg-slate-900/95 border-t border-slate-800'
          : 'bg-white/95 border-t border-slate-200'
      } backdrop-blur-xl shadow-2xl`}>
        <RadioPlayer
          stationData={data}
          streamUrl={streamUrl}
          isLoading={isLoading}
          error={error}
          onQualityChange={setQuality}
          onShowRequests={() => setShowRequests(true)}
          compact
        />
      </div>

      
      <SongRequest
        isOpen={showRequests}
        onClose={() => setShowRequests(false)}
        theme={resolvedTheme}
      />
      {/* <PWAInstall /> */}
    </div>
  );
}

export default App;
