import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import RNEventSource from 'react-native-sse';
import {
  STATION_SSE_LINE_ENDING,
  withStationLineEnding,
} from '../../../mobile/lib/ssePolyfill';

/**
 * Regression cover for the mobile now-playing stream.
 *
 * The player shipped frozen: the song title never changed and the progress ring
 * never moved. The cause was not the app code but a contract between this
 * stream's frame format and react-native-sse's parser, and nothing in the repo
 * asserted that contract. These tests drive the real library with the exact
 * bytes captured from the station (AzuraCast 6.9.7), so the parser behaviour is
 * pinned rather than assumed.
 *
 * Frame format observed on device:
 *   "\r\n" + "data: " + JSON + "\n\n"
 */

const CONNECT_FRAME = {
  connect: { client: '5cd52440-c341-43e4-84b7-59ba6f05433d', version: '6.9.7 OSS' },
};

const NOW_PLAYING_FRAME = {
  pub: {
    data: {
      np: {
        now_playing: { sh_id: 65783, elapsed: 42, duration: 231 },
        song_history: [],
      },
    },
  },
};

/** Frame terminator observed from the station: "\r\n" prefix, "\n\n" suffix. */
function stationFrames(...payloads: unknown[]): string {
  return payloads.map((payload) => `\r\ndata: ${JSON.stringify(payload)}\n\n`).join('');
}

class FakeEventStream {
  static readonly UNSENT = 0;
  static readonly OPENED = 1;
  static readonly HEADERS_RECEIVED = 2;
  static readonly LOADING = 3;
  static readonly DONE = 4;

  static instances: FakeEventStream[] = [];

  readyState = FakeEventStream.UNSENT;
  status = 0;
  responseText = '';
  timeout = 0;
  onreadystatechange: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor() {
    FakeEventStream.instances.push(this);
  }

  open(): void {}

  setRequestHeader(): void {}

  getResponseHeader(name: string): string | null {
    return name.toLowerCase() === 'content-type' ? 'text/event-stream; charset=utf-8' : null;
  }

  send(): void {}

  abort(): void {
    this.readyState = FakeEventStream.DONE;
  }

  /** Replays what the network would do: headers first, then a growing body. */
  deliver(status: number, body: string): void {
    this.status = status;
    this.readyState = FakeEventStream.HEADERS_RECEIVED;
    this.onreadystatechange?.();
    this.readyState = FakeEventStream.LOADING;
    this.responseText = body;
    this.onreadystatechange?.();
  }
}

type ReceivedMessage = { type: string; data: string | null };

/** Opens a stream and collects everything the parser dispatches. */
function collectDispatchedMessages(
  body: string,
  options?: ConstructorParameters<typeof RNEventSource>[1],
): ReceivedMessage[] {
  const source = new RNEventSource('https://example.test/api/live/nowplaying/sse', options);
  const received: ReceivedMessage[] = [];
  source.addEventListener('message', (event) => {
    received.push({ type: event.type, data: event.data });
  });

  vi.advanceTimersByTime(600);
  const request = FakeEventStream.instances.at(-1);
  request?.deliver(200, body);
  source.close();
  return received;
}

describe('station now-playing SSE frame format', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeEventStream.instances = [];
    vi.stubGlobal('XMLHttpRequest', FakeEventStream);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('delivers nothing when the line ending is left to autodetection', () => {
    // This is the shipped bug: the parser resolves the line ending to "\r\n" and
    // then searches for "\r\n\r\n", which this stream never emits.
    const received = collectDispatchedMessages(
      stationFrames(CONNECT_FRAME, NOW_PLAYING_FRAME),
    );

    expect(received).toEqual([]);
  });

  it('delivers every frame once the station line ending is applied', () => {
    const received = collectDispatchedMessages(
      stationFrames(CONNECT_FRAME, NOW_PLAYING_FRAME),
      withStationLineEnding(),
    );

    expect(received).toHaveLength(2);
    expect(received.map((event) => event.type)).toEqual(['message', 'message']);

    const payloads = received.map((event) => JSON.parse(event.data ?? '') as Record<string, unknown>);
    expect(payloads[0]).toHaveProperty('connect');
    expect(
      (payloads[1] as { pub: { data: { np: { now_playing: { sh_id: number } } } } }).pub.data.np
        .now_playing.sh_id,
    ).toBe(65783);
  });

  it('holds an incomplete trailing frame until the rest of it arrives', () => {
    // Mobile delivers the body in chunks, so the parser has to resume from the
    // last offset it consumed and must not release a frame it has only half of.
    const source = new RNEventSource(
      'https://example.test/api/live/nowplaying/sse',
      withStationLineEnding(),
    );
    const received: ReceivedMessage[] = [];
    source.addEventListener('message', (event) =>
      received.push({ type: event.type, data: event.data }),
    );

    vi.advanceTimersByTime(600);
    const request = FakeEventStream.instances.at(-1);
    if (!request) throw new Error('react-native-sse did not issue a request');

    request.deliver(200, '');
    const full = stationFrames(CONNECT_FRAME, NOW_PLAYING_FRAME);
    const partial = full.slice(0, full.length - 1);

    for (let i = 1; i <= partial.length; i += 40) {
      request.responseText = partial.slice(0, i);
      request.onreadystatechange?.();
    }

    expect(received).toHaveLength(1);

    request.responseText = full;
    request.onreadystatechange?.();

    source.close();
    expect(received).toHaveLength(2);
  });

  it('lets an explicit option override the station line ending', () => {
    expect(withStationLineEnding()).toEqual({ lineEndingCharacter: '\n' });
    expect(withStationLineEnding({ lineEndingCharacter: '\r\n' })).toEqual({
      lineEndingCharacter: '\r\n',
    });
    expect(STATION_SSE_LINE_ENDING).toBe('\n');
  });
});