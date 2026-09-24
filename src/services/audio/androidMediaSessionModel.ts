/**
 * Pure mapping between the app's now-playing model and the Android media
 * session provided by `expo-media-control` (MediaSessionCompat + a
 * `mediaPlayback` foreground service). Playback itself stays on expo-av; this
 * layer only publishes metadata/state and translates notification, lock-screen,
 * headset and Bluetooth commands back into the app's remote-command vocabulary.
 *
 * See docs/research/android-background-audio-2026-09-24.md for why.
 */
import { getBookById } from '../../constants/books';
import type { BibleNowPlayingRemoteCommand } from './audioNowPlaying';
import type {
  BibleNowPlayingInput,
  BibleNowPlayingLocalizedStrings,
  BibleNowPlayingPayload,
} from './audioNowPlayingModel';

/** Values of expo-media-control's PlaybackState enum. */
export const AndroidMediaPlaybackState = {
  Playing: 2,
  Paused: 3,
} as const;

type AndroidMediaPlaybackStateValue =
  (typeof AndroidMediaPlaybackState)[keyof typeof AndroidMediaPlaybackState];

/** Seconds a skip-forward / skip-back press moves; matches iOS and the in-app buttons. */
const ANDROID_SKIP_INTERVAL_SECONDS = 10;

/**
 * How far the reported position may drift from where the session already
 * extrapolates it before we push a new playback state. The hook reports about
 * once a second; re-posting the notification that often costs battery on
 * budget phones for no visible change.
 */
export const ANDROID_POSITION_DRIFT_TOLERANCE_SECONDS = 2;

// Order matters: the library turns this list into notification actions.
const ANDROID_MEDIA_CAPABILITIES = [
  'previousTrack',
  'play',
  'pause',
  'nextTrack',
  'seek',
  'skipBackward',
  'skipForward',
] as const;

const ANDROID_COMPACT_CAPABILITIES = ['previousTrack', 'play', 'nextTrack'] as const;

export type AndroidMediaControlOptions = {
  capabilities: string[];
  compactCapabilities: string[];
  android: {
    skipInterval: number;
    channelName?: string;
    actionLabels?: Record<string, string>;
  };
};

export type AndroidMediaMetadata = {
  title: string;
  artist: string;
  album: string;
  duration?: number;
  artwork?: { uri: string };
};

export type AndroidPlaybackSnapshot = {
  state: AndroidMediaPlaybackStateValue;
  positionSeconds: number;
  playbackRate: number;
};

export type SentAndroidPlaybackSnapshot = AndroidPlaybackSnapshot & {
  sentAtMs: number;
};

export function buildAndroidMediaControlOptions(
  localized?: BibleNowPlayingLocalizedStrings
): AndroidMediaControlOptions {
  const options: AndroidMediaControlOptions = {
    capabilities: [...ANDROID_MEDIA_CAPABILITIES],
    compactCapabilities: [...ANDROID_COMPACT_CAPABILITIES],
    android: { skipInterval: ANDROID_SKIP_INTERVAL_SECONDS },
  };

  if (localized) {
    options.android.channelName = localized.channelName;
    options.android.actionLabels = {
      play: localized.play,
      pause: localized.pause,
      previousTrack: localized.previous,
      nextTrack: localized.next,
      skipBackward: localized.skipBackward,
      skipForward: localized.skipForward,
    };
  }

  return options;
}

export function buildAndroidMediaMetadata(
  input: BibleNowPlayingInput,
  payload: BibleNowPlayingPayload,
  options: { artworkUri: string | null; discreet: boolean }
): AndroidMediaMetadata {
  const localized = input.localized;
  const duration = payload.durationSeconds > 0 ? Math.round(payload.durationSeconds) : undefined;

  if (options.discreet) {
    // Discreet mode: the foreground service still needs a notification, but
    // nothing on the lock screen should say that Scripture is playing.
    return {
      title: localized?.channelName ?? '',
      artist: '',
      album: '',
      ...(duration !== undefined ? { duration } : {}),
    };
  }

  const bookName = localized?.bookName || getBookById(input.bookId)?.name || input.bookId;

  return {
    title: `${bookName} ${input.chapter}`,
    artist: payload.artist,
    album: payload.albumTitle,
    ...(duration !== undefined ? { duration } : {}),
    ...(options.artworkUri ? { artwork: { uri: options.artworkUri } } : {}),
  };
}

export function metadataSignature(metadata: AndroidMediaMetadata): string {
  return JSON.stringify([
    metadata.title,
    metadata.artist,
    metadata.album,
    metadata.duration ?? null,
    metadata.artwork?.uri ?? null,
  ]);
}

export function buildAndroidPlaybackSnapshot(
  payload: BibleNowPlayingPayload
): AndroidPlaybackSnapshot {
  return {
    state: payload.isPlaying ? AndroidMediaPlaybackState.Playing : AndroidMediaPlaybackState.Paused,
    positionSeconds: Math.max(0, payload.elapsedSeconds),
    playbackRate: payload.playbackRate > 0 ? payload.playbackRate : 1,
  };
}

/**
 * Whether the session needs a new playback state. Android extrapolates the
 * position from the last state + rate, so a steady second-by-second tick needs
 * no update; a play/pause, a rate change or a seek does.
 */
export function shouldPushAndroidPlaybackState(
  previous: SentAndroidPlaybackSnapshot | null,
  next: AndroidPlaybackSnapshot,
  nowMs: number
): boolean {
  if (!previous) return true;
  if (previous.state !== next.state) return true;
  if (previous.playbackRate !== next.playbackRate) return true;

  const elapsedSeconds =
    previous.state === AndroidMediaPlaybackState.Playing
      ? (Math.max(0, nowMs - previous.sentAtMs) / 1000) * previous.playbackRate
      : 0;
  const expectedPosition = previous.positionSeconds + elapsedSeconds;

  return (
    Math.abs(next.positionSeconds - expectedPosition) > ANDROID_POSITION_DRIFT_TOLERANCE_SECONDS
  );
}

/**
 * Turns an asset source uri into something the native service can open.
 * Release builds resolve bundled images to a bare drawable resource name;
 * dev builds and OTA updates give http(s) or file uris, which pass through.
 */
export function toAndroidArtworkUri(
  uri: string | null | undefined,
  packageName: string
): string | null {
  if (!uri) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(uri)) return uri;
  return `android.resource://${packageName}/drawable/${uri}`;
}

const COMMAND_MAP: Record<string, BibleNowPlayingRemoteCommand['command']> = {
  play: 'play',
  pause: 'pause',
  stop: 'stop',
  nextTrack: 'next',
  previousTrack: 'previous',
  skipForward: 'seek-forward',
  skipBackward: 'seek-backward',
  seek: 'seek-position',
};

/**
 * Maps a `mediaControlEvent` from the native module (`{ command, data, timestamp }`)
 * to the command vocabulary useAudioPlayer already handles for iOS.
 */
export function mapAndroidMediaControlEvent(event: unknown): BibleNowPlayingRemoteCommand | null {
  if (!event || typeof event !== 'object') return null;
  const { command, data } = event as { command?: unknown; data?: unknown };
  if (typeof command !== 'string') return null;

  const mapped = COMMAND_MAP[command];
  if (!mapped) return null;

  if (mapped !== 'seek-position') return { command: mapped };

  const position =
    data && typeof data === 'object' ? (data as { position?: unknown }).position : undefined;
  if (typeof position !== 'number' || !Number.isFinite(position) || position < 0) return null;

  return { command: mapped, positionSeconds: position };
}
