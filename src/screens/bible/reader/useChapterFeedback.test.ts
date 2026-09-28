import test, { afterEach, before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  mockMmkvStorage,
  mockModule,
  mockReactNative,
  sourcePath,
} from '../../../testing/mockModules';
import { createReactHookRuntime } from '../../../testing/reactHookRuntime';
import type { ChapterFeedbackAudioDraft } from '../../../services/feedback/chapterFeedbackAudio';
import type {
  ChapterFeedbackFunctionResponse,
  ChapterFeedbackSubmissionInput,
} from '../../../services/feedback/chapterFeedbackService';
import type { ChapterFeedbackInput } from './useChapterFeedback';
import type { ChapterFeedbackAudioState } from './feedbackAudioSession';

// The real hook, local audio preparation, outbox and authenticated submit service run here.
// Only native state, file reads and the final network invoke are replaced.
const runtime = createReactHookRuntime();
mockModule(mock, 'react', runtime.react);
const rn = mockReactNative(mock);
mockMmkvStorage(mock);
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { resolve, promise };
};
interface AuthState {
  user: { uid: string } | null;
  authGeneration: number;
  session: { access_token: string };
  preferences: {
    chapterFeedbackEnabled: boolean;
    chapterFeedbackName: string;
    chapterFeedbackRole: string;
    contentLanguageCode: string;
    contentLanguageName: string;
  };
}
let state: AuthState;
let fileGate: ReturnType<typeof deferred> | null;
let responseGate: ReturnType<typeof deferred> | null;
let fileRead = false;
let draft: ChapterFeedbackAudioDraft | null;
let response: ChapterFeedbackFunctionResponse;
const dispatched: { body: ChapterFeedbackSubmissionInput; headers?: Record<string, string> }[] = [];
const auth = Object.assign(<T>(selector: (snapshot: AuthState) => T) => selector(state), {
  getState: () => state,
});
mockModule(mock, sourcePath('stores/authStore.ts'), { useAuthStore: auth });
mockModule(mock, sourcePath('stores/translatorReviewStore.ts'), {
  useTranslatorReviewStore: <T>(
    selector: (snapshot: { mode: string; enabled: boolean; councilPasscode: null }) => T
  ) => selector({ mode: 'community', enabled: true, councilPasscode: null }),
  getFeedbackParticipationMode: () => 'community',
});
mockModule(mock, 'react-i18next', {
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
});
mockModule(mock, sourcePath('utils/a11y.ts'), { announceLiveRegionText: () => {} });
mockModule(mock, sourcePath('constants/config.ts'), { config: { version: 'test' } });
mockModule(mock, sourcePath('utils/connectivity.ts'), { isDeviceOffline: async () => false });
mockModule(mock, 'expo-file-system/legacy', {
  getInfoAsync: async () => ({ exists: true, size: 3 }),
  readAsStringAsync: async () => {
    fileRead = true;
    if (fileGate) await fileGate.promise;
    return 'YWJj';
  },
});
mockModule(mock, sourcePath('services/supabase/index.ts'), {
  isSupabaseConfigured: () => true,
  supabase: {
    functions: {
      invoke: async (_name: string, options: (typeof dispatched)[number]) => {
        const result = response;
        const gate = responseGate;
        dispatched.push(options);
        if (gate) await gate.promise;
        return { data: result, error: null };
      },
    },
    auth: { getSession: async () => ({ data: { session: state.session } }) },
  },
});
mockModule(mock, sourcePath('screens/bible/reader/useChapterFeedbackAudio.ts'), {
  useChapterFeedbackAudio: ({ contextKey }: { contextKey: string }) => {
    const useState = runtime.react.useState as typeof import('react').useState;
    const [audioContext, setAudioContext] = useState(contextKey);
    const [feedbackAudioState, setFeedbackAudioState] = useState<ChapterFeedbackAudioState>(
      draft ? 'preview' : 'idle'
    );
    if (audioContext !== contextKey) {
      setAudioContext(contextKey);
      draft = null;
      setFeedbackAudioState('idle');
    }
    return {
      feedbackAudioState: audioContext === contextKey ? feedbackAudioState : 'idle',
      feedbackAudioDraft: draft,
      setFeedbackAudioState,
      resetFeedbackAudio: () => {
        draft = null;
        setFeedbackAudioState('idle');
      },
      suspendFeedbackAudio: async () => {},
    };
  },
});
let useChapterFeedback: typeof import('./useChapterFeedback').useChapterFeedback;
before(async () => {
  const outbox = await import('../../../services/feedback/chapterFeedbackOutbox');
  mockModule(mock, sourcePath('services/feedback/index.ts'), {
    submitChapterFeedbackOrQueue: outbox.submitChapterFeedbackOrQueue,
  });
  ({ useChapterFeedback } = await import('./useChapterFeedback'));
});
beforeEach(() => {
  state = {
    user: { uid: 'A' },
    authGeneration: 1,
    session: { access_token: 'token-A' },
    preferences: {
      chapterFeedbackEnabled: true,
      chapterFeedbackName: 'Alice',
      chapterFeedbackRole: 'Reader',
      contentLanguageCode: 'en',
      contentLanguageName: 'English',
    },
  };
  fileGate = null;
  responseGate = null;
  fileRead = false;
  dispatched.length = 0;
  draft = null;
  response = { success: true, saved: true, exported: true };
  rn.__recorded.alerts.length = 0;
});
afterEach(() => runtime.unmountAll());
const input = (chapter = 1): ChapterFeedbackInput => ({
  currentTranslation: 'bsb',
  currentTranslationInfo: undefined,
  translationLabel: 'BSB',
  bookId: 'GEN',
  chapter,
  onOpenChapterFeedback: () => {},
});
async function until(check: () => boolean) {
  for (let i = 0; i < 50 && !check(); i++)
    await new Promise<void>((resolve) => setImmediate(resolve));
  assert.ok(check(), 'the awaited operation was reached');
}
const mountDraft = () => {
  const mounted = runtime.mount(useChapterFeedback, input());
  mounted.flushEffects();
  mounted.result.setFeedbackSentiment('down');
  mounted.result.setFeedbackComment('A private draft');
  mounted.rerender();
  return mounted;
};
for (const identity of ['different UID', 'same UID new generation'] as const) {
  test(`a voice draft cannot dispatch after reader unmount and ${identity}`, async () => {
    draft = { uri: 'file:///local.m4a', durationMs: 1000 };
    fileGate = deferred();
    const mounted = mountDraft();
    const pending = mounted.result.handleSubmitChapterFeedback('listener');
    await until(() => fileRead);
    mounted.unmount();
    state = {
      ...state,
      user: { uid: identity === 'different UID' ? 'B' : 'A' },
      authGeneration: 3,
      session: { access_token: 'token-new' },
    };
    fileGate.resolve();
    await pending;
    assert.deepEqual(dispatched, []);
    assert.deepEqual(rn.__recorded.alerts, []);
  });
}

test('a changed account without a reader render cannot adopt the pending voice draft', async () => {
  draft = { uri: 'file:///local.m4a', durationMs: 1000 };
  fileGate = deferred();
  const mounted = mountDraft();
  const pending = mounted.result.handleSubmitChapterFeedback('listener');
  await until(() => fileRead);
  state = { ...state, user: { uid: 'B' }, authGeneration: 2, session: { access_token: 'token-B' } };
  fileGate.resolve();
  await pending;
  assert.deepEqual(dispatched, []);
});

test('a chapter change cancels pending file preparation and releases submitting controls', async () => {
  draft = { uri: 'file:///local.m4a', durationMs: 1000 };
  fileGate = deferred();
  const mounted = mountDraft();
  const pending = mounted.result.handleSubmitChapterFeedback('listener');
  await until(() => fileRead);
  mounted.rerender(input(2));
  mounted.flushEffects();
  assert.equal(mounted.rerender().isSubmittingFeedback, false);
  fileGate.resolve();
  await pending;
  assert.deepEqual(dispatched, []);
});

for (const change of ['chapter', 'account'] as const) {
  test(`a ${change} change releases the obsolete voice-upload phase`, async () => {
    draft = { uri: 'file:///local.m4a', durationMs: 1000 };
    fileGate = deferred();
    const mounted = mountDraft();
    const pending = mounted.result.handleSubmitChapterFeedback('listener');
    await until(() => fileRead);
    assert.equal(mounted.rerender().feedbackAudioState, 'uploading');
    if (change === 'account') state = { ...state, user: { uid: 'B' }, authGeneration: 2 };
    mounted.rerender(input(change === 'chapter' ? 2 : 1));
    mounted.flushEffects();
    const current = mounted.rerender();
    assert.equal(current.isSubmittingFeedback, false);
    assert.equal(current.feedbackAudioState, 'idle');
    // The old file read cannot restore uploading or settle a new request later.
    fileGate.resolve();
    await pending;
    assert.equal(mounted.rerender().feedbackAudioState, 'idle');
    assert.deepEqual(dispatched, []);
  });
}

test('an obsolete voice preparation cannot reset a newer pending voice upload', async () => {
  draft = { uri: 'file:///local.m4a', durationMs: 1000 };
  const oldGate = deferred();
  fileGate = oldGate;
  const mounted = mountDraft();
  const oldRequest = mounted.result.handleSubmitChapterFeedback('listener');
  await until(() => fileRead);
  mounted.rerender(input(2));
  mounted.flushEffects();
  draft = { uri: 'file:///new-chapter.m4a', durationMs: 1000 };
  mounted.rerender().setFeedbackSentiment('down');
  mounted.rerender().setFeedbackAudioState('preview');
  const newGate = deferred();
  fileGate = newGate;
  fileRead = false;
  const newRequest = mounted.rerender().handleSubmitChapterFeedback('listener');
  await until(() => fileRead);
  oldGate.resolve();
  await oldRequest;
  const current = mounted.rerender();
  assert.equal(current.isSubmittingFeedback, true);
  assert.equal(current.feedbackAudioState, 'uploading');
  assert.equal(dispatched.length, 0);
  newGate.resolve();
  await newRequest;
  assert.equal(dispatched.length, 1);
  assert.equal(dispatched[0]?.body.chapter, 2);
  assert.equal(mounted.rerender().feedbackAudioState, 'idle');
});

test('an older chapter result cannot settle a newer chapter submission', async () => {
  const mounted = mountDraft();
  const oldGate = deferred();
  responseGate = oldGate;
  const oldRequest = mounted.result.handleSubmitChapterFeedback('listener');
  await until(() => dispatched.length === 1);
  mounted.rerender(input(2));
  mounted.flushEffects();
  const next = mounted.rerender();
  assert.equal(next.isSubmittingFeedback, false);
  next.setFeedbackSentiment('down');
  next.setFeedbackComment('chapter two draft');
  const newGate = deferred();
  responseGate = newGate;
  const newRequest = mounted.rerender().handleSubmitChapterFeedback('listener');
  await until(() => dispatched.length === 2);
  oldGate.resolve();
  await oldRequest;
  const current = mounted.rerender();
  assert.equal(current.isSubmittingFeedback, true);
  assert.equal(current.feedbackComment, 'chapter two draft');
  assert.deepEqual(rn.__recorded.alerts, []);
  newGate.resolve();
  await newRequest;
  assert.equal(mounted.rerender().isSubmittingFeedback, false);
  assert.equal(mounted.result.feedbackComment, '');
  assert.equal(rn.__recorded.alerts.length, 1);
});

test('a submission result after reader unmount does not publish an alert', async () => {
  const mounted = mountDraft();
  responseGate = deferred();
  const pending = mounted.result.handleSubmitChapterFeedback('listener');
  await until(() => dispatched.length === 1);
  mounted.unmount();
  responseGate.resolve();
  await pending;
  assert.deepEqual(rn.__recorded.alerts, []);
});

for (const identity of ['different UID', 'same UID new generation'] as const) {
  test(`a pending submission result cannot update feedback after ${identity}`, async () => {
    const mounted = mountDraft();
    responseGate = deferred();
    const pending = mounted.result.handleSubmitChapterFeedback('listener');
    await until(() => dispatched.length === 1);
    state = {
      ...state,
      user: { uid: identity === 'different UID' ? 'B' : 'A' },
      authGeneration: 3,
    };
    responseGate.resolve();
    await pending;
    assert.deepEqual(rn.__recorded.alerts, []);
    const current = mounted.rerender();
    mounted.flushEffects();
    assert.equal(current.feedbackComment, '');
    assert.equal(current.isSubmittingFeedback, false);
  });
}

test('returning to an old chapter does not revive its obsolete submitting state', async () => {
  draft = { uri: 'file:///local.m4a', durationMs: 1000 };
  fileGate = deferred();
  const mounted = mountDraft();
  const pending = mounted.result.handleSubmitChapterFeedback('listener');
  await until(() => fileRead);
  mounted.rerender(input(2));
  mounted.flushEffects();
  mounted.rerender(input(1));
  mounted.flushEffects();
  assert.equal(mounted.rerender().isSubmittingFeedback, false);
  fileGate.resolve();
  await pending;
  assert.deepEqual(dispatched, []);
});

test('same-account token refresh preserves an owned voice submission', async () => {
  draft = { uri: 'file:///local.m4a', durationMs: 1000 };
  fileGate = deferred();
  const mounted = mountDraft();
  const pending = mounted.result.handleSubmitChapterFeedback('listener');
  await until(() => fileRead);
  state = { ...state, session: { access_token: 'refreshed-A' } };
  mounted.rerender();
  mounted.flushEffects();
  fileGate.resolve();
  await pending;
  assert.equal(dispatched.length, 1);
  assert.equal(dispatched[0]?.headers?.Authorization, 'Bearer refreshed-A');
  assert.equal(mounted.rerender().feedbackComment, '');
  assert.equal(mounted.result.isSubmittingFeedback, false);
  assert.equal(rn.__recorded.alerts.length, 1);
});

test('a current submission failure keeps its draft and allows retry', async () => {
  const mounted = mountDraft();
  response = { success: false, saved: false, exported: false, error: 'refused' };
  await mounted.result.handleSubmitChapterFeedback('reader');
  const failed = mounted.rerender();
  assert.equal(failed.feedbackComment, 'A private draft');
  assert.equal(failed.isSubmittingFeedback, false);
  assert.equal(failed.feedbackSubmitError, 'common.unexpectedError');
  response = { success: true, saved: true, exported: true };
  await failed.handleSubmitChapterFeedback('reader');
  assert.equal(dispatched.length, 2);
  assert.equal(mounted.rerender().feedbackComment, '');
});
