// First-run onboarding ends as soon as the user has a Bible. Picking one that must be
// downloaded starts the download and finishes onboarding when it is installed.
//
// WHY a queue: every row stayed tappable during a download, and the store only dedupes by
// translation id, so a second tap started a second download beside the first and each one
// then finished onboarding — the later completion silently replacing the reader's Bible.
// Now one download runs at a time. A Bible tapped meanwhile waits its turn, and a newer tap
// replaces it, so onboarding finishes exactly once with the reader's latest choice. A Bible
// that is already on the device needs no download and finishes onboarding straight away.

type OnboardingDownloadResult = 'installed' | 'cancelled';

export interface OnboardingBibleSelectionState {
  /** The Bible whose download is running. */
  downloadingId: string | null;
  /** The Bible that will download once the running download settles. */
  queuedId: string | null;
}

export interface OnboardingBibleSelectionDeps<T extends { id: string }> {
  download: (translation: T) => Promise<OnboardingDownloadResult>;
  /** The translation as it stands after its install (fresh store state). */
  getInstalled: (translation: T) => T;
  /** Finishes onboarding with this Bible. */
  complete: (translation: T) => Promise<void>;
  /** A download failed and no other choice is waiting behind it. */
  onDownloadFailed: (translation: T, error: unknown) => Promise<void> | void;
  /**
   * Finishing onboarding threw (for example switching the interface language). Onboarding
   * stays open; the screen tells the user and can retry with `chooseReady(translation)`,
   * which for a download is the installed Bible, so it is not downloaded again.
   */
  onCompleteFailed: (translation: T, error: unknown) => void;
  onStateChange: (state: OnboardingBibleSelectionState) => void;
}

export interface OnboardingBibleSelectionQueue<T extends { id: string }> {
  /** The Bible can be read now; finish onboarding with it. */
  chooseReady: (translation: T) => Promise<void>;
  /** The Bible needs a download first; start it, or queue it behind the running one. */
  chooseDownload: (translation: T) => Promise<void>;
}

/**
 * `getDeps` is read at every step, so a component can hand over its latest callbacks without
 * rebuilding the queue (and losing its state) on each render.
 */
export function createOnboardingBibleSelectionQueue<T extends { id: string }>(
  getDeps: () => OnboardingBibleSelectionDeps<T>
): OnboardingBibleSelectionQueue<T> {
  let downloading: T | null = null;
  let queued: T | null = null;
  let completed = false;

  const emit = () =>
    getDeps().onStateChange({
      downloadingId: downloading?.id ?? null,
      queuedId: queued?.id ?? null,
    });

  // Never rejects: both callers are fire-and-forget taps, where a rejection would vanish
  // and leave the user on a screen that silently did nothing.
  const complete = async (translation: T) => {
    completed = true;
    try {
      await getDeps().complete(translation);
    } catch (error) {
      completed = false;
      getDeps().onCompleteFailed(translation, error);
    }
  };

  const runDownloads = async (firstChoice: T) => {
    let next: T | null = firstChoice;

    while (next) {
      const current: T = next;
      downloading = current;
      queued = null;
      emit();

      let result: OnboardingDownloadResult = 'cancelled';
      let failure: { error: unknown } | null = null;
      try {
        result = await getDeps().download(current);
      } catch (error) {
        failure = { error };
      }

      downloading = null;
      // A Bible chosen while this one downloaded supersedes it. The finished download stays
      // installed either way; it just no longer decides how onboarding ends.
      next = completed ? null : queued;
      if (next) {
        continue;
      }
      emit();

      if (completed) {
        return;
      }
      if (failure) {
        await getDeps().onDownloadFailed(current, failure.error);
        return;
      }
      if (result === 'installed') {
        await complete(getDeps().getInstalled(current));
      }
    }
  };

  return {
    chooseReady: async (translation) => {
      if (completed) {
        return;
      }
      if (queued) {
        queued = null;
        emit();
      }
      await complete(translation);
    },

    chooseDownload: async (translation) => {
      if (completed) {
        return;
      }
      if (downloading) {
        // Tapping the running row again means "keep this one": drop any waiting choice.
        queued = downloading.id === translation.id ? null : translation;
        emit();
        return;
      }
      await runDownloads(translation);
    },
  };
}
