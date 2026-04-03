import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import type {
  BibleNowPlayingInput,
  BibleNowPlayingPayload,
} from './audioNowPlayingModel';
import { buildBibleNowPlayingPayload } from './audioNowPlayingModel';

type RemoteCommandName =
  | 'play'
  | 'pause'
  | 'stop'
  | 'next'
  | 'previous'
  | 'seek-forward'
  | 'seek-backward'
  | 'seek-position';

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
const nativeModule = NativeModules.EveryBibleAudioNowPlayingModule as
  | NativeBibleNowPlayingModule
  | undefined;
const emitter =
  Platform.OS === 'ios' && nativeModule ? new NativeEventEmitter(nativeModule) : null;
let didWarnAboutMissingNativeModule = false;

let currentBibleNowPlayingPayload: BibleNowPlayingPayload | null = null;

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

function coerceRemoteCommandName(value: unknown): RemoteCommandName | null {
  if (
    value === 'play' ||
    value === 'pause' ||
    value === 'stop' ||
    value === 'next' ||
    value === 'previous' ||
    value === 'seek-forward' ||
    value === 'seek-backward' ||
    value === 'seek-position'
  ) {
    return value;
  }

  return null;
}

export async function syncBibleNowPlaying(input: BibleNowPlayingInput): Promise<void> {
  currentBibleNowPlayingPayload = buildBibleNowPlayingPayload(input);

  if (Platform.OS !== 'ios' || !nativeModule?.syncBibleNowPlaying) {
    warnAboutMissingNativeModule();
    return;
  }

  if (!currentBibleNowPlayingPayload) {
    await clearBibleNowPlaying();
    return;
  }

  nativeModule.syncBibleNowPlaying(currentBibleNowPlayingPayload);
}

export async function clearBibleNowPlaying(): Promise<void> {
  currentBibleNowPlayingPayload = null;

  if (Platform.OS !== 'ios' || !nativeModule?.clearBibleNowPlaying) {
    warnAboutMissingNativeModule();
    return;
  }

  nativeModule.clearBibleNowPlaying();
}

export function getBibleNowPlayingSnapshot(): BibleNowPlayingPayload | null {
  return currentBibleNowPlayingPayload;
}

export function subscribeBibleNowPlayingRemoteCommands(
  listener: (command: BibleNowPlayingRemoteCommand) => void
): () => void {
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
