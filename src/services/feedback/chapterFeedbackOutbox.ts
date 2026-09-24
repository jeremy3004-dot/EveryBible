import { zustandStorage } from '../../stores/mmkvStorage';
import { isDeviceOffline } from '../../utils/connectivity';
import {
  submitChapterFeedback,
  type ChapterFeedbackFunctionResponse,
  type ChapterFeedbackSubmissionInput,
} from './chapterFeedbackService';

// Chapter feedback is often given where the connection is worst (a council
// reviewing a translation in a village). A written response that cannot reach
// the server is kept here and sent by the next sync (useSync: foreground and
// reconnect) instead of being lost when the reader closes the sheet.
//
// Voice responses are not queued: the recording is several MB of base64 and
// would bloat the shared MMKV file every store loads at launch. The reader
// keeps a voice draft in the sheet and says it is offline instead.

export const CHAPTER_FEEDBACK_OUTBOX_KEY = 'chapter-feedback-outbox';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 50;

type QueuedInput = Omit<ChapterFeedbackSubmissionInput, 'councilPasscode' | 'audioResponse'>;

interface OutboxEntry {
  id: string;
  userId: string;
  queuedAt: number;
  input: QueuedInput;
}

export type ChapterFeedbackSubmitResult = ChapterFeedbackFunctionResponse & {
  /** Saved on the device; the next sync sends it. */
  queued?: boolean;
  /** The device is offline and this submission could not be queued (voice, signed out). */
  offline?: boolean;
};

export interface ChapterFeedbackOutboxDeps {
  submit?: (input: ChapterFeedbackSubmissionInput) => Promise<ChapterFeedbackFunctionResponse>;
  isOffline?: () => Promise<boolean>;
  getUserId?: () => string | null;
  /** The council passcode lives in SecureStore; it is read at send time, never queued. */
  getCouncilPasscode?: () => string | null;
  now?: () => number;
}

const defaultGetUserId = (): string | null => {
  const { useAuthStore } =
    require('../../stores/authStore') as typeof import('../../stores/authStore');
  return useAuthStore.getState().user?.uid ?? null;
};

const defaultGetCouncilPasscode = (): string | null => {
  const { useTranslatorReviewStore } =
    require('../../stores/translatorReviewStore') as typeof import('../../stores/translatorReviewStore');
  return useTranslatorReviewStore.getState().councilPasscode;
};

const resolveDeps = (deps: ChapterFeedbackOutboxDeps = {}) => ({
  submit: deps.submit ?? ((input: ChapterFeedbackSubmissionInput) => submitChapterFeedback(input)),
  isOffline: deps.isOffline ?? isDeviceOffline,
  getUserId: deps.getUserId ?? defaultGetUserId,
  getCouncilPasscode: deps.getCouncilPasscode ?? defaultGetCouncilPasscode,
  now: deps.now ?? Date.now,
});

const readEntries = (): OutboxEntry[] => {
  try {
    const raw = zustandStorage.getItem(CHAPTER_FEEDBACK_OUTBOX_KEY);
    const parsed: unknown = typeof raw === 'string' ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as OutboxEntry[]) : [];
  } catch {
    return [];
  }
};

const writeEntries = (entries: OutboxEntry[]): void => {
  if (entries.length === 0) {
    void zustandStorage.removeItem(CHAPTER_FEEDBACK_OUTBOX_KEY);
    return;
  }
  void zustandStorage.setItem(CHAPTER_FEEDBACK_OUTBOX_KEY, JSON.stringify(entries));
};

const removeEntry = (id: string): void => {
  writeEntries(readEntries().filter((entry) => entry.id !== id));
};

const enqueue = (userId: string, input: ChapterFeedbackSubmissionInput, now: number): void => {
  const queuedInput: QueuedInput & Partial<ChapterFeedbackSubmissionInput> = { ...input };
  delete queuedInput.councilPasscode;
  delete queuedInput.audioResponse;
  const entry: OutboxEntry = {
    id: `${now.toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    userId,
    queuedAt: now,
    input: queuedInput,
  };
  writeEntries([...readEntries(), entry].slice(-MAX_ENTRIES));
};

const offlineResult = (): ChapterFeedbackSubmitResult => ({
  success: false,
  saved: false,
  exported: false,
  error: 'offline',
  retryable: true,
  offline: true,
});

const queuedResult = (): ChapterFeedbackSubmitResult => ({
  success: true,
  saved: false,
  exported: false,
  queued: true,
});

/**
 * Sends chapter feedback, or keeps a written response on the device when the
 * network is unavailable so the next sync can send it.
 */
export async function submitChapterFeedbackOrQueue(
  input: ChapterFeedbackSubmissionInput,
  deps?: ChapterFeedbackOutboxDeps
): Promise<ChapterFeedbackSubmitResult> {
  const { submit, isOffline, getUserId, now } = resolveDeps(deps);
  const userId = getUserId();
  const canQueue = Boolean(userId) && !input.audioResponse;

  if (await isOffline()) {
    if (!canQueue || !userId) {
      return offlineResult();
    }
    enqueue(userId, input, now());
    return queuedResult();
  }

  const result = await submit(input);
  if (!result.success && result.retryable && canQueue && userId) {
    enqueue(userId, input, now());
    return queuedResult();
  }
  return result;
}

export function countQueuedChapterFeedback(userId: string): number {
  return readEntries().filter((entry) => entry.userId === userId).length;
}

let activeFlush: Promise<{ sent: number; remaining: number }> | null = null;

/**
 * Sends the account's queued feedback, oldest first. Stops at the first
 * submission that still cannot get through; drops ones the server refused or
 * that are over 30 days old. Only one flush runs at a time.
 */
export function flushChapterFeedbackOutbox(
  userId: string,
  deps?: ChapterFeedbackOutboxDeps
): Promise<{ sent: number; remaining: number }> {
  if (activeFlush) {
    return activeFlush;
  }
  activeFlush = runFlush(userId, resolveDeps(deps)).finally(() => {
    activeFlush = null;
  });
  return activeFlush;
}

async function runFlush(
  userId: string,
  { submit, getUserId, getCouncilPasscode, now }: ReturnType<typeof resolveDeps>
): Promise<{ sent: number; remaining: number }> {
  let sent = 0;
  const pending = readEntries().filter((entry) => entry.userId === userId);

  for (const entry of pending) {
    if (now() - entry.queuedAt > MAX_AGE_MS) {
      removeEntry(entry.id);
      continue;
    }
    if (getUserId() !== userId) {
      break;
    }

    const result = await submit({
      ...entry.input,
      audioResponse: null,
      councilPasscode:
        entry.input.contributorCategory === 'scripture_council' ? getCouncilPasscode() : undefined,
    });

    if (result.success) {
      removeEntry(entry.id);
      sent += 1;
      continue;
    }
    if (result.retryable || result.requiresSignIn) {
      break;
    }
    removeEntry(entry.id);
  }

  return { sent, remaining: countQueuedChapterFeedback(userId) };
}
