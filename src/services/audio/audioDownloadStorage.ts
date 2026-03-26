import * as FileSystem from 'expo-file-system/legacy';
import type {
  AudioDownloadJobRecord,
  AudioDownloadJobStore,
  AudioFileSystemAdapter,
  AudioDownloadTransport,
} from './audioDownloadService';

export const AUDIO_DOWNLOAD_ROOT_URI = `${
  FileSystem.documentDirectory ?? FileSystem.cacheDirectory ?? 'file:///'
}everybible-audio/`;

export const AUDIO_DOWNLOAD_JOB_REGISTRY_FILENAME = 'download-jobs.json';

export const getAudioDownloadJobRegistryUri = (
  rootUri: string = AUDIO_DOWNLOAD_ROOT_URI
): string => `${rootUri}${AUDIO_DOWNLOAD_JOB_REGISTRY_FILENAME}`;

export const expoAudioFileSystemAdapter: AudioFileSystemAdapter = {
  ensureDirectory: async (directoryUri) => {
    await FileSystem.makeDirectoryAsync(directoryUri, { intermediates: true });
  },
  fileExists: async (fileUri) => {
    const info = await FileSystem.getInfoAsync(fileUri);
    return info.exists;
  },
  downloadFile: async (from, to) => {
    await FileSystem.downloadAsync(from, to);
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
    const backgroundDownloader = await import(
      '@kesha-antonov/react-native-background-downloader'
    );

    return {
      downloadFile: async (from, to, options) => {
        const jobId = options?.jobId;
        const taskId = options?.taskId ?? jobId;

        if (!taskId) {
          await expoAudioFileSystemAdapter.downloadFile(from, to, options);
          return;
        }

        try {
          await new Promise<void>((resolve, reject) => {
            const task = backgroundDownloader.createDownloadTask({
              id: taskId,
              url: from,
              destination: to,
              metadata: {
                translationId: options?.translationId ?? '',
                bookId: options?.bookId ?? '',
                chapter: String(options?.chapter ?? ''),
              },
            });

            task
              .done(() => {
                backgroundDownloader.completeHandler(taskId);
                resolve();
              })
              .error(({ error }) => {
                reject(new Error(error));
              });

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

const isAudioDownloadJobRecord = (value: unknown): value is AudioDownloadJobRecord => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record.id === 'string' &&
    typeof record.translationId === 'string' &&
    (record.scope === 'book' || record.scope === 'translation') &&
    (record.status === 'queued' ||
      record.status === 'downloading' ||
      record.status === 'completed' ||
      record.status === 'failed') &&
    typeof record.createdAt === 'number' &&
    typeof record.updatedAt === 'number' &&
    typeof record.attemptCount === 'number'
  );
};

const readJobRegistry = async (
  fileSystem: AudioFileSystemAdapter,
  rootUri: string
): Promise<AudioDownloadJobRecord[]> => {
  const registryUri = getAudioDownloadJobRegistryUri(rootUri);
  const raw = fileSystem.readTextFile ? await fileSystem.readTextFile(registryUri) : null;

  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as { jobs?: unknown };
    if (!Array.isArray(parsed.jobs)) {
      return [];
    }

    return parsed.jobs.filter(isAudioDownloadJobRecord);
  } catch {
    return [];
  }
};

const writeJobRegistry = async (
  fileSystem: AudioFileSystemAdapter,
  rootUri: string,
  jobs: AudioDownloadJobRecord[]
): Promise<void> => {
  if (!fileSystem.writeTextFile) {
    return;
  }

  await fileSystem.ensureDirectory(rootUri);
  await fileSystem.writeTextFile(
    getAudioDownloadJobRegistryUri(rootUri),
    JSON.stringify({ version: 1, jobs }, null, 2)
  );
};

export function createPersistentAudioDownloadJobStore({
  fileSystem,
  rootUri = AUDIO_DOWNLOAD_ROOT_URI,
}: {
  fileSystem: AudioFileSystemAdapter;
  rootUri?: string;
}): AudioDownloadJobStore {
  const memoryJobs = new Map<string, AudioDownloadJobRecord>();

  const readJobs = async (): Promise<AudioDownloadJobRecord[]> => {
    const persistedJobs = fileSystem.readTextFile ? await readJobRegistry(fileSystem, rootUri) : [];
    const jobsById = new Map<string, AudioDownloadJobRecord>();

    persistedJobs.forEach((job) => {
      jobsById.set(job.id, job);
    });

    memoryJobs.forEach((job, jobId) => {
      jobsById.set(jobId, job);
    });

    return Array.from(jobsById.values());
  };

  const writeJobs = async (jobs: AudioDownloadJobRecord[]): Promise<void> => {
    memoryJobs.clear();
    jobs.forEach((job) => {
      memoryJobs.set(job.id, job);
    });

    await writeJobRegistry(fileSystem, rootUri, jobs);
  };

  return {
    listJobs: async () => readJobs(),
    getJob: async (jobId) => (await readJobs()).find((job) => job.id === jobId) ?? null,
    upsertJob: async (job) => {
      const jobs = await readJobs();
      const nextJobs = jobs.filter((entry) => entry.id !== job.id);
      nextJobs.push(job);
      await writeJobs(nextJobs);
    },
    removeJob: async (jobId) => {
      const jobs = await readJobs();
      await writeJobs(jobs.filter((job) => job.id !== jobId));
    },
  };
}
