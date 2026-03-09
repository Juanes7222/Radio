import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RadioPlayer,
  SongRequest,
} from '@/components/player';
import { Header } from '@/components/ui-custom';
import { useAzuraCast, useTheme, useAudioPlayer, useMediaSession, useSleepTimer, useFacebookLive } from '@/hooks';
import type { StreamQuality } from '@/types/azuracast';
import { Facebook, Instagram, Youtube, Send, Music } from 'lucide-react';
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
        <section className={`md:hidden relative overflow-hidden px-5 pt-8 pb-6 ${
          isDark ? 'bg-gradient-to-b from-indigo-950/60 to-slate-950' : 'bg-gradient-to-b from-indigo-50 to-slate-50'
        }`}>
          <img src={LOGO} alt="Logo la voz de la verdad" className="mx-auto mb-6 w-60 h-auto" />
          {/* Glow de fondo ligado al artwork */}
          <div className="absolute inset-0 pointer-events-none">
            <div className={`absolute inset-0 ${
              isDark
                ? 'bg-[radial-gradient(ellipse_at_top,_rgba(99,102,241,0.18)_0%,_transparent_65%)]'
                : 'bg-[radial-gradient(ellipse_at_top,_rgba(99,102,241,0.10)_0%,_transparent_65%)]'
            }`} />
          </div>

          <div className="relative flex flex-col items-center gap-5">
            {/* Artwork / disco */}
            <AnimatePresence mode="wait">
              <motion.div
                key={data?.now_playing?.song?.id ?? 'no-song'}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.4 }}
                className="relative cursor-pointer select-none"
                onClick={togglePlay}
              >
                {/* Glow behind artwork */}
                {data?.now_playing?.song?.art && !artworkLoadFailed && (
                  <div
                    className="absolute inset-0 rounded-full blur-2xl scale-110 opacity-40"
                    style={{ backgroundImage: `url(${data.now_playing.song.art})`, backgroundSize: 'cover' }}
                  />
                )}
                <motion.div
                  animate={playerState.isPlaying ? { rotate: 360 } : { rotate: 0 }}
                  transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
                  className="relative w-44 h-44 rounded-full overflow-hidden shadow-2xl border-4 border-white/10"
                >
                  {data?.now_playing?.song?.art && !artworkLoadFailed ? (
                    <img
                      src={data.now_playing.song.art}
                      alt="Caratula"
                      className="w-full h-full object-cover"
                      onError={() => setArtworkErrorSongId(data.now_playing.song.id)}
                    />
                  ) : (
                    <div className={`w-full h-full flex items-center justify-center ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`}>
                      <Music className="w-16 h-16 text-indigo-400 opacity-60" />
                    </div>
                  )}
                </motion.div>

                {/* Play/Pause overlay — always visible on mobile (no hover) */}
                <motion.div
                  className="absolute inset-0 rounded-full flex items-center justify-center"
                  animate={{
                    backgroundColor: playerState.isPlaying
                      ? 'rgba(0,0,0,0.25)'
                      : 'rgba(0,0,0,0.50)',
                  }}
                  transition={{ duration: 0.2 }}
                >
                  {playerState.isLoading ? (
                    <div className="w-10 h-10 border-4 border-white border-t-transparent rounded-full animate-spin" />
                  ) : playerState.isPlaying ? (
                    <svg className="w-12 h-12 text-white drop-shadow-lg opacity-70" fill="currentColor" viewBox="0 0 24 24">
                      <rect x="6" y="4" width="4" height="16" rx="1" />
                      <rect x="14" y="4" width="4" height="16" rx="1" />
                    </svg>
                  ) : (
                    <svg className="w-12 h-12 text-white drop-shadow-lg ml-1" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  )}
                </motion.div>
              </motion.div>
            </AnimatePresence>

            {/* Info canción */}
            <AnimatePresence mode="wait">
              <motion.div
                key={data?.now_playing?.song?.id ?? 'no-info'}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.35 }}
                className="text-center max-w-xs"
              >
                {isLoading ? (
                  <div className="space-y-2 flex flex-col items-center">
                    <div className={`h-5 w-48 rounded-full animate-pulse ${isDark ? 'bg-slate-700' : 'bg-slate-300'}`} />
                    <div className={`h-4 w-32 rounded-full animate-pulse ${isDark ? 'bg-slate-700' : 'bg-slate-300'}`} />
                  </div>
                ) : (
                  <>
                    <p className={`font-bold text-lg leading-tight truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>
                      {data?.now_playing?.song?.title || data?.station?.name || 'La Voz de la Verdad'}
                    </p>
                    {data?.now_playing?.song?.artist && (
                      <p className={`text-sm mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        {data.now_playing.song.artist}
                      </p>
                    )}
                  </>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </section>

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
                  <span className="absolute -top-1.5 -right-1.5 flex items-center gap-0.5 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                    EN VIVO
                  </span>
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
                  <span className="absolute -top-2 -right-2 flex items-center gap-1 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full leading-none shadow">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                    EN VIVO
                  </span>
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
