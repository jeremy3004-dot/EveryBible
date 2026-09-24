import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import type { BibleNowPlayingInput, BibleNowPlayingPayload } from './audioNowPlayingModel';
import { buildBibleNowPlayingPayload, toDiscreetNowPlayingPayload } from './audioNowPlayingModel';
import { getAndroidMediaSession } from './androidMediaSession';

type RemoteCommandName =
  | 'play'
  | 'pause'
  | 'stop'
  | 'next'
  | 'previous'
  | 'seek-forward'
  | 'seek-backward'
  | 'seek-position'
  // The headset / Bluetooth / CarPlay play-pause button (iOS togglePlayPauseCommand).
  | 'toggle'
  // iOS says an audio-session interruption (a call, another app's audio) has ended.
  | 'interruption-ended';

export interface BibleNowPlayingRemoteCommand {
  command: RemoteCommandName;
  positionSeconds?: number;
}

interface NativeBibleNowPlayingModule {
  syncBibleNowPlaying?: (payload: BibleNowPlayingPayload) => void;
  clearBibleNowPlaying?: () => void;
  addListener: (eventName: string) => void;
  removeListeners: (count: number) => void;
}

const EVENT_NAME = 'EveryBibleAudioNowPlayingCommand';
let didWarnAboutMissingNativeModule = false;

let currentBibleNowPlayingPayload: BibleNowPlayingPayload | null = null;
/** What the lock screen shows now, so a change of discreet mode can publish it again. */
let lastSyncedInput: BibleNowPlayingInput | null = null;
let isWatchingDiscreetMode = false;

// Lazy so this bridge does not pull the privacy store into every importer.
const loadPrivacyStore = () =>
  require('../../stores/privacyStore') as typeof import('../../stores/privacyStore');

/** Fails closed: a privacy state that cannot be read keeps the lock screen neutral. */
function isDiscreetNowPlaying(): boolean {
  try {
    return loadPrivacyStore().isDiscreetModeActive();
  } catch {
    return true;
  }
}

/**
 * A paused chapter, or one whose position has not moved, is not published again on its
 * own, so turning discreet mode on would leave it named on the lock screen until playback
 * changed. Republish it when discreet mode changes.
 */
function watchDiscreetMode(): void {
  if (isWatchingDiscreetMode) {
    return;
  }
  try {
    const { usePrivacyStore, isDiscreetModeActive } = loadPrivacyStore();
    usePrivacyStore.subscribe((state, previous) => {
      if (lastSyncedInput && isDiscreetModeActive(state) !== isDiscreetModeActive(previous)) {
        void syncBibleNowPlaying(lastSyncedInput);
      }
    });
    isWatchingDiscreetMode = true;
  } catch {
    // Without the store every sync already fails closed; only the republish is lost.
  }
}

function isDevMode(): boolean {
  return Boolean((globalThis as { __DEV__?: boolean }).__DEV__);
}

function warnAboutMissingNativeModule(): void {
  if (!isDevMode() || didWarnAboutMissingNativeModule) {
    return;
  }

  didWarnAboutMissingNativeModule = true;
  console.warn('[audioNowPlaying] EveryBibleAudioNowPlayingModule is missing on iOS');
}

function getNativeBibleNowPlayingModule(): NativeBibleNowPlayingModule | undefined {
  return NativeModules.EveryBibleAudioNowPlayingModule as NativeBibleNowPlayingModule | undefined;
}

function getBibleNowPlayingEmitter(): NativeEventEmitter | null {
  const nativeModule = getNativeBibleNowPlayingModule();
  return Platform.OS === 'ios' && nativeModule ? new NativeEventEmitter(nativeModule) : null;
}

function coerceRemoteCommandName(value: unknown): RemoteCommandName | null {
  if (
    value === 'play' ||
    value === 'pause' ||
    value === 'stop' ||
    value === 'next' ||
    value === 'previous' ||
    value === 'seek-forward' ||
    value === 'seek-backward' ||
    value === 'seek-position' ||
    value === 'toggle' ||
    value === 'interruption-ended'
  ) {
    return value;
  }

  return null;
}

export async function syncBibleNowPlaying(input: BibleNowPlayingInput): Promise<void> {
  currentBibleNowPlayingPayload = buildBibleNowPlayingPayload(input);
  lastSyncedInput = currentBibleNowPlayingPayload ? input : null;
  watchDiscreetMode();

  if (Platform.OS === 'android') {
    const session = getAndroidMediaSession();
    await (currentBibleNowPlayingPayload
      ? session.sync(input, currentBibleNowPlayingPayload)
      : session.clear());
    return;
  }

  const nativeModule = getNativeBibleNowPlayingModule();

  if (Platform.OS !== 'ios' || !nativeModule?.syncBibleNowPlaying) {
    warnAboutMissingNativeModule();
    return;
  }

  if (!currentBibleNowPlayingPayload) {
    await clearBibleNowPlaying();
    return;
  }

  nativeModule.syncBibleNowPlaying(
    isDiscreetNowPlaying()
      ? toDiscreetNowPlayingPayload(currentBibleNowPlayingPayload, input.discreetTitle)
      : currentBibleNowPlayingPayload
  );
}

export async function clearBibleNowPlaying(): Promise<void> {
  currentBibleNowPlayingPayload = null;
  lastSyncedInput = null;

  if (Platform.OS === 'android') {
    await getAndroidMediaSession().clear();
    return;
  }

  const nativeModule = getNativeBibleNowPlayingModule();

  if (Platform.OS !== 'ios' || !nativeModule?.clearBibleNowPlaying) {
    warnAboutMissingNativeModule();
    return;
  }

  nativeModule.clearBibleNowPlaying();
}

export function subscribeBibleNowPlayingRemoteCommands(
  listener: (command: BibleNowPlayingRemoteCommand) => void
): () => void {
  if (Platform.OS === 'android') {
    return getAndroidMediaSession().subscribe(listener);
  }

  const emitter = getBibleNowPlayingEmitter();

  if (!emitter) {
    return () => {};
  }

  const subscription = emitter.addListener(EVENT_NAME, (event: Record<string, unknown>) => {
    const command = coerceRemoteCommandName(event.command);
    if (!command) {
      return;
    }

    const positionSeconds =
      typeof event.positionSeconds === 'number' ? event.positionSeconds : undefined;

    listener({
      command,
      positionSeconds,
    });
  });

  return () => {
    subscription.remove();
  };
}
