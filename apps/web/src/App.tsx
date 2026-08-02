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
import { PrayerRequestDialog, PrayerRequestButton } from '@/components/prayer';
import { useGlobalAudio } from '@/hooks/useGlobalAudio';
import { getSocialLinksWithLiveStatus } from '@/utils/socialLinks';
import MaintenancePage from '@/pages/MaintenancePage';

function App() {
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

  const [showPrayer, setShowPrayer] = useState(false);
  const openPrayer = useCallback(() => setShowPrayer(true), [setShowPrayer]);
  const closePrayer = useCallback(() => setShowPrayer(false), [setShowPrayer]);

  const artworkLoadFailed = artworkErrorSongId === (data?.now_playing?.song?.id ?? null);
  const socialLinks = getSocialLinksWithLiveStatus(liveUrl);

  const closeRequests = useCallback(() => setShowRequests(false), [setShowRequests]);
  const openRequests = useCallback(() => setShowRequests(true), [setShowRequests]);


  const MAINTENANCE = import.meta.env.VITE_MAINTENANCE === 'true';
  if (MAINTENANCE) {
    return <MaintenancePage />;
  }

  return (
    <div className="min-h-screen w-full overflow-x-hidden transition-colors duration-300 bg-background text-foreground">
      <Header stationName={data?.station?.name} onOpenPrayer={openPrayer} />

      <main className="bottom-player-clearance">
        <DesktopHeroSection />

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
          playerState={playerState}
          artworkLoadFailed={artworkLoadFailed}
          onTogglePlay={togglePlay}
          onArtworkError={setArtworkErrorSongId}
        />

        <SongRequestButton onClick={openRequests} />
        <PrayerRequestButton onClick={openPrayer} />

        <FacebookLivePlayer liveUrl={liveUrl} />

        <MobileSocialLinks links={socialLinks} />

        <DesktopSocialLinks links={socialLinks} />

        <AppFooter stationName={data?.station?.name} />
      </main>

      <SongRequest
        isOpen={showRequests}
        onClose={closeRequests}
        requestSong={requestSong}
      />
      <PrayerRequestDialog
        isOpen={showPrayer}
        onClose={closePrayer}
      />
    </div>
  );
}

export default App;
