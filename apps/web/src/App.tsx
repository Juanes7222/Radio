import { useState, useCallback } from 'react';
import {
  RadioPlayer,
  MobilePlayerHero,
  SongRequest,
} from '@/components/player';
import {
  Header,
  DesktopSocialLinks,
  MobileSocialLinks,
  FacebookLiveBanner,
  DesktopHeroSection,
  SongRequestButton,
  AppFooter,
} from '@/components/ui-custom';
import { useAzuraCast, useTheme, useAudioPlayer, useMediaSession, useSleepTimer, useFacebookLive } from '@/hooks';
import type { StreamQuality } from '@/types/azuracast';
import { getSocialLinksWithLiveStatus } from '@/utils/socialLinks';

function App() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const [showRequests, setShowRequests] = useState(false);
  const [quality, setQuality] = useState<StreamQuality>('128');
  const [artworkErrorSongId, setArtworkErrorSongId] = useState<string | null>(null);
  const { liveUrl } = useFacebookLive();

  const { data, isLoading, error, getStreamUrl, requestSong } =
    useAzuraCast({ apiBaseUrl: import.meta.env.VITE_API_BASE_URL, pollInterval: 15000 });

  const artworkLoadFailed = artworkErrorSongId === (data?.now_playing?.song?.id ?? null);
  const streamUrl = getStreamUrl(quality);
  const socialLinks = getSocialLinksWithLiveStatus(liveUrl);

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
    <div className={`min-h-screen w-full overflow-x-hidden transition-colors duration-300 bg-slate-950 text-white-900`}>
      <Header stationName={data?.station?.name} />

      <main className="bottom-player-clearance">
        <DesktopHeroSection isDark={isDark} />

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

        <MobilePlayerHero
          song={data?.now_playing ?? null}
          isLoading={isLoading}
          isDark={isDark}
          playerState={playerState}
          artworkLoadFailed={artworkLoadFailed}
          onTogglePlay={togglePlay}
          onArtworkError={setArtworkErrorSongId}
        />

        <SongRequestButton onClick={openRequests} />

        <FacebookLiveBanner liveUrl={liveUrl} />

        <MobileSocialLinks links={socialLinks} isDark={isDark} />

        <DesktopSocialLinks links={socialLinks} isDark={isDark} />

        <AppFooter isDark={isDark} stationName={data?.station?.name} />
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
