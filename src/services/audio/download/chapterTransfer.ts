/**
 * Moving one chapter's bytes: the inactivity deadline and retry-with-backoff around a transport
 * attempt, plus the bounded-concurrency loop that drives chapters and books.
 */
import { isOutOfSpaceError } from '../audioDownloadErrorMessage';
import {
  AudioDownloadCancelledError,
  AudioDownloadStopError,
  isAudioDownloadCancellation,
} from './errors';

// Per-chapter download tuning. The timeout is an INACTIVITY timeout (reset on every progress tick)
// rather than a fixed wall-clock budget, so a large chapter on a slow-but-progressing connection no
// longer hits a false failure — only a genuinely stalled transfer trips it. (L6) Each chapter is
// retried a few times with exponential backoff before the failure bubbles up and fails the job. (L7)
const AUDIO_DOWNLOAD_INACTIVITY_TIMEOUT_MS = 60_000;
const AUDIO_DOWNLOAD_MAX_ATTEMPTS = 3;
const AUDIO_DOWNLOAD_RETRY_BASE_DELAY_MS = 1_000;

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new AudioDownloadCancelledError());
      return;
    }

    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timer);
      reject(new AudioDownloadCancelledError());
    };

    signal?.addEventListener('abort', onAbort);
  });
}

// A transport must settle only after cancellation has stopped its native writer.
// Waiting for that settlement prevents retries from writing the same path concurrently.
export async function downloadChapterWithInactivityTimeoutAndRetry(
  run: (onActivity: () => boolean, attemptSignal: AbortSignal) => Promise<void>,
  signal: AbortSignal | undefined,
  { inactivityTimeoutMs = AUDIO_DOWNLOAD_INACTIVITY_TIMEOUT_MS } = {}
): Promise<void> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= AUDIO_DOWNLOAD_MAX_ATTEMPTS; attempt += 1) {
    if (signal?.aborted) {
      throw new AudioDownloadCancelledError();
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    let timedOut = false;
    let active = true;
    const controller = new AbortController();

    const clearInactivityTimer = () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const onAbort = () => {
      clearInactivityTimer();
      controller.abort();
    };
    signal?.addEventListener('abort', onAbort);
    const onActivity = () => {
      if (!active || controller.signal.aborted) return false;
      clearInactivityTimer();
      timer = setTimeout(() => {
        timedOut = true;
        onAbort();
      }, inactivityTimeoutMs);
      return true;
    };

    try {
      onActivity();
      await run(onActivity, controller.signal);
      if (signal?.aborted) throw new AudioDownloadCancelledError();
      if (timedOut) throw new Error('Chapter download stalled (no progress).');
      return;
    } catch (error) {
      // A failed native stop leaves the destination unsafe for another writer.
      if (error instanceof AudioDownloadStopError) throw error;
      if (signal?.aborted || (!timedOut && isAudioDownloadCancellation(error))) {
        throw new AudioDownloadCancelledError();
      }
      lastError = timedOut
        ? new Error('Chapter download stalled (no progress).')
        : error instanceof Error
          ? error
          : new Error(String(error));
      // A full device fails every retry the same way; stop and say so.
      if (isOutOfSpaceError(lastError)) throw lastError;
    } finally {
      active = false;
      clearInactivityTimer();
      signal?.removeEventListener('abort', onAbort);
    }
    if (attempt < AUDIO_DOWNLOAD_MAX_ATTEMPTS) {
      await delay(AUDIO_DOWNLOAD_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1), signal);
    }
  }

  throw lastError ?? new Error('Chapter download failed.');
}

export async function runWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
  signal?: AbortSignal
): Promise<void> {
  if (items.length === 0) {
    return;
  }

  const limit = Math.max(1, Math.min(concurrency, items.length));
  let nextIndex = 0;
  let firstError: Error | null = null;

  const runners = Array.from({ length: limit }, async () => {
    while (firstError == null && !signal?.aborted) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      if (currentIndex >= items.length) {
        return;
      }

      try {
        await worker(items[currentIndex] as T);
      } catch (error) {
        // Workers already in flight keep running after the first failure; a later sibling
        // failure (e.g. a lookup rejecting after a cancel) must not replace it.
        firstError ??= error instanceof Error ? error : new Error(String(error));
        return;
      }
    }
  });

  await Promise.all(runners);

  if (firstError) {
    throw firstError;
  }
}

export function clampProgress(progress: number): number {
  if (!Number.isFinite(progress)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(progress)));
}
