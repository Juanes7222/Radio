import RNEventSource, { type EventSourceOptions } from 'react-native-sse';

/**
 * Line ending the station's now-playing stream uses to terminate every frame.
 *
 * AzuraCast 6.9.7 writes each frame as "\r\ndata: {…}\n\n". react-native-sse
 * autodetects the line ending by probing "\r\n" before "\n", settles on "\r\n",
 * and then looks for "\r\n\r\n" to cut a frame — a sequence this stream never
 * produces. Its parser therefore bailed out on every read and dispatched
 * nothing, so the player stayed on whatever its first REST fetch returned.
 */
export const STATION_SSE_LINE_ENDING = '\n';

/**
 * Applies the station's line ending without preventing an explicit override.
 */
export function withStationLineEnding(options: EventSourceOptions = {}): EventSourceOptions {
  return { lineEndingCharacter: STATION_SSE_LINE_ENDING, ...options };
}

/**
 * EventSource for React Native, which has no native implementation.
 *
 * The quirks belong here rather than in useAzuraCast: the hook is shared with
 * the web, where the native EventSource parses these frames correctly and needs
 * no such option.
 */
export class StationEventSource extends RNEventSource {
  constructor(url: URL | string, options: EventSourceOptions = {}) {
    super(url, withStationLineEnding(options));
  }
}