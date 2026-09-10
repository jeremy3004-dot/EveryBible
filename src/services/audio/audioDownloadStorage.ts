import * as FileSystem from 'expo-file-system/legacy';
import {
  AUDIO_DOWNLOAD_JOB_ID_PREFIX,
  AudioDownloadCancelledError,
  AudioDownloadStopError,
  audioDownloadTaskIdMatchesJob,
  downloadAndValidateAudioFile,
  isAudioDownloadCancellation,
} from './audioDownloadService';
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
  downloadFile: async (from, to, options) => {
    const signal = options?.signal;
    if (signal?.aborted) throw new AudioDownloadCancelledError();
    await downloadAndValidateAudioFile({
      sourceUrl: from,
      // The chapter worker owns a progress-reset inactivity deadline.
      timeoutMs: null,
      runDownload: () =>
        new Promise<{ status: number }>((resolve, reject) => {
          let settled = false;
          let cancelling = false;
          const download = FileSystem.createDownloadResumable(from, to, {}, (progress) => {
            if (settled || cancelling || signal?.aborted) return;
            options?.onProgress?.({
              bytesDownloaded: progress.totalBytesWritten,
              bytesTotal: progress.totalBytesExpectedToWrite,
            });
          });
          const settle = (run: () => void) => {
            if (settled) return;
            settled = true;
            signal?.removeEventListener('abort', onAbort);
            run();
          };
          const onAbort = () => {
            if (settled || cancelling) return;
            cancelling = true;
            // The download promise may never settle on cancellation. The native
            // cancel promise is the boundary after which retrying the path is safe —
            // and the only point at which deleting the partial is safe. Nothing resumes
            // partials, so a preserved one over the 1KB floor would look complete forever. (N23)
            void download.cancelAsync().then(
              () =>
                void discardPartialAudioFile(to).then(() =>
                  settle(() => reject(new AudioDownloadCancelledError()))
                ),
              (error: unknown) => settle(() => reject(new AudioDownloadStopError(error)))
            );
          };
          signal?.addEventListener('abort', onAbort);
          if (signal?.aborted) {
            onAbort();
            return;
          }
          void download.downloadAsync().then(
            (result) => {
              if (cancelling) return;
              settle(() => (result ? resolve(result) : reject(new AudioDownloadCancelledError())));
            },
            (error: unknown) => {
              if (!cancelling) settle(() => reject(error));
            }
          );
        }),
      getFileSize: async () => {
        const info = await FileSystem.getInfoAsync(to);
        if (signal?.aborted) throw new AudioDownloadCancelledError();
        return info.exists ? info.size : 0;
      },
      deleteFile: async () => {
        if (signal?.aborted) throw new AudioDownloadCancelledError();
        await FileSystem.deleteAsync(to, { idempotent: true });
      },
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
  readBase64File: async (fileUri) => {
    try {
      return await FileSystem.readAsStringAsync(fileUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
    } catch {
      return null;
    }
  },
  getFreeDiskBytes: async () => {
    try {
      return await FileSystem.getFreeDiskStorageAsync();
    } catch {
      return null;
    }
  },
};

// A cancelled transfer leaves a truncated file at the destination. Only ever called after the
// native writer has confirmably stopped.
async function discardPartialAudioFile(fileUri: string): Promise<void> {
  try {
    await FileSystem.deleteAsync(fileUri, { idempotent: true });
  } catch {
    // A missing partial is the desired end state anyway.
  }
}

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
          throw new AudioDownloadCancelledError();
        }

        try {
          await new Promise<void>((resolve, reject) => {
            let settled = false;
            let cancelling = false;
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
                if (settled || cancelling || signal?.aborted) return;
                options?.onProgress?.({ bytesDownloaded, bytesTotal });
              });

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

            // stop() fires no terminal callback. Wait for its native promise so
            // the next attempt cannot write this destination before the old one stops.
            const onAbort = () => {
              if (settled || cancelling) return;
              cancelling = true;
              void task.stop().then(
                () =>
                  void discardPartialAudioFile(to).then(() =>
                    settle(() => reject(new AudioDownloadCancelledError()))
                  ),
                (error: unknown) => settle(() => reject(new AudioDownloadStopError(error)))
              );
            };

            task
              .done(() => {
                if (cancelling || signal?.aborted) return;
                settle(() => {
                  backgroundDownloader.completeHandler(taskId);
                  resolve();
                });
              })
              .error(({ error }) => {
                if (cancelling || signal?.aborted) return;
                settle(() => reject(new Error(error)));
              });

            if (signal) {
              signal.addEventListener('abort', onAbort);
            }

            if (signal?.aborted) onAbort();
            else task.start();
          });
        } catch (error) {
          if (error instanceof AudioDownloadStopError) throw error;
          if (signal?.aborted || isAudioDownloadCancellation(error)) {
            throw new AudioDownloadCancelledError();
          }
          // Background downloader native module may not be linked in Expo
          // managed workflow. Always fall back to standard FileSystem download.
          console.warn('[AudioDownload] Background downloader failed, using fallback:', error);
          await expoAudioFileSystemAdapter.downloadFile(from, to, options);
        }
      },
      // Chapter tasks are named after their BOOK job even inside a translation download, so both
      // of these must match in the translation's task-id namespace. (N22)
      reattachJob: async (jobId) => {
        const tasks = await backgroundDownloader.getExistingDownloadTasks();
        tasks
          .filter((task) => audioDownloadTaskIdMatchesJob(task.id, jobId))
          .forEach((task) => {
            task.resume();
          });
      },
      cancelJob: async (jobId) => {
        const tasks = await backgroundDownloader.getExistingDownloadTasks();
        const matchingTasks = tasks.filter((candidate) =>
          audioDownloadTaskIdMatchesJob(candidate.id, jobId)
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

// The library has no "ensure downloads are running" entry point (4.5.4 exports cleanup, setConfig,
// getExistingDownloadTasks, completeHandler, createDownloadTask, getExistingUploadTasks,
// createUploadTask, directories, getNativeModule), so the old guarded call was a permanent silent
// no-op. Enumerate the surviving native tasks in this app's namespace and resume each one, with a
// per-task try/catch: Android throws "Hasn't been prepared" for tasks the OS already dropped, and
// that must not abort the rest of the loop. (N24)
export async function ensureBackgroundAudioDownloadsRunning(): Promise<void> {
  try {
    const backgroundDownloader = await import('@kesha-antonov/react-native-background-downloader');
    const tasks = await backgroundDownloader.getExistingDownloadTasks();

    for (const task of tasks) {
      if (!task?.id?.startsWith(AUDIO_DOWNLOAD_JOB_ID_PREFIX)) {
        continue;
      }

      try {
        await task.resume();
      } catch (error) {
        console.warn('[AudioDownload] Failed to resume background task:', task.id, error);
      }
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
