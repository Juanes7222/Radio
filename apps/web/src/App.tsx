import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  RadioPlayer,
  SongHistory,
  SongRequest,
} from '@/components/player';
import { Header, PWAInstall } from '@/components/ui-custom';
import { useAzuraCast, useTheme } from '@/hooks';
import { Facebook, Clock, CalendarDays, ListMusic, Send } from 'lucide-react';
import type { StreamQuality } from '@/types/azuracast';

const WORSHIP_SCHEDULE = [
  { day: 'Martes',  time: '7:00 PM' },
  { day: 'Jueves',  time: '7:00 PM' },
  { day: 'Sabado',  time: '6:30 PM' },
  { day: 'Domingo', time: '9:00 AM' },
];

function App() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const [showHistory, setShowHistory]   = useState(false);
  const [showRequests, setShowRequests] = useState(false);
  const [quality, setQuality]           = useState<StreamQuality>('128');

  const { data, isLoading, error, history, getStreamUrl } =
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
            onShowHistory={() => setShowHistory(true)}
            onShowRequests={() => setShowRequests(true)}
          />
        </section>

        <section className="md:hidden flex gap-3 px-4 pt-6 pb-2">
          <button
            onClick={() => setShowHistory(true)}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-medium active:scale-95 transition-transform ${
              isDark
                ? 'bg-slate-800 text-slate-200'
                : 'bg-white text-slate-700 shadow-sm border border-slate-200'
            }`}
          >
            <ListMusic className="w-4 h-4" />
            Historial
          </button>
          <button
            onClick={() => setShowRequests(true)}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-medium bg-indigo-600 text-white active:scale-95 transition-transform shadow-md"
          >
            <Send className="w-4 h-4" />
            Pedir cancion
          </button>
        </section>

        <section className="px-4 py-8 max-w-2xl mx-auto">
          <div className="flex items-center gap-2 mb-4">
            <CalendarDays className={`w-5 h-5 ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`} />
            <h2 className="font-semibold text-base">Horarios de culto</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {WORSHIP_SCHEDULE.map(({ day, time }) => (
              <motion.div
                key={day}
                whileTap={{ scale: 0.97 }}
                className={`rounded-2xl p-4 text-center ${
                  isDark
                    ? 'bg-slate-800 border border-slate-700'
                    : 'bg-white border border-slate-200 shadow-sm'
                }`}
              >
                <Clock className={`w-5 h-5 mx-auto mb-2 ${isDark ? 'text-indigo-400' : 'text-indigo-500'}`} />
                <p className="font-semibold text-sm">{day}</p>
                <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{time}</p>
              </motion.div>
            ))}
          </div>
        </section>

        <section className="px-4 pb-8 max-w-2xl mx-auto">
          <a
            href="https://www.facebook.com/profile.php?id=100074024491964"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-3 w-full px-6 py-4 rounded-2xl bg-[#1877F2] text-white font-semibold text-sm active:scale-95 transition-transform shadow-md shadow-blue-500/20"
          >
            <Facebook className="w-5 h-5" />
            Siguenos en Facebook
          </a>
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
          onShowHistory={() => setShowHistory(true)}
          onShowRequests={() => setShowRequests(true)}
          compact
        />
      </div>

      <SongHistory
        history={history}
        isOpen={showHistory}
        onClose={() => setShowHistory(false)}
        isLoading={isLoading}
        theme={resolvedTheme}
      />
      <SongRequest
        isOpen={showRequests}
        onClose={() => setShowRequests(false)}
        theme={resolvedTheme}
      />
      <PWAInstall />
    </div>
  );
}

export default App;
