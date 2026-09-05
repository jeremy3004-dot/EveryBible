import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { URL } from 'node:url';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as identity from './chapterFeedbackIdentity';
import type {
  ChapterFeedbackSubmissionInput,
  submitChapterFeedback,
} from './chapterFeedbackService';

const input: ChapterFeedbackSubmissionInput = {
  translationId: 'bsb',
  translationLanguage: 'English',
  bookId: 'JHN',
  chapter: 3,
  sentiment: 'up',
  comment: 'Account A feedback',
  interfaceLanguage: 'en',
  contentLanguageCode: 'en',
  contentLanguageName: 'English',
  participantName: null,
  participantRole: null,
  sourceScreen: 'reader',
  appPlatform: 'ios',
  appVersion: '1.0.7',
};

const session = (accessToken: string, userId = 'A') => ({
  access_token: accessToken,
  user: { id: userId },
});

type Session = ReturnType<typeof session>;

function loadDefaultAdapter() {
  const auth = {
    user: { uid: 'A' } as { uid: string } | null,
    authGeneration: 1,
    session: session('expired-token') as Session | null,
  };
  const calls = { authorization: [] as Array<string | undefined>, refresh: 0, getSession: 0 };
  const hooks = {
    supabaseLoading: null as Promise<void> | null,
    invoke: async () => {},
    getSession: async (): Promise<Session | null> => auth.session,
    refresh: async (): Promise<{ data: { session: Session | null }; error: Error | null }> => ({
      data: { session: session('fresh-token') },
      error: null,
    }),
    rejectRetry: false,
  };
  const dependencies: Record<string, unknown> = {
    '../../constants/config': { config: { version: '1.0.7' } },
    './chapterFeedbackIdentity': identity,
    '../../stores/authStore': { useAuthStore: { getState: () => auth } },
    '../supabase': {
      isSupabaseConfigured: () => true,
      supabase: {
        auth: {
          getSession: async () => {
            calls.getSession += 1;
            return { data: { session: await hooks.getSession() }, error: null };
          },
          refreshSession: async () => {
            calls.refresh += 1;
            return hooks.refresh();
          },
        },
        functions: {
          invoke: async (_name: string, options: { headers?: Record<string, string> }) => {
            calls.authorization.push(options.headers?.Authorization);
            await hooks.invoke();
            return options.headers?.Authorization === 'Bearer fresh-token' && !hooks.rejectRetry
              ? { data: { success: true, saved: true, exported: false }, error: null }
              : {
                  data: null,
                  error: {
                    context: {
                      status: 401,
                      json: async () => ({ error: 'Not authenticated' }),
                    },
                  },
                };
          },
        },
      },
    },
  };
  // Execute the production adapter unchanged, mocking only native/service boundaries.
  const compiled = ts.transpileModule(
    readFileSync(new URL('./chapterFeedbackService.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }
  ).outputText;
  const exports = {};
  runInNewContext(compiled, {
    exports,
    Error,
    process: { env: {} },
    require: (name: string) => {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected import: ${name}`);
      if (name === '../supabase' && hooks.supabaseLoading) {
        return hooks.supabaseLoading.then(() => dependencies[name]);
      }
      return dependencies[name];
    },
  });
  return {
    auth,
    calls,
    hooks,
    submit: () =>
      (exports as { submitChapterFeedback: typeof submitChapterFeedback }).submitChapterFeedback(
        input
      ),
  };
}

test('default adapter refreshes a rejected stored token through Supabase before retrying', async () => {
  const runtime = loadDefaultAdapter();
  const result = await runtime.submit();

  assert.equal(runtime.calls.refresh, 1);
  assert.equal(runtime.calls.getSession, 0);
  assert.deepEqual(runtime.calls.authorization, ['Bearer expired-token', 'Bearer fresh-token']);
  assert.equal(result.success, true);
});

test('default adapter can read an unhydrated token from the Supabase session', async () => {
  const runtime = loadDefaultAdapter();
  runtime.auth.session = null;
  runtime.hooks.getSession = async () => session('fresh-token');

  assert.equal((await runtime.submit()).success, true);
  assert.equal(runtime.calls.getSession, 1);
  assert.equal(runtime.calls.refresh, 0);
});

for (const failure of ['error', 'no session', 'throw'] as const) {
  test(`default adapter preserves the sign-in result after refresh failure: ${failure}`, async () => {
    const runtime = loadDefaultAdapter();
    runtime.hooks.refresh = async () => {
      if (failure === 'throw') throw new Error('Refresh failed');
      return {
        data: { session: failure === 'error' ? session('fresh-token') : null },
        error: failure === 'error' ? new Error('Refresh failed') : null,
      };
    };

    const result = await runtime.submit();
    assert.equal(runtime.calls.refresh, 1);
    assert.deepEqual(runtime.calls.authorization, ['Bearer expired-token']);
    assert.equal(result.success, false);
    assert.equal(result.requiresSignIn, true);
  });
}

test('default adapter stops after the refreshed access token is also rejected', async () => {
  const runtime = loadDefaultAdapter();
  runtime.hooks.rejectRetry = true;

  const result = await runtime.submit();
  assert.equal(runtime.calls.refresh, 1);
  assert.deepEqual(runtime.calls.authorization, ['Bearer expired-token', 'Bearer fresh-token']);
  assert.equal(result.requiresSignIn, true);
});

test('default adapter does not refresh after sign-out while the first request is pending', async () => {
  const runtime = loadDefaultAdapter();
  runtime.hooks.invoke = async () => {
    runtime.auth.user = null;
    runtime.auth.session = null;
    runtime.auth.authGeneration += 1;
  };

  const result = await runtime.submit();
  assert.equal(runtime.calls.refresh, 0);
  assert.deepEqual(runtime.calls.authorization, ['Bearer expired-token']);
  assert.equal(result.requiresSignIn, true);
});

for (const nextUserId of ['B', 'A', null]) {
  test(`default adapter stops a pending refresh across auth boundary to ${nextUserId}`, async () => {
    const runtime = loadDefaultAdapter();
    runtime.hooks.refresh = async () => {
      runtime.auth.user = nextUserId ? { uid: nextUserId } : null;
      runtime.auth.session = nextUserId ? session('fresh-token', nextUserId) : null;
      runtime.auth.authGeneration += 1;
      return { data: { session: session('fresh-token', nextUserId ?? 'A') }, error: null };
    };

    const result = await runtime.submit();
    assert.equal(runtime.calls.refresh, 1);
    assert.deepEqual(runtime.calls.authorization, ['Bearer expired-token']);
    assert.equal(result.requiresSignIn, true);
  });
}

test('default adapter rejects another account returned by refresh before the store updates', async () => {
  const runtime = loadDefaultAdapter();
  runtime.hooks.refresh = async () => ({
    data: { session: session('fresh-token', 'B') },
    error: null,
  });

  const result = await runtime.submit();
  assert.equal(runtime.calls.refresh, 1);
  assert.deepEqual(runtime.calls.authorization, ['Bearer expired-token']);
  assert.equal(result.requiresSignIn, true);
});

test('default adapter stops submission if the account changes while reading the initial session', async () => {
  const runtime = loadDefaultAdapter();
  runtime.auth.session = null;
  runtime.hooks.getSession = async () => {
    runtime.auth.user = { uid: 'B' };
    runtime.auth.authGeneration += 1;
    return session('fresh-token', 'B');
  };

  const result = await runtime.submit();
  assert.deepEqual(runtime.calls.authorization, []);
  assert.equal(runtime.calls.refresh, 0);
  assert.equal(result.requiresSignIn, true);
});

test('default adapter keeps the entry account while lazy client imports are pending', async () => {
  const runtime = loadDefaultAdapter();
  let finishLoading!: () => void;
  runtime.hooks.supabaseLoading = new Promise<void>((resolve) => {
    finishLoading = resolve;
  });
  const pending = runtime.submit();
  await Promise.resolve();
  runtime.auth.user = { uid: 'B' };
  runtime.auth.session = session('fresh-token', 'B');
  runtime.auth.authGeneration += 1;
  finishLoading();

  const result = await pending;
  assert.deepEqual(runtime.calls.authorization, []);
  assert.equal(runtime.calls.refresh, 0);
  assert.equal(result.success, false);
  assert.equal(result.requiresSignIn, true);
});
