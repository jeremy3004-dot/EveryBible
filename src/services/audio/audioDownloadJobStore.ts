import type {
  AudioDownloadJobRecord,
  AudioDownloadJobStore,
  AudioFileSystemAdapter,
} from './audioDownloadService';

const getAudioDownloadJobRegistryUri = (rootUri: string) => `${rootUri}download-jobs.json`;

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

// One registry per adapter/root keeps concurrent books and foreground reattachment
// on the same serialized state. Read once; only durable changes write the file.
const stores = new WeakMap<AudioFileSystemAdapter, Map<string, AudioDownloadJobStore>>();

export function createPersistentAudioDownloadJobStore({
  fileSystem,
  rootUri,
}: {
  fileSystem: AudioFileSystemAdapter;
  rootUri: string;
}): AudioDownloadJobStore {
  let roots = stores.get(fileSystem);
  if (!roots) {
    roots = new Map();
    stores.set(fileSystem, roots);
  }
  const existing = roots.get(rootUri);
  if (existing) return existing;

  let jobs: AudioDownloadJobRecord[] | null = null;
  let pending = Promise.resolve();

  function serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = pending.then(operation);
    // A failed write is reported to its caller without blocking later work.
    pending = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  async function readJobs(): Promise<AudioDownloadJobRecord[]> {
    if (jobs === null) jobs = await readJobRegistry(fileSystem, rootUri);
    return jobs;
  }

  async function writeJobs(nextJobs: AudioDownloadJobRecord[]): Promise<void> {
    await writeJobRegistry(fileSystem, rootUri, nextJobs);
    jobs = nextJobs;
  }

  const store: AudioDownloadJobStore = {
    listJobs: () => serialize(async () => [...(await readJobs())]),
    getJob: (jobId) =>
      serialize(async () => (await readJobs()).find((job) => job.id === jobId) ?? null),
    upsertJob: (job) =>
      serialize(async () => {
        const current = await readJobs();
        await writeJobs([...current.filter((entry) => entry.id !== job.id), job]);
      }),
    removeJob: (jobId) =>
      serialize(async () => {
        await writeJobs((await readJobs()).filter((job) => job.id !== jobId));
      }),
  };
  roots.set(rootUri, store);
  return store;
}
