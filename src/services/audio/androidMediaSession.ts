/**
 * Android lock-screen / notification bridge for Bible audio.
 *
 * expo-av keeps doing the playback (and already owns audio focus, ducking and
 * the headphones-unplugged pause). What Android lacked was a MediaSession and
 * a `mediaPlayback` foreground service, so budget phones killed the process a
 * few minutes after the screen locked and there were no lock-screen controls.
 * `expo-media-control` supplies both; this module drives it.
 *
 * All native calls go through one promise queue so enable / update / disable
 * reach the module in the order the hook issued them, and sync calls that pile
 * up behind a slow native call collapse into the latest one.
 */
import type { BibleNowPlayingRemoteCommand } from './audioNowPlaying';
import type { BibleNowPlayingInput, BibleNowPlayingPayload } from './audioNowPlayingModel';
import {
  buildAndroidMediaControlOptions,
  buildAndroidMediaMetadata,
  buildAndroidPlaybackSnapshot,
  mapAndroidMediaControlEvent,
  metadataSignature,
  shouldPushAndroidPlaybackState,
  toAndroidArtworkUri,
  type SentAndroidPlaybackSnapshot,
} from './androidMediaSessionModel';

export const ANDROID_MEDIA_CONTROL_EVENT = 'mediaControlEvent';

/**
 * The patched expo-media-control module's disable runs asynchronously on the
 * native side. Give it time to unbind and stop the service before the next
 * enable starts a new one.
 */
export const ANDROID_REENABLE_GAP_MS = 750;

const FALLBACK_PACKAGE_NAME = 'com.everybible.app';

export interface AndroidMediaControlNativeModule {
  enableMediaControls(options: Record<string, unknown>): Promise<void>;
  disableMediaControls(): Promise<void>;
  updateMetadata(metadata: Record<string, unknown>): Promise<void>;
  updatePlaybackState(state: number, position?: number, playbackRate?: number): Promise<void>;
  addListener(eventName: string, listener: (event: unknown) => void): { remove(): void };
}

export interface AndroidMediaSessionEnvironment {
  resolveNativeModule(): AndroidMediaControlNativeModule | null;
  resolveArtworkUri(): string | null;
  /** Discreet (privacy) mode hides Scripture titles and artwork. */
  isDiscreetMode(): boolean;
  now(): number;
  sleep(ms: number): Promise<void>;
  reportError(operation: string, error: unknown): void;
}

export interface AndroidMediaSession {
  sync(input: BibleNowPlayingInput, payload: BibleNowPlayingPayload): Promise<void>;
  clear(): Promise<void>;
  subscribe(listener: (command: BibleNowPlayingRemoteCommand) => void): () => void;
}

type SyncSlot = {
  job: { input: BibleNowPlayingInput; payload: BibleNowPlayingPayload };
  promise: Promise<void>;
};

export function createAndroidMediaSession(
  env: AndroidMediaSessionEnvironment
): AndroidMediaSession {
  let queue: Promise<void> = Promise.resolve();
  let pendingSlot: SyncSlot | null = null;
  let enabled = false;
  let disabledAtMs: number | null = null;
  let lastMetadataSignature: string | null = null;
  let lastPlayback: SentAndroidPlaybackSnapshot | null = null;
  let artworkUri: string | null | undefined;

  const enqueue = (operation: () => Promise<void>): Promise<void> => {
    queue = queue.then(async () => {
      try {
        await operation();
      } catch (error) {
        env.reportError('mediaSessionQueue', error);
      }
    });
    return queue;
  };

  const getArtworkUri = (): string | null => {
    if (artworkUri === undefined) {
      try {
        artworkUri = env.resolveArtworkUri();
      } catch (error) {
        env.reportError('resolveArtworkUri', error);
        artworkUri = null;
      }
    }
    return artworkUri;
  };

  const isDiscreet = (): boolean => {
    try {
      return env.isDiscreetMode();
    } catch (error) {
      env.reportError('isDiscreetMode', error);
      // Fail closed: showing nothing is safer than revealing Scripture.
      return true;
    }
  };

  const applySync = async (
    nativeModule: AndroidMediaControlNativeModule,
    input: BibleNowPlayingInput,
    payload: BibleNowPlayingPayload
  ): Promise<void> => {
    if (!enabled) {
      if (disabledAtMs !== null) {
        const waitMs = ANDROID_REENABLE_GAP_MS - (env.now() - disabledAtMs);
        if (waitMs > 0) await env.sleep(waitMs);
      }
      try {
        await nativeModule.enableMediaControls(buildAndroidMediaControlOptions(input.localized));
      } catch (error) {
        env.reportError('enableMediaControls', error);
        return;
      }
      enabled = true;
      lastMetadataSignature = null;
      lastPlayback = null;
    }

    const discreet = isDiscreet();
    const metadata = buildAndroidMediaMetadata(input, payload, {
      artworkUri: discreet ? null : getArtworkUri(),
      discreet,
    });
    const signature = metadataSignature(metadata);
    if (signature !== lastMetadataSignature) {
      try {
        await nativeModule.updateMetadata(metadata);
        lastMetadataSignature = signature;
      } catch (error) {
        env.reportError('updateMetadata', error);
      }
    }

    const snapshot = buildAndroidPlaybackSnapshot(payload);
    const nowMs = env.now();
    if (shouldPushAndroidPlaybackState(lastPlayback, snapshot, nowMs)) {
      try {
        await nativeModule.updatePlaybackState(
          snapshot.state,
          snapshot.positionSeconds,
          snapshot.playbackRate
        );
        lastPlayback = { ...snapshot, sentAtMs: nowMs };
      } catch (error) {
        env.reportError('updatePlaybackState', error);
      }
    }
  };

  const sync = (input: BibleNowPlayingInput, payload: BibleNowPlayingPayload): Promise<void> => {
    if (pendingSlot) {
      pendingSlot.job = { input, payload };
      return pendingSlot.promise;
    }

    const slot = { job: { input, payload } } as SyncSlot;
    pendingSlot = slot;
    slot.promise = enqueue(async () => {
      if (pendingSlot === slot) pendingSlot = null;
      const nativeModule = env.resolveNativeModule();
      if (!nativeModule) return;
      await applySync(nativeModule, slot.job.input, slot.job.payload);
    });
    return slot.promise;
  };

  const clear = (): Promise<void> => {
    // Syncs issued after this clear must run after it, in a fresh slot.
    pendingSlot = null;
    return enqueue(async () => {
      if (!enabled) return;
      enabled = false;
      lastMetadataSignature = null;
      lastPlayback = null;
      disabledAtMs = env.now();
      const nativeModule = env.resolveNativeModule();
      if (!nativeModule) return;
      try {
        await nativeModule.disableMediaControls();
      } catch (error) {
        env.reportError('disableMediaControls', error);
      }
    });
  };

  const subscribe = (listener: (command: BibleNowPlayingRemoteCommand) => void): (() => void) => {
    const nativeModule = env.resolveNativeModule();
    if (!nativeModule) return () => {};

    const subscription = nativeModule.addListener(ANDROID_MEDIA_CONTROL_EVENT, (event) => {
      const command = mapAndroidMediaControlEvent(event);
      if (command) listener(command);
    });
    return () => subscription.remove();
  };

  return { sync, clear, subscribe };
}

// ---------------------------------------------------------------------------
// Production environment
// ---------------------------------------------------------------------------

function isDevMode(): boolean {
  return typeof __DEV__ !== 'undefined' && __DEV__;
}

let cachedNativeModule: AndroidMediaControlNativeModule | null | undefined;

function resolveExpoMediaControlModule(): AndroidMediaControlNativeModule | null {
  if (cachedNativeModule !== undefined) return cachedNativeModule;
  try {
    // Loaded lazily: this file is only reached on Android, and Node tests
    // cannot load `expo`.
    const { requireOptionalNativeModule } = require('expo') as typeof import('expo');
    cachedNativeModule =
      requireOptionalNativeModule<AndroidMediaControlNativeModule>('ExpoMediaControl');
  } catch {
    cachedNativeModule = null;
  }
  return cachedNativeModule;
}

function resolveBundledArtworkUri(): string | null {
  const { Image } = require('react-native') as typeof import('react-native');
  const source = Image.resolveAssetSource(
    require('../../../assets/audio/now-playing-artwork.png') as number
  );
  let packageName = FALLBACK_PACKAGE_NAME;
  try {
    const Constants = require('expo-constants').default as {
      expoConfig?: { android?: { package?: string } };
    };
    packageName = Constants.expoConfig?.android?.package ?? FALLBACK_PACKAGE_NAME;
  } catch {
    // Keep the fallback package name.
  }
  return toAndroidArtworkUri(source?.uri, packageName);
}

function readDiscreetMode(): boolean {
  // Lazy so this service does not pull the privacy store into every importer.
  const { usePrivacyStore } =
    require('../../stores/privacyStore') as typeof import('../../stores/privacyStore');
  return usePrivacyStore.getState().mode === 'discreet';
}

let defaultSession: AndroidMediaSession | null = null;

export function getAndroidMediaSession(): AndroidMediaSession {
  if (!defaultSession) {
    defaultSession = createAndroidMediaSession({
      resolveNativeModule: resolveExpoMediaControlModule,
      resolveArtworkUri: resolveBundledArtworkUri,
      isDiscreetMode: readDiscreetMode,
      now: () => Date.now(),
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      reportError: (operation, error) => {
        if (isDevMode()) {
          console.warn(`[androidMediaSession] ${operation} failed`, error);
        }
      },
    });
  }
  return defaultSession;
}
