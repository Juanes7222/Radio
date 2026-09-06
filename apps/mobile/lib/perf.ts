/**
 * Minimal startup and render instrumentation for the mobile app.
 * In-memory only, no storage or network calls, safe to keep in production.
 * The DEV-only overlay reads from here on an interval, so screens never
 * re-render because of these counters.
 */

export type StartupStage =
  | 'app_start'
  | 'fonts_loaded'
  | 'trackplayer_ready'
  | 'device_registered'
  | 'splash_hidden'
  | 'now_playing_first';

export interface PerfSnapshot {
  marks: Record<StartupStage, number | null>;
  playerRenders: number;
  nowPlayingEvents: number;
}

const marks: Record<StartupStage, number | null> = {
  app_start: null,
  fonts_loaded: null,
  trackplayer_ready: null,
  device_registered: null,
  splash_hidden: null,
  now_playing_first: null,
};

let playerRenders = 0;
let nowPlayingEvents = 0;
let initialized = false;

function now(): number {
  return Date.now();
}

/**
 * Records the process start timestamp. Call once from the root layout.
 * Later calls are ignored so Fast Refresh does not reset the baseline.
 */
export function initPerf(): void {
  if (initialized) {
    return;
  }
  initialized = true;
  marks.app_start = now();
}

/** Records when a startup stage completes. First write wins per stage. */
export function markStartupStage(stage: StartupStage): void {
  if (marks[stage] === null) {
    marks[stage] = now();
  }
}

/** Counts committed renders of the player screen. Cheap enough to call often. */
export function incrementPlayerRenders(): void {
  playerRenders += 1;
}

/**
 * Records a now-playing update. The first event also fills
 * the now_playing_first startup mark.
 */
export function markNowPlayingEvent(): void {
  nowPlayingEvents += 1;
  markStartupStage('now_playing_first');
}

/** Returns a copy of the current counters for DEV display or logging. */
export function getPerfSnapshot(): PerfSnapshot {
  return {
    marks: { ...marks },
    playerRenders,
    nowPlayingEvents,
  };
}

/** Milliseconds elapsed since app_start for a given stage, if measurable. */
export function timeSinceStart(stage: StartupStage): number | null {
  const start = marks.app_start;
  const value = marks[stage];
  if (start === null || value === null) {
    return null;
  }
  return value - start;
}

/** Logs a one-line summary to the console for manual baseline capture. */
export function logPerfSummary(): void {
  const snapshot = getPerfSnapshot();
  const elapsed = (stage: StartupStage): string => {
    const value = timeSinceStart(stage);
    return value === null ? '-' : `${value}ms`;
  };
  console.log(
    `[Perf] splash=${elapsed('splash_hidden')} ` +
      `nowPlaying=${elapsed('now_playing_first')} ` +
      `renders=${snapshot.playerRenders} ` +
      `npEvents=${snapshot.nowPlayingEvents}`,
  );
}
