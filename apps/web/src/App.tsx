import { useState, useCallback, lazy, Suspense } from 'react';
import { StationConsole } from '@/components/player/StationConsole';
import {
  Header,
  DesktopSocialLinks,
  MobileSocialLinks,
  FacebookLivePlayer,
  AppFooter,
} from '@/components/ui-custom';
import { useGlobalAudio } from '@/hooks/useGlobalAudio';
import { getSocialLinksWithLiveStatus } from '@/utils/socialLinks';
import MaintenancePage from '@/pages/MaintenancePage';

const SongRequest = lazy(() => import('@/components/player/SongRequest').then(m => ({ default: m.SongRequest })));
const PrayerRequestDialog = lazy(() => import('@/components/prayer/PrayerRequestDialog').then(m => ({ default: m.PrayerRequestDialog })));
const NoticeOverlay = lazy(() => import('@/components/notices/NoticeOverlay').then(m => ({ default: m.NoticeOverlay })) );

function App() {
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
  const openPrayer = useCallback(() => setShowPrayer(true), []);
  const closePrayer = useCallback(() => setShowPrayer(false), []);

  const socialLinks = getSocialLinksWithLiveStatus(liveUrl);

  const closeRequests = useCallback(() => setShowRequests(false), [setShowRequests]);
  const openRequests = useCallback(() => setShowRequests(true), [setShowRequests]);

  const MAINTENANCE = import.meta.env.VITE_MAINTENANCE === 'true';
  if (MAINTENANCE) {
    return <MaintenancePage />;
  }

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-background text-foreground selection:bg-primary selection:text-primary-foreground">
      <Header stationName={data?.station?.name} onOpenPrayer={openPrayer} />

      <main>
        <StationConsole
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
          onShowRequests={openRequests}
        />

        <FacebookLivePlayer liveUrl={liveUrl} />

        {/* Unified social — StationConsole already contains primary actions, this is secondary */}
        <MobileSocialLinks links={socialLinks} />
        <DesktopSocialLinks links={socialLinks} />

        <AppFooter stationName={data?.station?.name} />
      </main>

      <Suspense fallback={null}>
        <SongRequest isOpen={showRequests} onClose={closeRequests} requestSong={requestSong} />
        <PrayerRequestDialog isOpen={showPrayer} onClose={closePrayer} />
        <NoticeOverlay />
      </Suspense>
    </div>
  );
}

export default App;
