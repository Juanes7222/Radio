import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { getPerfSnapshot, timeSinceStart } from '@/lib/perf';

declare const __DEV__: boolean;

const REFRESH_MS = 1000;

function formatElapsed(value: number | null): string {
  if (value === null) {
    return '-';
  }
  if (value < 1000) {
    return `${value}ms`;
  }
  return `${(value / 1000).toFixed(1)}s`;
}

/**
 * DEV-only performance overlay. Returns null in production builds so
 * release bundles pay no render cost. Polls the in-memory perf module
 * instead of subscribing to app state, so measured screens never
 * re-render because of this overlay.
 */
export function PerfOverlay(): React.ReactNode {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!__DEV__) {
      return;
    }
    const id = setInterval(() => {
      setTick((prev) => prev + 1);
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  if (!__DEV__) {
    return null;
  }

  const snapshot = getPerfSnapshot();
  const splash = timeSinceStart('splash_hidden');
  const nowPlaying = timeSinceStart('now_playing_first');

  return (
    <View style={styles.container} pointerEvents="none">
      <Text style={styles.text}>
        {`splash ${formatElapsed(splash)} · np ${formatElapsed(nowPlaying)} · renders ${snapshot.playerRenders} · tick ${tick}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 44,
    left: 8,
    right: 8,
    alignItems: 'center',
    zIndex: 999,
  },
  text: {
    backgroundColor: 'rgba(0,0,0,0.65)',
    color: '#fff',
    fontSize: 11,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    overflow: 'hidden',
  },
});
