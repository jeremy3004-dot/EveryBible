import * as FileSystem from 'expo-file-system/legacy';
import { downloadAndValidateAudioFile } from './audioDownloadService';
import { createPersistentAudioDownloadJobStore as createJobStore } from './audioDownloadJobStore';
import type {
  AudioDownloadJobStore,
  AudioFileSystemAdapter,
  AudioDownloadTransport,
} from './audioDownloadService';

export const AUDIO_DOWNLOAD_ROOT_URI = `${
  FileSystem.documentDirectory ?? FileSystem.cacheDirectory ?? 'file:///'
}everybible-audio/`;

export const AUDIO_DOWNLOAD_JOB_REGISTRY_FILENAME = 'download-jobs.json';

export const getAudioDownloadJobRegistryUri = (rootUri: string = AUDIO_DOWNLOAD_ROOT_URI): string =>
  `${rootUri}${AUDIO_DOWNLOAD_JOB_REGISTRY_FILENAME}`;

export const expoAudioFileSystemAdapter: AudioFileSystemAdapter = {
  ensureDirectory: async (directoryUri) => {
    await FileSystem.makeDirectoryAsync(directoryUri, { intermediates: true });
  },
  fileExists: async (fileUri) => {
    const info = await FileSystem.getInfoAsync(fileUri);
    return info.exists;
  },
  getFileSize: async (fileUri) => {
    const info = await FileSystem.getInfoAsync(fileUri);
    return info.exists ? info.size : null;
  },
  downloadFile: async (from, to) => {
    await downloadAndValidateAudioFile({
      sourceUrl: from,
      runDownload: () => FileSystem.downloadAsync(from, to),
      getFileSize: async () => {
        const info = await FileSystem.getInfoAsync(to);
        return info.exists ? info.size : 0;
      },
      deleteFile: () => FileSystem.deleteAsync(to, { idempotent: true }),
    });
  },
  readTextFile: async (fileUri) => {
    try {
      return await FileSystem.readAsStringAsync(fileUri);
    } catch {
      return null;
    }
  },
  writeTextFile: async (fileUri, contents) => {
    await FileSystem.writeAsStringAsync(fileUri, contents);
  },
  deleteFile: async (fileUri) => {
    await FileSystem.deleteAsync(fileUri, { idempotent: true });
  },
};

// Background audio downloads require UIBackgroundModes: ["audio", "fetch"] in app.json (iOS).
// Without "fetch", native OS download tasks may be suspended when the app moves to the background
// mid-download, even though @kesha-antonov/react-native-background-downloader uses native
// URLSession download tasks that are designed to survive navigation away from any screen.
export async function createBackgroundAudioDownloadTransport(): Promise<AudioDownloadTransport> {
  try {
    const backgroundDownloader = await import('@kesha-antonov/react-native-background-downloader');

    return {
      downloadFile: async (from, to, options) => {
        const jobId = options?.jobId;
        const taskId = options?.taskId ?? jobId;
        const signal = options?.signal;

        if (!taskId) {
          await expoAudioFileSystemAdapter.downloadFile(from, to, options);
          return;
        }

        if (signal?.aborted) {
          return;
        }

        try {
          await new Promise<void>((resolve, reject) => {
            const task = backgroundDownloader
              .createDownloadTask({
                id: taskId,
                url: from,
                destination: to,
                metadata: {
                  translationId: options?.translationId ?? '',
                  bookId: options?.bookId ?? '',
                  chapter: String(options?.chapter ?? ''),
                },
              })
              .progress(({ bytesDownloaded, bytesTotal }) => {
                options?.onProgress?.({ bytesDownloaded, bytesTotal });
              });

            let settled = false;
            const settle = (run: () => void) => {
              if (settled) {
                return;
              }
              settled = true;
              if (signal) {
                signal.removeEventListener('abort', onAbort);
              }
              run();
            };

            // The native background downloader's stop() fires no terminal .done()/.error()
            // callback, so without this the promise would hang forever after a cancel — the
            // worker never returns, the persisted job stays "downloading", and next launch
            // resurrects a phantom "Loading… 0%". Racing the AbortSignal settles the promise
            // (and stops the native task) the moment cancelDownload aborts. (M2)
            const onAbort = () => {
              settle(() => {
                void task.stop?.();
                resolve();
              });
            };

            task
              .done(() => {
                settle(() => {
                  backgroundDownloader.completeHandler(taskId);
                  resolve();
                });
              })
              .error(({ error }) => {
                settle(() => reject(new Error(error)));
              });

            if (signal) {
              signal.addEventListener('abort', onAbort);
            }

            task.start();
          });
        } catch (error) {
          // Background downloader native module may not be linked in Expo
          // managed workflow. Always fall back to standard FileSystem download.
          console.warn('[AudioDownload] Background downloader failed, using fallback:', error);
          await expoAudioFileSystemAdapter.downloadFile(from, to, options);
        }
      },
      reattachJob: async (jobId) => {
        const tasks = await backgroundDownloader.getExistingDownloadTasks();
        tasks
          .filter((task) => task.id === jobId || task.id.startsWith(`${jobId}:`))
          .forEach((task) => {
            task.resume();
          });
      },
      cancelJob: async (jobId) => {
        const tasks = await backgroundDownloader.getExistingDownloadTasks();
        const matchingTasks = tasks.filter(
          (candidate) => candidate.id === jobId || candidate.id.startsWith(`${jobId}:`)
        );
        for (const task of matchingTasks) {
          await task.stop();
        }
      },
    };
  } catch {
    return {
      downloadFile: expoAudioFileSystemAdapter.downloadFile,
    };
  }
}

export async function ensureBackgroundAudioDownloadsRunning(): Promise<void> {
  try {
    const backgroundDownloader = await import('@kesha-antonov/react-native-background-downloader');
    const ensureDownloadsAreRunning = (
      backgroundDownloader as {
        ensureDownloadsAreRunning?: () => Promise<void>;
      }
    ).ensureDownloadsAreRunning;

    if (typeof ensureDownloadsAreRunning === 'function') {
      await ensureDownloadsAreRunning();
    }
  } catch {
    // The background downloader is optional in some Expo/dev contexts.
  }
}

export function createPersistentAudioDownloadJobStore({
  fileSystem,
  rootUri = AUDIO_DOWNLOAD_ROOT_URI,
}: {
  fileSystem: AudioFileSystemAdapter;
  rootUri?: string;
}): AudioDownloadJobStore {
  return createJobStore({ fileSystem, rootUri });
}
