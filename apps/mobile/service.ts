import TrackPlayer, {
  AppKilledPlaybackBehavior,
  Capability,
  Event,
} from 'react-native-track-player';

let setupPromise: Promise<void> | null = null;

async function configureTrackPlayer(): Promise<void> {
  await TrackPlayer.updateOptions({
    android: {
      appKilledPlaybackBehavior: AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification,
    },
    capabilities: [Capability.Play, Capability.Pause, Capability.Stop],
    compactCapabilities: [Capability.Play, Capability.Pause],
  });
}

/**
 * Initializes TrackPlayer exactly once for the whole app. Both the root layout
 * and `useAudioPlayer` can safely await this without double-initializing.
 */
export function initTrackPlayer(): Promise<void> {
  if (!setupPromise) {
    setupPromise = TrackPlayer.setupPlayer({ autoHandleInterruptions: true })
      .then(() => configureTrackPlayer())
      .catch(() => configureTrackPlayer());
  }
  return setupPromise;
}

export async function PlaybackService() {
  TrackPlayer.addEventListener(Event.RemotePlay, () => TrackPlayer.play());
  TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());
  TrackPlayer.addEventListener(Event.RemoteStop, () => TrackPlayer.stop());

  TrackPlayer.addEventListener(
    Event.RemoteDuck,
    async ({ permanent, paused }: { permanent: boolean; paused: boolean }) => {
      if (permanent || paused) {
        await TrackPlayer.pause();
      } else {
        await TrackPlayer.play();
      }
    }
  );
}
