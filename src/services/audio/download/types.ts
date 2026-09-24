/** Shared types for chapter/book/translation audio downloads. */

export type AudioDownloadJobScope = 'book' | 'translation';
export type AudioDownloadJobStatus = 'queued' | 'downloading' | 'completed' | 'failed';

export interface AudioDownloadJobRecord {
  id: string;
  translationId: string;
  scope: AudioDownloadJobScope;
  bookId?: string;
  status: AudioDownloadJobStatus;
  createdAt: number;
  updatedAt: number;
  attemptCount: number;
  error?: string;
}

export interface AudioDownloadJobStore {
  listJobs: () => Promise<AudioDownloadJobRecord[]>;
  getJob: (jobId: string) => Promise<AudioDownloadJobRecord | null>;
  upsertJob: (job: AudioDownloadJobRecord) => Promise<void>;
  removeJob: (jobId: string) => Promise<void>;
}

export interface AudioDownloadBookProgress {
  translationId: string;
  bookId: string;
  chapter?: number;
  progress: number;
  completedChapters: number;
  totalChapters: number;
  jobId: string;
}

export interface AudioDownloadCollectionProgress {
  translationId: string;
  bookId: string;
  completedBooks: number;
  totalBooks: number;
  jobId: string;
}

export interface AudioDownloadLifecycleHooks {
  onStart?: (job: AudioDownloadJobRecord) => void;
  onReattach?: (job: AudioDownloadJobRecord) => void;
  onFailure?: (job: AudioDownloadJobRecord, error: Error) => void;
  onComplete?: (job: AudioDownloadJobRecord) => void;
  onProgress?: (progress: AudioDownloadBookProgress) => void;
  onBookComplete?: (progress: AudioDownloadCollectionProgress) => void;
}

export interface AudioFileSystemAdapter {
  ensureDirectory: (directoryUri: string) => Promise<void>;
  fileExists: (fileUri: string) => Promise<boolean>;
  downloadFile: (
    from: string,
    to: string,
    options?: {
      jobId?: string;
      taskId?: string;
      translationId?: string;
      bookId?: string;
      chapter?: number;
      signal?: AbortSignal;
      onProgress?: (progress: { bytesDownloaded: number; bytesTotal: number }) => void;
    }
  ) => Promise<void>;
  readTextFile?: (fileUri: string) => Promise<string | null>;
  writeTextFile?: (fileUri: string, contents: string) => Promise<void>;
  deleteFile?: (fileUri: string) => Promise<void>;
  getFileSize?: (fileUri: string) => Promise<number | null>;
  // One base64 chunk of a downloaded chapter, used only for sha256 verification. Chunked so a
  // long chapter is never held whole in the JS heap. Optional so adapters without it simply
  // fall back to size-only validation.
  readBase64Chunk?: (fileUri: string, position: number, length: number) => Promise<string | null>;
  // Free bytes on the volume holding the audio root, for the pre-flight in (N25).
  getFreeDiskBytes?: () => Promise<number | null>;
}

export interface AudioDownloadTransport {
  downloadFile: AudioFileSystemAdapter['downloadFile'];
  reattachJob?: (jobId: string) => Promise<void>;
  cancelJob?: (jobId: string) => Promise<void>;
}

export interface RemoteAudioAsset {
  url: string;
  duration: number;
  // Integrity metadata when the source publishes it (EL manifests do). When present these
  // replace the crude 1KB floor: an exact byte count and/or a sha256 is the only way to tell a
  // truncated/interrupted transfer apart from a complete chapter, since nothing here resumes
  // partials — see verifyDownloadedChapterAudio. (N23)
  bytes?: number;
  sha256?: string;
}

export type ResolveRemoteAudio = (
  translationId: string,
  bookId: string,
  chapter: number
) => Promise<RemoteAudioAsset | null>;

export interface DownloadContext {
  rootUri?: string;
  jobStore?: AudioDownloadJobStore;
  hooks?: AudioDownloadLifecycleHooks;
  transport?: AudioDownloadTransport;
}
