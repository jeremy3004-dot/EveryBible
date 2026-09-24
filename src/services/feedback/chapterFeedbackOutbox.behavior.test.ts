import test, { beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockMmkvStorage } from '../../testing/mockModules';
import type {
  ChapterFeedbackFunctionResponse,
  ChapterFeedbackSubmissionInput,
} from './chapterFeedbackService';
import type { ChapterFeedbackOutboxDeps } from './chapterFeedbackOutbox';

const mmkv = mockMmkvStorage(mock).store;

type Outbox = typeof import('./chapterFeedbackOutbox');
let outbox: Outbox;

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-09-24T12:00:00.000Z');

const baseInput: ChapterFeedbackSubmissionInput = {
  translationId: 'bsb',
  translationLanguage: 'English',
  bookId: 'JHN',
  chapter: 3,
  sentiment: 'down',
  comment: 'Verse 16 reads awkwardly',
  interfaceLanguage: 'en',
  contentLanguageCode: 'en',
  contentLanguageName: 'English',
  participantName: 'Miriam',
  participantRole: 'Church leader',
  contributorCategory: 'community',
  audioResponse: null,
  sourceScreen: 'reader',
  appPlatform: 'ios',
  appVersion: '1.0.8',
};

const sent = (): ChapterFeedbackFunctionResponse => ({
  success: true,
  saved: true,
  exported: true,
  feedbackId: 'feedback-1',
});
const unreachable = (): ChapterFeedbackFunctionResponse => ({
  success: false,
  saved: false,
  exported: false,
  error: 'Failed to send a request to the Edge Function',
  retryable: true,
});
const refused = (): ChapterFeedbackFunctionResponse => ({
  success: false,
  saved: false,
  exported: false,
  error: 'Chapter is out of range',
});

interface Harness {
  deps: Required<ChapterFeedbackOutboxDeps>;
  submissions: ChapterFeedbackSubmissionInput[];
  offline: boolean;
  userId: string | null;
  passcode: string | null;
  now: number;
  respond: () => ChapterFeedbackFunctionResponse;
}

let h: Harness;

const createHarness = (): Harness => {
  const harness = {
    submissions: [] as ChapterFeedbackSubmissionInput[],
    offline: false,
    userId: 'user-a' as string | null,
    passcode: null as string | null,
    now: NOW,
    respond: sent,
  } as Harness;
  harness.deps = {
    submit: async (input) => {
      harness.submissions.push(input as ChapterFeedbackSubmissionInput);
      return harness.respond();
    },
    isOffline: async () => harness.offline,
    getUserId: () => harness.userId,
    getCouncilPasscode: () => harness.passcode,
    now: () => harness.now,
  };
  return harness;
};

test.before(async () => {
  outbox = await import('./chapterFeedbackOutbox');
});

beforeEach(() => {
  mmkv.clear();
  h = createHarness();
});

// ---------------------------------------------------------------------------
// Submitting
// ---------------------------------------------------------------------------

test('feedback written offline is kept on the device and reported as queued, not failed', async () => {
  h.offline = true;

  const result = await outbox.submitChapterFeedbackOrQueue(baseInput, h.deps);

  assert.equal(result.success, true);
  assert.equal(result.queued, true);
  assert.deepEqual(h.submissions, []);
  assert.equal(outbox.countQueuedChapterFeedback('user-a'), 1);
});

test('feedback online is sent straight away and nothing is queued', async () => {
  const result = await outbox.submitChapterFeedbackOrQueue(baseInput, h.deps);

  assert.deepEqual(result, sent());
  assert.equal(h.submissions.length, 1);
  assert.equal(outbox.countQueuedChapterFeedback('user-a'), 0);
});

test('feedback that could not reach the server is queued instead of lost', async () => {
  h.respond = unreachable;

  const result = await outbox.submitChapterFeedbackOrQueue(baseInput, h.deps);

  assert.equal(result.success, true);
  assert.equal(result.queued, true);
  assert.equal(outbox.countQueuedChapterFeedback('user-a'), 1);
});

test('feedback the server refused is reported as a failure and not queued', async () => {
  h.respond = refused;

  const result = await outbox.submitChapterFeedbackOrQueue(baseInput, h.deps);

  assert.deepEqual(result, refused());
  assert.equal(outbox.countQueuedChapterFeedback('user-a'), 0);
});

test('a voice response offline is not queued; the reader is told it is offline and keeps the draft', async () => {
  h.offline = true;
  const withAudio: ChapterFeedbackSubmissionInput = {
    ...baseInput,
    audioResponse: {
      bucket: 'chapter-feedback-audio',
      path: null,
      durationMs: 4200,
      mimeType: 'audio/m4a',
      sizeBytes: 90_000,
      createdAt: '2026-09-24T11:59:00.000Z',
      base64Data: 'AAAA',
    },
  };

  const result = await outbox.submitChapterFeedbackOrQueue(withAudio, h.deps);

  assert.equal(result.success, false);
  assert.equal(result.offline, true);
  assert.equal(result.queued, undefined);
  assert.deepEqual(h.submissions, []);
  assert.equal(outbox.countQueuedChapterFeedback('user-a'), 0);
});

test('a signed-out reader offline is not queued, since the server needs an account to accept it', async () => {
  h.offline = true;
  h.userId = null;

  const result = await outbox.submitChapterFeedbackOrQueue(baseInput, h.deps);

  assert.equal(result.success, false);
  assert.equal(result.offline, true);
  assert.equal(result.queued, undefined);
});

test('a queued council submission never stores the council passcode on the device', async () => {
  h.offline = true;

  await outbox.submitChapterFeedbackOrQueue(
    { ...baseInput, contributorCategory: 'scripture_council', councilPasscode: 'secret-9' },
    h.deps
  );

  const persisted = [...mmkv.values()].join('\n');
  assert.equal(persisted.includes('secret-9'), false);
  assert.equal(outbox.countQueuedChapterFeedback('user-a'), 1);
});

// ---------------------------------------------------------------------------
// Flushing
// ---------------------------------------------------------------------------

test('a flush sends queued feedback for the signed-in account and clears it', async () => {
  h.offline = true;
  await outbox.submitChapterFeedbackOrQueue(baseInput, h.deps);
  await outbox.submitChapterFeedbackOrQueue({ ...baseInput, chapter: 4 }, h.deps);
  h.offline = false;

  const result = await outbox.flushChapterFeedbackOutbox('user-a', h.deps);

  assert.deepEqual(result, { sent: 2, remaining: 0 });
  assert.deepEqual(
    h.submissions.map((input) => input.chapter),
    [3, 4]
  );
  assert.equal(h.submissions[0].comment, baseInput.comment);
  assert.equal(outbox.countQueuedChapterFeedback('user-a'), 0);
});

test('a council submission is sent with the passcode held at send time', async () => {
  h.offline = true;
  await outbox.submitChapterFeedbackOrQueue(
    { ...baseInput, contributorCategory: 'scripture_council', councilPasscode: 'secret-9' },
    h.deps
  );
  h.passcode = 'secret-9';

  await outbox.flushChapterFeedbackOutbox('user-a', h.deps);

  assert.equal(h.submissions[0].councilPasscode, 'secret-9');
  assert.equal(h.submissions[0].contributorCategory, 'scripture_council');
});

// The passcode is gone from the device after a sign-out and back in, a switch to community
// mode, or an unreadable keychain. The server would refuse a council submission without it
// (and count a wrong guess against the network), which is no verdict on the feedback.
test('a council submission waits while the device holds no council passcode', async () => {
  h.offline = true;
  await outbox.submitChapterFeedbackOrQueue(
    { ...baseInput, contributorCategory: 'scripture_council', councilPasscode: 'secret-9' },
    h.deps
  );
  await outbox.submitChapterFeedbackOrQueue({ ...baseInput, chapter: 4 }, h.deps);
  h.passcode = null;
  h.respond = () =>
    h.submissions.at(-1)?.contributorCategory === 'scripture_council' ? refused() : sent();

  const result = await outbox.flushChapterFeedbackOutbox('user-a', h.deps);

  assert.deepEqual(result, { sent: 1, remaining: 1 });
  assert.deepEqual(
    h.submissions.map((input) => input.chapter),
    [4],
    'only the community response was sent'
  );

  h.passcode = 'secret-9';
  h.respond = sent;
  assert.deepEqual(await outbox.flushChapterFeedbackOutbox('user-a', h.deps), {
    sent: 1,
    remaining: 0,
  });
  assert.equal(h.submissions.at(-1)?.councilPasscode, 'secret-9');
});

test('a flush that still cannot reach the server stops and keeps everything for next time', async () => {
  h.offline = true;
  await outbox.submitChapterFeedbackOrQueue(baseInput, h.deps);
  await outbox.submitChapterFeedbackOrQueue({ ...baseInput, chapter: 4 }, h.deps);
  h.respond = unreachable;

  const result = await outbox.flushChapterFeedbackOutbox('user-a', h.deps);

  assert.deepEqual(result, { sent: 0, remaining: 2 });
  assert.equal(h.submissions.length, 1);
});

test('a flush keeps feedback the server turned away for want of a fresh sign-in', async () => {
  h.offline = true;
  await outbox.submitChapterFeedbackOrQueue(baseInput, h.deps);
  h.respond = () => ({ ...refused(), requiresSignIn: true });

  const result = await outbox.flushChapterFeedbackOutbox('user-a', h.deps);

  assert.deepEqual(result, { sent: 0, remaining: 1 });
});

test('a flush drops feedback the server refused on its merits so it is not retried forever', async () => {
  h.offline = true;
  await outbox.submitChapterFeedbackOrQueue(baseInput, h.deps);
  h.respond = refused;

  const result = await outbox.flushChapterFeedbackOutbox('user-a', h.deps);

  assert.deepEqual(result, { sent: 0, remaining: 0 });
});

test("a flush leaves another account's queued feedback untouched", async () => {
  h.offline = true;
  await outbox.submitChapterFeedbackOrQueue(baseInput, h.deps);
  h.userId = 'user-b';
  h.offline = false;

  const result = await outbox.flushChapterFeedbackOutbox('user-b', h.deps);

  assert.deepEqual(result, { sent: 0, remaining: 0 });
  assert.deepEqual(h.submissions, []);
  assert.equal(outbox.countQueuedChapterFeedback('user-a'), 1);
});

test('a flush stops if the account changes mid-way', async () => {
  h.offline = true;
  await outbox.submitChapterFeedbackOrQueue(baseInput, h.deps);
  await outbox.submitChapterFeedbackOrQueue({ ...baseInput, chapter: 4 }, h.deps);
  h.respond = () => {
    h.userId = 'user-b';
    return sent();
  };

  const result = await outbox.flushChapterFeedbackOutbox('user-a', h.deps);

  assert.deepEqual(result, { sent: 1, remaining: 1 });
});

test('feedback queued more than 30 days ago is discarded without being sent', async () => {
  h.offline = true;
  await outbox.submitChapterFeedbackOrQueue(baseInput, h.deps);
  h.now = NOW + 31 * DAY_MS;

  const result = await outbox.flushChapterFeedbackOutbox('user-a', h.deps);

  assert.deepEqual(result, { sent: 0, remaining: 0 });
  assert.deepEqual(h.submissions, []);
});

test('two flushes started together send each submission once', async () => {
  h.offline = true;
  await outbox.submitChapterFeedbackOrQueue(baseInput, h.deps);

  await Promise.all([
    outbox.flushChapterFeedbackOutbox('user-a', h.deps),
    outbox.flushChapterFeedbackOutbox('user-a', h.deps),
  ]);

  assert.equal(h.submissions.length, 1);
});

test('an unreadable stored outbox is treated as empty rather than crashing the flush', async () => {
  mmkv.set(outbox.CHAPTER_FEEDBACK_OUTBOX_KEY, '{not json');

  assert.equal(outbox.countQueuedChapterFeedback('user-a'), 0);
  assert.deepEqual(await outbox.flushChapterFeedbackOutbox('user-a', h.deps), {
    sent: 0,
    remaining: 0,
  });
});

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test('a submission that timed out is retried with the same client submission id', async () => {
  // The first request may have been saved before the response was lost; the server
  // recognises the retry by its id instead of storing the feedback twice.
  h.respond = unreachable;
  await outbox.submitChapterFeedbackOrQueue(baseInput, h.deps);
  h.respond = sent;

  await outbox.flushChapterFeedbackOutbox('user-a', h.deps);

  const [first, retry] = h.submissions;
  assert.match(first.clientSubmissionId ?? '', UUID);
  assert.equal(retry.clientSubmissionId, first.clientSubmissionId);
});

test('each new submission gets its own client submission id', async () => {
  await outbox.submitChapterFeedbackOrQueue(baseInput, h.deps);
  await outbox.submitChapterFeedbackOrQueue(baseInput, h.deps);

  const [first, second] = h.submissions;
  assert.match(first.clientSubmissionId ?? '', UUID);
  assert.match(second.clientSubmissionId ?? '', UUID);
  assert.notEqual(first.clientSubmissionId, second.clientSubmissionId);
});

test('feedback queued offline keeps one id across flushes that fail and then succeed', async () => {
  h.offline = true;
  await outbox.submitChapterFeedbackOrQueue(baseInput, h.deps);
  h.offline = false;
  h.respond = unreachable;
  await outbox.flushChapterFeedbackOutbox('user-a', h.deps);
  h.respond = sent;

  await outbox.flushChapterFeedbackOutbox('user-a', h.deps);

  assert.equal(h.submissions.length, 2);
  assert.match(h.submissions[0].clientSubmissionId ?? '', UUID);
  assert.equal(h.submissions[1].clientSubmissionId, h.submissions[0].clientSubmissionId);
});

test('feedback queued by an older build gets one id that it keeps across retries', async () => {
  mmkv.set(
    'chapter-feedback-outbox',
    JSON.stringify([
      { id: 'legacy-1', userId: 'user-a', queuedAt: NOW - DAY_MS, input: { ...baseInput } },
    ])
  );
  h.respond = unreachable;
  await outbox.flushChapterFeedbackOutbox('user-a', h.deps);
  h.respond = sent;

  await outbox.flushChapterFeedbackOutbox('user-a', h.deps);

  assert.match(h.submissions[0].clientSubmissionId ?? '', UUID);
  assert.equal(h.submissions[1].clientSubmissionId, h.submissions[0].clientSubmissionId);
});
