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
  FacebookLivePlayer,
  DesktopHeroSection,
  SongRequestButton,
  AppFooter,
} from '@/components/ui-custom';
import { useTheme } from '@/hooks';
import { useGlobalAudio } from '@/hooks/useGlobalAudio';
import { getSocialLinksWithLiveStatus } from '@/utils/socialLinks';

function App() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const [artworkErrorSongId, setArtworkErrorSongId] = useState<string | null>(null);
  
  const {
    data,
    isLoading,
    error,
    playerState,
    setQuality,
    togglePlay,
    setVolume,
    toggleMute,
    clearError,
    reconnectAttempt,
    analyserRef,
    liveUrl,
    sleepTimer,
    showRequests,
    setShowRequests,
    requestSong,
  } = useGlobalAudio();

  const artworkLoadFailed = artworkErrorSongId === (data?.now_playing?.song?.id ?? null);
  const socialLinks = getSocialLinksWithLiveStatus(liveUrl);

  const closeRequests = useCallback(() => setShowRequests(false), [setShowRequests]);
  const openRequests = useCallback(() => setShowRequests(true), [setShowRequests]);

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
            onSetQuality={setQuality}
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

        <FacebookLivePlayer liveUrl={liveUrl} />

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
