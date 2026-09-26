import * as FileSystem from 'expo-file-system/legacy';
import type { BackgroundMusicChoice } from '../../types';
import { isDeviceOffline } from '../../utils/connectivity';
import { resolveBibleAssetUrl } from '../bible/bibleAssetBaseUrl';
import { expoAudioFileSystemAdapter } from './audioDownloadStorage';
import type { BackgroundMusicOption } from './backgroundMusicCatalog';
import type { AudioFileSystemAdapter } from './download/types';

/**
 * Whether a background sound can play, for the sound library and for Shuffle:
 * - bundled: ships with the app.
 * - cached: a remote sound already on disk; plays offline.
 * - remote: not downloaded yet; the first play downloads it.
 * - downloading: that first download is running.
 * - failed: the last download failed (or the device was offline); the next play retries.
 */
export type BackgroundSoundAvailability =
  | 'bundled'
  | 'cached'
  | 'remote'
  | 'downloading'
  | 'failed';

type RemoteSoundState = Exclude<BackgroundSoundAvailability, 'bundled'>;

export type BackgroundSoundCacheSnapshot = Readonly<
  Partial<Record<BackgroundMusicChoice, RemoteSoundState>>
>;

export interface BackgroundSoundCacheDependencies {
  fileSystem: Pick<AudioFileSystemAdapter, 'ensureDirectory' | 'fileExists' | 'downloadFile'> & {
    deleteFile: (fileUri: string) => Promise<void>;
  };
  /** Directory the downloaded sounds live in, with a trailing slash. */
  rootUri: string;
  resolveUrl: (path: string) => string | null;
  isOffline: () => Promise<boolean>;
  /** A download that reports no progress for this long is abandoned as failed. */
  stallTimeoutMs?: number;
}

export interface BackgroundSoundCache {
  getAvailability: (option: BackgroundMusicOption) => BackgroundSoundAvailability;
  /** The state of every remote sound seen so far; replaced (never mutated) on change. */
  getSnapshot: () => BackgroundSoundCacheSnapshot;
  subscribe: (listener: () => void) => () => void;
  /** The downloaded file of a remote sound, or null when it is not on disk. */
  getCachedUri: (option: BackgroundMusicOption) => Promise<string | null>;
  /**
   * Downloads a remote sound unless it is already on disk, and resolves its file, or null
   * when it cannot be had (offline, or the download failed). Concurrent calls share one
   * download.
   */
  ensureCached: (option: BackgroundMusicOption) => Promise<string | null>;
  /** Drops a downloaded file that would not play, so the next play fetches it again. */
  discard: (option: BackgroundMusicOption) => Promise<void>;
  /** Reads which of these remote sounds are already on disk, for the library's badges. */
  refresh: (options: readonly BackgroundMusicOption[]) => Promise<void>;
}

const DEFAULT_STALL_TIMEOUT_MS = 30_000;

// The path comes from the bundled catalog, but it is still the base of a file write:
// only plain relative segments may reach the file system.
const SAFE_PATH_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function isSafeRelativePath(path: string): boolean {
  const segments = path.split('/');
  return segments.length > 0 && segments.every((segment) => SAFE_PATH_SEGMENT.test(segment));
}

/** A sound's availability as recorded in a cache snapshot. */
export function getSoundAvailability(
  option: BackgroundMusicOption,
  snapshot: BackgroundSoundCacheSnapshot
): BackgroundSoundAvailability {
  if (option.source.kind === 'bundled') return 'bundled';
  return snapshot[option.id] ?? 'remote';
}

class DownloadStalledError extends Error {
  constructor() {
    super('Background sound download stalled');
    this.name = 'DownloadStalledError';
  }
}

export function createBackgroundSoundCache({
  fileSystem,
  rootUri,
  resolveUrl,
  isOffline,
  stallTimeoutMs = DEFAULT_STALL_TIMEOUT_MS,
}: BackgroundSoundCacheDependencies): BackgroundSoundCache {
  let snapshot: BackgroundSoundCacheSnapshot = {};
  const listeners = new Set<() => void>();
  const inFlight = new Map<BackgroundMusicChoice, Promise<string | null>>();

  const setState = (id: BackgroundMusicChoice, state: RemoteSoundState): void => {
    if (snapshot[id] === state) return;
    snapshot = { ...snapshot, [id]: state };
    for (const listener of listeners) {
      try {
        listener();
      } catch {
        // One broken subscriber must not keep the others from hearing about the change.
      }
    }
  };

  const fileUriFor = (option: BackgroundMusicOption): string | null =>
    option.source.kind === 'remote' && isSafeRelativePath(option.source.path)
      ? `${rootUri}${option.source.path}`
      : null;

  const directoryOf = (fileUri: string): string => fileUri.slice(0, fileUri.lastIndexOf('/') + 1);

  const getAvailability = (option: BackgroundMusicOption): BackgroundSoundAvailability =>
    getSoundAvailability(option, snapshot);

  const getCachedUri = async (option: BackgroundMusicOption): Promise<string | null> => {
    const fileUri = fileUriFor(option);
    if (!fileUri) return null;
    let exists = false;
    try {
      exists = await fileSystem.fileExists(fileUri);
    } catch {
      exists = false;
    }
    if (exists) {
      setState(option.id, 'cached');
      return fileUri;
    }
    // A download in progress, or one that failed, says more than "not on disk" does.
    if (snapshot[option.id] === 'cached') setState(option.id, 'remote');
    return null;
  };

  /** Runs the transfer, abandoning it when no bytes arrive for `stallTimeoutMs`. */
  const download = async (url: string, fileUri: string): Promise<void> => {
    const controller = new AbortController();
    let stalled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const armStallTimer = () => {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        stalled = true;
        controller.abort();
      }, stallTimeoutMs);
    };

    armStallTimer();
    try {
      await fileSystem.downloadFile(url, fileUri, {
        signal: controller.signal,
        onProgress: armStallTimer,
      });
    } catch (error) {
      throw stalled ? new DownloadStalledError() : error;
    } finally {
      if (timer !== null) clearTimeout(timer);
    }
  };

  const fetchSound = async (
    option: BackgroundMusicOption,
    fileUri: string
  ): Promise<string | null> => {
    if (await getCachedUri(option)) return fileUri;

    const url = option.source.kind === 'remote' ? resolveUrl(option.source.path) : null;
    if (!url || (await isOffline())) {
      setState(option.id, 'failed');
      return null;
    }

    setState(option.id, 'downloading');
    try {
      await fileSystem.ensureDirectory(directoryOf(fileUri));
      // The transfer writes a partial file and moves it into place only once it is
      // complete, so a file at fileUri is always a whole one.
      await download(url, fileUri);
      setState(option.id, 'cached');
      return fileUri;
    } catch {
      setState(option.id, 'failed');
      return null;
    }
  };

  const ensureCached = (option: BackgroundMusicOption): Promise<string | null> => {
    const fileUri = fileUriFor(option);
    if (!fileUri) return Promise.resolve(null);

    const pending = inFlight.get(option.id);
    if (pending) return pending;

    const request = fetchSound(option, fileUri).finally(() => {
      inFlight.delete(option.id);
    });
    inFlight.set(option.id, request);
    return request;
  };

  const discard = async (option: BackgroundMusicOption): Promise<void> => {
    const fileUri = fileUriFor(option);
    if (!fileUri) return;
    try {
      await fileSystem.deleteFile(fileUri);
    } catch {
      // Already gone is the state we want.
    }
    setState(option.id, 'failed');
  };

  const refresh = async (options: readonly BackgroundMusicOption[]): Promise<void> => {
    await Promise.all(
      options
        .filter((option) => option.source.kind === 'remote' && !inFlight.has(option.id))
        .map((option) => getCachedUri(option))
    );
  };

  return {
    getAvailability,
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getCachedUri,
    ensureCached,
    discard,
    refresh,
  };
}

// The document directory, not the cache directory: the OS may purge caches, and a sound
// that vanished would need a connection again the next time it plays.
export const BACKGROUND_SOUND_ROOT_URI = `${
  FileSystem.documentDirectory ?? FileSystem.cacheDirectory ?? 'file:///'
}everybible-background-sounds/`;

export const backgroundSoundCache = createBackgroundSoundCache({
  fileSystem: {
    ensureDirectory: expoAudioFileSystemAdapter.ensureDirectory,
    fileExists: expoAudioFileSystemAdapter.fileExists,
    downloadFile: expoAudioFileSystemAdapter.downloadFile,
    deleteFile: (fileUri) => FileSystem.deleteAsync(fileUri, { idempotent: true }),
  },
  rootUri: BACKGROUND_SOUND_ROOT_URI,
  resolveUrl: (path) => resolveBibleAssetUrl(path),
  isOffline: isDeviceOffline,
});
