// Text downloads started from the translation picker run one at a time.
//
// WHY a queue: the store keeps a single `downloadProgress` and `cancelDownload` acts on it, so a
// second download started beside the first took over the shared progress. The first row lost its
// bar and its cancel button while it kept downloading. Now a Bible chosen during a download waits
// its turn, and a newer choice replaces it. As before, only the reader's latest choice is opened.
// A download that finishes after a newer choice stays installed but is not opened. This mirrors
// the onboarding queue (onboardingBibleSelectionQueue.ts), except the picker never finishes: it
// keeps working after a Bible opens.

type TranslationPickerDownloadResult = 'installed' | 'cancelled';

export interface TranslationPickerDownloadState {
  /** The Bible whose download is running. */
  downloadingId: string | null;
  /** The Bible that will download once the running download settles. */
  queuedId: string | null;
}

export interface TranslationPickerDownloadDeps<T extends { id: string }> {
  download: (translation: T) => Promise<TranslationPickerDownloadResult>;
  /** Opens the Bible whose download finished while it was still the reader's latest choice. */
  activate: (translation: T) => Promise<void> | void;
  /** A download failed while it was still the reader's latest choice. */
  onDownloadFailed: (translation: T, error: unknown) => Promise<void> | void;
  onStateChange: (state: TranslationPickerDownloadState) => void;
}

export interface TranslationPickerDownloadQueue<T extends { id: string }> {
  /** Starts the download, or lines it up behind the running one. */
  request: (translation: T) => Promise<void>;
  /** Removes this Bible from the line if it is waiting. */
  cancelQueued: (translationId: string) => void;
  /**
   * The reader moved on (chose a Bible that is already installed, or closed the picker): drop the
   * waiting choice and let the running download finish without opening it.
   */
  supersede: () => void;
}

/**
 * `getDeps` is read at every step, so a component can hand over its latest callbacks without
 * rebuilding the queue (and losing its state) on each render.
 */
export function createTranslationPickerDownloadQueue<T extends { id: string }>(
  getDeps: () => TranslationPickerDownloadDeps<T>
): TranslationPickerDownloadQueue<T> {
  let downloading: T | null = null;
  let queued: T | null = null;
  // Bumped by supersede(); a download only opens its Bible if no supersede happened meanwhile.
  let generation = 0;

  const emit = () =>
    getDeps().onStateChange({
      downloadingId: downloading?.id ?? null,
      queuedId: queued?.id ?? null,
    });

  const runDownloads = async (firstChoice: T) => {
    let next: T | null = firstChoice;

    while (next) {
      const current: T = next;
      const startedGeneration = generation;
      downloading = current;
      queued = null;
      emit();

      let result: TranslationPickerDownloadResult = 'cancelled';
      let failure: { error: unknown } | null = null;
      try {
        result = await getDeps().download(current);
      } catch (error) {
        failure = { error };
      }

      downloading = null;
      next = queued;
      if (next) {
        continue;
      }
      emit();

      if (startedGeneration !== generation) {
        return;
      }
      if (failure) {
        await getDeps().onDownloadFailed(current, failure.error);
        return;
      }
      if (result === 'installed') {
        await getDeps().activate(current);
      }
    }
  };

  return {
    request: async (translation) => {
      if (downloading) {
        // Choosing the running Bible again means "keep this one": drop any waiting choice.
        queued = downloading.id === translation.id ? null : translation;
        emit();
        return;
      }
      await runDownloads(translation);
    },

    cancelQueued: (translationId) => {
      if (queued?.id !== translationId) {
        return;
      }
      queued = null;
      emit();
    },

    supersede: () => {
      generation += 1;
      if (queued) {
        queued = null;
        emit();
      }
    },
  };
}
