import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockModule, sourcePath } from '../../testing/mockModules';
import { createSupabaseFake, makeFakeSession, makeFakeUser } from '../../testing/supabaseFake';
import type {
  ChapterFeedbackFunctionResponse,
  ChapterFeedbackSubmissionInput,
} from './chapterFeedbackService';

// One mock configuration for the whole file. Scenarios are driven by mutating
// `backend.configured`, `authState`, and the fake's scripted responders.
const supabaseFake = createSupabaseFake();
const backend = { configured: true };
const authState: {
  user: { uid: string } | null;
  authGeneration: number;
  session: { access_token: string } | null;
} = { user: null, authGeneration: 0, session: null };

mockModule(mock, sourcePath('stores/authStore.ts'), {
  useAuthStore: { getState: () => authState },
});

const supabaseExports = {
  supabase: supabaseFake.client,
  isSupabaseConfigured: () => backend.configured,
  getCurrentUserId: async () => authState.user?.uid ?? null,
};
mockModule(mock, sourcePath('services/supabase/index.ts'), supabaseExports);
mockModule(mock, sourcePath('services/supabase/client.ts'), supabaseExports);

type ServiceModule = typeof import('./chapterFeedbackService');
let service: ServiceModule;

const defaultAuthHandlers = { ...supabaseFake.auth.handlers };

const baseInput: ChapterFeedbackSubmissionInput = {
  translationId: 'bsb',
  translationLanguage: 'English',
  bookId: 'JHN',
  chapter: 3,
  sentiment: 'up',
  comment: 'Clear and faithful',
  interfaceLanguage: 'en',
  contentLanguageCode: 'en',
  contentLanguageName: 'English',
  participantName: 'Miriam',
  participantRole: 'Church leader',
  sourceScreen: 'reader',
  appPlatform: 'ios',
  appVersion: '1.0.1',
};

const succeed = (): ChapterFeedbackFunctionResponse => ({
  success: true,
  saved: true,
  exported: true,
  feedbackId: 'feedback-1',
});

/** The Authorization header the service sent on each invoke, in call order. */
const sentAuthorizations = () =>
  supabaseFake.functionCalls.map(
    (call) => (call.options as { headers?: Record<string, string> } | undefined)?.headers
  );

const signIn = (uid: string, accessToken: string | null, authGeneration = 1) => {
  authState.user = { uid };
  authState.authGeneration = authGeneration;
  authState.session = accessToken ? { access_token: accessToken } : null;
  supabaseFake.auth.setSession(
    makeFakeSession({
      user: makeFakeUser({ id: uid }),
      access_token: accessToken ?? 'session-token',
    })
  );
};

const unauthorized = (body: unknown) => ({
  data: null,
  error: {
    message: 'Edge Function returned a non-2xx status code',
    context: { status: 401, json: async () => body },
  },
});

test.before(async () => {
  service = await import('./chapterFeedbackService');
});

test.beforeEach(() => {
  supabaseFake.reset();
  Object.assign(supabaseFake.auth.handlers, defaultAuthHandlers);
  backend.configured = true;
  authState.user = null;
  authState.authGeneration = 0;
  authState.session = null;
  supabaseFake.auth.setSession(null);
});

// ---------------------------------------------------------------------------
// Backend resolution
// ---------------------------------------------------------------------------

test('submitChapterFeedback tells the reader the backend is not configured for this build', async () => {
  backend.configured = false;

  const result = await service.submitChapterFeedback(baseInput);

  assert.deepEqual(result, {
    success: false,
    saved: false,
    exported: false,
    error: 'EveryBible backend is not configured for this build yet.',
  });
  assert.equal(supabaseFake.functionCalls.length, 0);
});

test('submitChapterFeedback invokes the edge function through the default Supabase client', async () => {
  signIn('user-a', 'stored-token');
  supabaseFake.respondToFunction(() => ({ data: succeed() }));

  const result = await service.submitChapterFeedback(baseInput);

  assert.equal(result.success, true);
  assert.equal(supabaseFake.functionCalls[0]?.name, 'submit-chapter-feedback');
  assert.deepEqual(sentAuthorizations(), [{ Authorization: 'Bearer stored-token' }]);
});

test('submitChapterFeedback reads the access token from Supabase when the store has none', async () => {
  signIn('user-a', null);
  supabaseFake.respondToFunction(() => ({ data: succeed() }));

  await service.submitChapterFeedback(baseInput);

  assert.deepEqual(sentAuthorizations(), [{ Authorization: 'Bearer session-token' }]);
  assert.equal(supabaseFake.authCalls.filter((call) => call.method === 'getSession').length, 1);
});

test('submitChapterFeedback sends no Authorization header for a signed-out reader', async () => {
  supabaseFake.respondToFunction(() => ({ data: succeed() }));

  await service.submitChapterFeedback(baseInput);

  assert.deepEqual(sentAuthorizations(), [undefined]);
});

test('submitChapterFeedback stops when the account changes while the token is read', async () => {
  signIn('user-a', null);
  supabaseFake.auth.handlers.getSession = async () => {
    // Another account signed in while the pending token read was in flight.
    authState.user = { uid: 'user-b' };
    return { data: { session: supabaseFake.auth.session }, error: null };
  };

  const result = await service.submitChapterFeedback(baseInput);

  assert.deepEqual(result, {
    success: false,
    saved: false,
    exported: false,
    error: 'Please sign in again before sending chapter feedback.',
    requiresSignIn: true,
  });
  assert.equal(supabaseFake.functionCalls.length, 0);
});

// ---------------------------------------------------------------------------
// 401 handling and the single refresh retry
// ---------------------------------------------------------------------------

test('submitChapterFeedback refreshes the rejected token and retries the submission once', async () => {
  signIn('user-a', 'expired-token');
  supabaseFake.auth.handlers.refreshSession = async () => ({
    data: {
      session: makeFakeSession({
        access_token: 'fresh-token',
        user: makeFakeUser({ id: 'user-a' }),
      }),
      user: makeFakeUser({ id: 'user-a' }),
    },
    error: null,
  });
  supabaseFake.respondToFunction((_name, options) =>
    (options as { headers?: Record<string, string> }).headers?.Authorization ===
    'Bearer fresh-token'
      ? { data: succeed() }
      : unauthorized({ error: 'Not authenticated' })
  );

  const result = await service.submitChapterFeedback(baseInput);

  assert.equal(result.success, true);
  assert.deepEqual(sentAuthorizations(), [
    { Authorization: 'Bearer expired-token' },
    { Authorization: 'Bearer fresh-token' },
  ]);
});

test('submitChapterFeedback asks the reader to sign in again when the refreshed token is also rejected', async () => {
  signIn('user-a', 'expired-token');
  supabaseFake.auth.handlers.refreshSession = async () => ({
    data: {
      session: makeFakeSession({
        access_token: 'fresh-token',
        user: makeFakeUser({ id: 'user-a' }),
      }),
      user: makeFakeUser({ id: 'user-a' }),
    },
    error: null,
  });
  supabaseFake.respondToFunction(() => unauthorized({ error: 'Not authenticated' }));

  const result = await service.submitChapterFeedback(baseInput);

  assert.equal(result.requiresSignIn, true);
  assert.equal(result.error, 'Please sign in again before sending chapter feedback.');
  assert.equal(supabaseFake.functionCalls.length, 2);
});

test('submitChapterFeedback does not retry when the refresh itself errors', async () => {
  signIn('user-a', 'expired-token');
  supabaseFake.auth.handlers.refreshSession = async () => ({
    data: { session: null, user: null },
    error: { message: 'refresh_token_not_found' },
  });
  supabaseFake.respondToFunction(() => unauthorized({ error: 'Not authenticated' }));

  const result = await service.submitChapterFeedback(baseInput);

  assert.equal(result.requiresSignIn, true);
  assert.equal(supabaseFake.functionCalls.length, 1);
});

test('submitChapterFeedback does not retry with a session belonging to another account', async () => {
  signIn('user-a', 'expired-token');
  supabaseFake.auth.handlers.refreshSession = async () => ({
    data: {
      session: makeFakeSession({
        access_token: 'other-token',
        user: makeFakeUser({ id: 'user-b' }),
      }),
      user: makeFakeUser({ id: 'user-b' }),
    },
    error: null,
  });
  supabaseFake.respondToFunction(() => unauthorized({ error: 'Not authenticated' }));

  const result = await service.submitChapterFeedback(baseInput);

  assert.equal(result.requiresSignIn, true);
  assert.equal(supabaseFake.functionCalls.length, 1);
});

test('submitChapterFeedback does not retry after the reader signed out mid-request', async () => {
  signIn('user-a', 'expired-token');
  supabaseFake.respondToFunction(() => {
    authState.user = null;
    return unauthorized({ error: 'Not authenticated' });
  });

  const result = await service.submitChapterFeedback(baseInput);

  assert.equal(result.requiresSignIn, true);
  assert.equal(supabaseFake.functionCalls.length, 1);
  assert.equal(
    supabaseFake.authCalls.some((call) => call.method === 'refreshSession'),
    false
  );
});

test('submitChapterFeedback keeps the sign-in prompt when the refresh call throws', async () => {
  signIn('user-a', 'expired-token');
  supabaseFake.auth.handlers.refreshSession = async () => {
    throw new Error('network down');
  };
  supabaseFake.respondToFunction(() => unauthorized({ error: 'Not authenticated' }));

  const result = await service.submitChapterFeedback(baseInput);

  assert.equal(result.requiresSignIn, true);
  assert.equal(result.error, 'Please sign in again before sending chapter feedback.');
});

// ---------------------------------------------------------------------------
// Error message resolution (exercised through an injected client)
// ---------------------------------------------------------------------------

const submitWithError = (error: unknown) =>
  service.submitChapterFeedback(baseInput, {
    invoke: async () => ({ data: null, error: error as never }),
  });

test('a non-401 edge error surfaces the error field from its JSON body', async () => {
  const result = await submitWithError({
    message: 'Edge Function returned a non-2xx status code',
    context: { status: 400, json: async () => ({ error: '  Chapter is out of range  ' }) },
  });

  assert.equal(result.error, 'Chapter is out of range');
  assert.equal(result.requiresSignIn, false);
});

test('a rate-limited submission surfaces the throttle message the server sent', async () => {
  const result = await submitWithError({
    message: 'Edge Function returned a non-2xx status code',
    context: {
      status: 429,
      json: async () => ({ error: 'Too many feedback submissions. Try again later.' }),
    },
  });

  assert.equal(result.error, 'Too many feedback submissions. Try again later.');
  assert.equal(result.success, false);
});

test('an unparsable JSON body falls through to the response text', async () => {
  const result = await submitWithError({
    message: 'Edge Function returned a non-2xx status code',
    context: {
      status: 500,
      json: async () => {
        throw new Error('not json');
      },
      text: async () => '  Internal error  ',
    },
  });

  assert.equal(result.error, 'Internal error');
});

test('an edge-runtime 401 in the response text reads as a temporary outage, not a sign-in prompt', async () => {
  const result = await submitWithError({
    message: 'Edge Function returned a non-2xx status code',
    context: { status: 401, text: async () => 'Invalid JWT' },
  });

  assert.equal(
    result.error,
    'Chapter feedback is temporarily unavailable right now. Please try again soon.'
  );
  // The reader still has to sign in again to retry, so the flag stays set.
  assert.equal(result.requiresSignIn, true);
});

test('an edge-runtime 401 in the JSON body reads as a temporary outage', async () => {
  const result = await submitWithError({
    message: 'Edge Function returned a non-2xx status code',
    context: { status: 401, json: async () => ({ message: 'Missing authorization header' }) },
  });

  assert.equal(
    result.error,
    'Chapter feedback is temporarily unavailable right now. Please try again soon.'
  );
});

test('a body with neither error nor text falls back to the wrapper message', async () => {
  const result = await submitWithError({
    message: 'Function not found',
    context: { status: 404, json: async () => ({}), text: async () => '   ' },
  });

  assert.equal(result.error, 'Function not found');
});

test('a response whose text read throws falls back to the wrapper message', async () => {
  const result = await submitWithError({
    message: 'Function crashed',
    context: {
      status: 500,
      text: async () => {
        throw new Error('stream closed');
      },
    },
  });

  assert.equal(result.error, 'Function crashed');
});

test('an error without a response context falls back to its own message', async () => {
  const result = await submitWithError({ message: 'Failed to fetch' });

  assert.equal(result.error, 'Failed to fetch');
  assert.equal(result.requiresSignIn, false);
});

test('an error with neither context nor message uses the generic failure copy', async () => {
  const result = await submitWithError({});

  assert.equal(result.error, 'Unable to submit chapter feedback right now.');
});

test('a 401 without any readable body still asks the reader to sign in again', async () => {
  const result = await submitWithError({ context: { status: 401 } });

  assert.equal(result.error, 'Please sign in again before sending chapter feedback.');
  assert.equal(result.requiresSignIn, true);
});

test('an empty successful response is reported as a failed submission', async () => {
  const result = await service.submitChapterFeedback(baseInput, {
    invoke: async () => ({ data: null, error: null }),
  });

  assert.deepEqual(result, {
    success: false,
    saved: false,
    exported: false,
    error: 'Unable to submit chapter feedback right now.',
  });
});

test('a client that throws is reported with the thrown message', async () => {
  const result = await service.submitChapterFeedback(baseInput, {
    invoke: async () => {
      throw new Error('Network request failed');
    },
  });

  assert.deepEqual(result, {
    success: false,
    saved: false,
    exported: false,
    error: 'Network request failed',
  });
});

test('a client that throws a non-Error value falls back to the generic failure copy', async () => {
  const result = await service.submitChapterFeedback(baseInput, {
    invoke: async () => {
      throw 'boom';
    },
  });

  assert.equal(result.error, 'Unable to submit chapter feedback right now.');
});

// ---------------------------------------------------------------------------
// Payload construction
// ---------------------------------------------------------------------------

test('the payload falls back to the build platform and app version when the caller omits them', async () => {
  const previousPlatform = process.env.EXPO_OS;
  process.env.EXPO_OS = 'android';
  const { appPlatform, appVersion, ...withoutBuildInfo } = baseInput;
  void appPlatform;
  void appVersion;
  let sent: ChapterFeedbackSubmissionInput | null = null;

  await service.submitChapterFeedback(withoutBuildInfo, {
    invoke: async (_name, { body }) => {
      sent = body;
      return { data: succeed(), error: null };
    },
  });

  const payload = sent as ChapterFeedbackSubmissionInput | null;
  assert.equal(payload?.appPlatform, 'android');
  const { config } = await import('../../constants/config');
  assert.equal(payload?.appVersion, config.version);

  if (previousPlatform === undefined) {
    delete process.env.EXPO_OS;
  } else {
    process.env.EXPO_OS = previousPlatform;
  }
});

test('the payload reports an unknown platform when the build does not name one', async () => {
  const previousPlatform = process.env.EXPO_OS;
  delete process.env.EXPO_OS;
  const { appPlatform, ...withoutPlatform } = baseInput;
  void appPlatform;
  let sent: ChapterFeedbackSubmissionInput | null = null;

  await service.submitChapterFeedback(withoutPlatform, {
    invoke: async (_name, { body }) => {
      sent = body;
      return { data: succeed(), error: null };
    },
  });

  assert.equal((sent as ChapterFeedbackSubmissionInput | null)?.appPlatform, 'unknown');

  if (previousPlatform !== undefined) {
    process.env.EXPO_OS = previousPlatform;
  }
});

test('a half-filled reviewer identity is dropped rather than sent in part', async () => {
  let sent: ChapterFeedbackSubmissionInput | null = null;

  await service.submitChapterFeedback(
    { ...baseInput, participantName: 'Miriam', participantRole: '   ' },
    {
      invoke: async (_name, { body }) => {
        sent = body;
        return { data: succeed(), error: null };
      },
    }
  );

  const payload = sent as ChapterFeedbackSubmissionInput | null;
  assert.equal(payload?.participantName, null);
  assert.equal(payload?.participantRole, null);
});

test('an audio response is forwarded to the edge function untouched', async () => {
  const audioResponse = {
    bucket: 'chapter-feedback-audio',
    path: 'user-a/feedback.m4a',
    durationMs: 4200,
    mimeType: 'audio/m4a',
    sizeBytes: 91_000,
    createdAt: '2026-05-01T00:00:00.000Z',
  };
  let sent: ChapterFeedbackSubmissionInput | null = null;

  await service.submitChapterFeedback(
    { ...baseInput, audioResponse },
    {
      invoke: async (_name, { body }) => {
        sent = body;
        return { data: succeed(), error: null };
      },
    }
  );

  assert.deepEqual((sent as ChapterFeedbackSubmissionInput | null)?.audioResponse, audioResponse);
});

test('an injected auth client is used instead of the store-backed default', async () => {
  signIn('user-a', 'stored-token');
  supabaseFake.respondToFunction(() => ({ data: succeed() }));

  await service.submitChapterFeedback(baseInput, supabaseFake.client.functions as never, {
    getAccessToken: async () => 'injected-token',
    refreshAccessToken: async () => null,
  });

  assert.deepEqual(sentAuthorizations(), [{ Authorization: 'Bearer injected-token' }]);
  assert.equal(
    supabaseFake.authCalls.some((call) => call.method === 'getSession'),
    false
  );
});
