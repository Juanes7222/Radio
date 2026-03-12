import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RadioPlayer,
  MobilePlayerHero,
  SongRequest,
} from '@/components/player';
import { Header } from '@/components/ui-custom';
import { useAzuraCast, useTheme, useAudioPlayer, useMediaSession, useSleepTimer, useFacebookLive } from '@/hooks';
import type { StreamQuality } from '@/types/azuracast';
import { Facebook, Instagram, Youtube, Send } from 'lucide-react';
import LOGO_BLANCO from '@assets/img/LOGO_MMM_BLANCO.png';
import LOGO_NEGRO from '@assets/img/LOGO_MMM_NEGRO.png';
import LOGO from '@assets/img/LOGO_COMPLETO_SINFONDO2.png'

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
  const [artworkErrorSongId, setArtworkErrorSongId] = useState<string | null>(null);
  const { liveUrl } = useFacebookLive();
  const socialLinks = SOCIAL_LINKS.map((link) =>
    link.label === 'Facebook' && liveUrl
      ? { ...link, href: liveUrl, isLive: true }
      : { ...link, isLive: false }
  );

  const { data, isLoading, error, getStreamUrl, requestSong } =
    useAzuraCast({ apiBaseUrl: import.meta.env.VITE_API_BASE_URL, pollInterval: 15000 });

  const artworkLoadFailed = artworkErrorSongId === (data?.now_playing?.song?.id ?? null);

  const streamUrl = getStreamUrl(quality);

  const {
    analyserRef,
    state: playerState,
    togglePlay,
    setVolume,
    toggleMute,
    pause,
    setQuality: setPlayerQuality,
    clearError,
    reconnectAttempt,
  } = useAudioPlayer({ streamUrl, autoplay: true });

  const sleepTimer = useSleepTimer(pause);

  const closeRequests = useCallback(() => setShowRequests(false), []);
  const openRequests = useCallback(() => setShowRequests(true), []);

  useMediaSession({
    title: data?.now_playing?.song?.title || 'Radio Stream',
    artist: data?.now_playing?.song?.artist || 'Desconocido',
    album: data?.now_playing?.song?.album || '',
    artwork: data?.now_playing?.song?.art || '',
    onPlay: togglePlay,
    onPause: togglePlay,
  });

  return (
    <div className={`min-h-screen w-full overflow-x-hidden transition-colors duration-300 ${
      isDark ? 'bg-slate-950 text-white' : 'bg-slate-50 text-slate-900'
    }`}>
      <Header stationName={data?.station?.name} />

      <main className="bottom-player-clearance">

        {/* ── DESKTOP: hero + player ── */}
        <section className={`hidden md:block px-4 pt-10 pb-8 text-center relative overflow-hidden ${
          isDark ? 'bg-gradient-to-b from-indigo-950/60 to-slate-950' : 'bg-gradient-to-b from-indigo-50 to-slate-50'
        }`}>
          <img src={LOGO} alt="Logo la voz de la verdad" className="mx-auto mb-6 w-96 h-auto" />
        </section>

        <section className="hidden md:block max-w-2xl mx-auto px-4 py-8">
          <RadioPlayer
            stationData={data}
            isLoading={isLoading}
            error={error}
            playerState={playerState}
            analyserRef={analyserRef}
            reconnectAttempt={reconnectAttempt}
            onTogglePlay={togglePlay}
            onSetVolume={setVolume}
            onToggleMute={toggleMute}
            onSetQuality={setPlayerQuality}
            onClearError={clearError}
            sleepTimer={sleepTimer}
            onQualityChange={setQuality}
            onShowRequests={openRequests}
          />
        </section>

        {/* ── MOBILE: hero "now playing" ── */}
        <MobilePlayerHero
          song={data?.now_playing ?? null}
          isLoading={isLoading}
          isDark={isDark}
          playerState={playerState}
          artworkLoadFailed={artworkLoadFailed}
          onTogglePlay={togglePlay}
          onArtworkError={setArtworkErrorSongId}
        />

        {/* ── MOBILE: "Pedir canción" ── */}
        <section className="md:hidden px-5 pt-4 pb-2">
          <button
            onClick={openRequests}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold bg-indigo-600 text-white active:scale-95 transition-transform shadow-md"
          >
            <Send className="w-4 h-4" />
            Pedir canción
          </button>
        </section>

        {/* ── Banner Facebook Live ── */}
        <AnimatePresence>
          {liveUrl && (
            <div className="px-4 md:max-w-2xl md:mx-auto mt-4 mb-1">
              <motion.a
                href={liveUrl}
                target="_blank"
                rel="noopener noreferrer"
                initial={{ opacity: 0, y: -12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                className="flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-r from-red-600 to-rose-500 text-white shadow-lg shadow-red-500/30"
              >
                <div className="relative shrink-0">
                  <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                    <Facebook className="w-5 h-5" />
                  </div>
                  <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-white">
                    <span className="absolute inset-0 rounded-full bg-white animate-ping opacity-75" />
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm leading-tight">¡Estamos en vivo!</p>
                  <p className="text-xs text-white/80 truncate mt-0.5">Toca para ver la transmisión en Facebook</p>
                </div>
                <div className="shrink-0 bg-white/20 rounded-xl px-3 py-1.5 text-xs font-bold tracking-wide">
                  VER →
                </div>
              </motion.a>
            </div>
          )}
        </AnimatePresence>

        {/* ── MOBILE: redes sociales compactas ── */}
        <section className="md:hidden px-5 pt-3 pb-4">
          <p className={`text-xs font-medium mb-3 text-center ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
            Síguenos
          </p>
          <div className="flex items-center justify-center gap-3">
            {socialLinks.map(({ label, href, bg, icon, isLive }) => (
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

        {/* ── DESKTOP: redes sociales ── */}
        <section className="hidden md:block px-4 pt-6 pb-8 max-w-2xl mx-auto">
          <h2 className={`font-semibold text-base mb-4 flex items-center gap-2 ${
            isDark ? 'text-slate-300' : 'text-slate-700'
          }`}>
            Síguenos
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {socialLinks.map(({ label, href, bg, shadow, icon, isLive }) => (
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
              Movimiento Misionero Mundial | {new Date().getFullYear()} {data?.station?.name || 'La Voz de la Verdad'}
            </span>
          </div>
        </footer>
      </main>

      <SongRequest
        isOpen={showRequests}
        onClose={closeRequests}
        theme={resolvedTheme}
        requestSong={requestSong}
      />
    </div>
  );
}

export default App;
