/**
 * Shared setup for the ChapterFeedbackReviewScreen render tests.
 *
 * Installs the translator review store, a recording expo-av, and a scriptable
 * feedback service: each call is recorded, and a test swaps a response through
 * `responders` (reset after every test). Call `installFeedbackReviewFixture(mock)`
 * once at module scope, before the screen is imported.
 */
import { afterEach, type MockTracker } from 'node:test';
import { create } from 'zustand';
import { hostComponent } from '../../testing/reactNativeHost';
import { mockBarrel, mockModule, mockPackage, sourcePath } from '../../testing/mockModules';
import { installRenderHarness, within } from '../../testing/render';
import type { ChapterFeedbackReviewItem } from '../../services/feedback/chapterFeedbackReviewService';

export type PlaybackStatus = {
  isLoaded: boolean;
  didJustFinish?: boolean;
  positionMillis?: number;
  durationMillis?: number;
};

export type FakeSound = {
  playAsync: () => Promise<void>;
  pauseAsync: () => Promise<void>;
  unloadAsync: () => Promise<void>;
  setOnPlaybackStatusUpdate: (listener: (status: PlaybackStatus) => void) => void;
};

type Result = { success: boolean; [key: string]: unknown };
type Responder = (input: Record<string, unknown>) => Promise<Result>;

export const item = (overrides: Partial<ChapterFeedbackReviewItem>): ChapterFeedbackReviewItem => ({
  contributorCategory: 'scripture_council',
  id: 'x',
  createdAt: '2026-09-01T12:00:00Z',
  translationId: 'bsb',
  translationLanguage: 'en',
  bookId: 'JHN',
  chapter: 3,
  sentiment: 'down',
  comment: null,
  participantName: 'Ruth',
  participantRole: null,
  participantIdNumber: null,
  sourceScreen: 'reader',
  resolution: null,
  resolvedAt: null,
  resolutionNote: null,
  audioResponse: null,
  ...overrides,
});

export const concern = item({
  id: 'c1',
  comment: 'The name is misspelled',
  audioResponse: {
    createdAt: null,
    durationMs: 12000,
    mimeType: 'audio/m4a',
    playbackUrl: null,
    sizeBytes: null,
  },
});
export const praise = item({ id: 'p1', sentiment: 'up', comment: 'Reads clearly' });
export const settled = item({
  id: 's1',
  comment: 'Old concern',
  resolution: 'fixed',
  resolvedAt: '2026-09-02T12:00:00Z',
  resolutionNote: 'Spelling corrected',
});

export const feedbackPage = (overrides: Record<string, unknown> = {}): Result => ({
  success: true,
  feedback: [concern, praise, settled],
  summary: { bookId: 'JHN', chapter: 3, total: 3, unresolvedDown: 1, unresolvedUp: 1 },
  positiveCount: 0,
  nextCursor: null,
  ...overrides,
});

const defaultResponders = (): Record<
  'fetch' | 'resolve' | 'reopen' | 'reviewPositive' | 'audioUrl',
  Responder
> => ({
  fetch: async () => feedbackPage(),
  resolve: async () => ({ success: true }),
  reopen: async () => ({ success: true }),
  reviewPositive: async () => ({ success: true, feedbackIds: [] }),
  audioUrl: async () => ({ success: true, playbackUrl: 'https://media.test/c1.m4a' }),
});

export function installFeedbackReviewFixture(mock: MockTracker) {
  const harness = installRenderHarness(mock);
  const t = (key: string, options?: Record<string, unknown>) => harness.i18n.t(key, options);

  // Participation is switched in Settings only; the review screen must never call these.
  const participationCalls: string[] = [];
  const listened: string[] = [];
  const initialReviewState = { enabled: true, accessPasscode: '123456' as string | null };
  const reviewStore = create(() => ({
    ...initialReviewState,
    markListened: (id: string) => listened.push(id),
    enableCommunityFeedback: () => participationCalls.push('enableCommunityFeedback'),
    enableCouncilWithPasscode: () => participationCalls.push('enableCouncilWithPasscode') > 0,
    enableWithPasscode: () => participationCalls.push('enableWithPasscode') > 0,
  }));
  mockModule(mock, sourcePath('stores/translatorReviewStore.ts'), {
    useTranslatorReviewStore: reviewStore,
  });

  // --- expo-av: one fake sound that records what the screen asks of it -------
  const soundCalls: string[] = [];
  const created: { source: unknown; status: unknown }[] = [];
  const playback: { onStatus: ((status: PlaybackStatus) => void) | null } = { onStatus: null };
  const sound: FakeSound = {
    playAsync: async () => void soundCalls.push('play'),
    pauseAsync: async () => void soundCalls.push('pause'),
    unloadAsync: async () => void soundCalls.push('unload'),
    setOnPlaybackStatusUpdate: (listener) => {
      playback.onStatus = listener;
    },
  };
  // Lets a test hand out its own sounds, or hold a load open, instead of the shared one.
  const sounds: { createOverride: (() => Promise<{ sound: FakeSound }>) | null } = {
    createOverride: null,
  };
  mockPackage(mock, 'expo-av', {
    Audio: {
      setAudioModeAsync: async () => {},
      Sound: {
        createAsync: async (source: unknown, status: unknown) => {
          created.push({ source, status });
          return sounds.createOverride ? sounds.createOverride() : { sound };
        },
      },
    },
  });

  // --- the feedback service: fetch, resolve, reopen, bulk review, audio URL --
  const responders = defaultResponders();
  const calls = {
    fetch: [] as Record<string, unknown>[],
    resolve: [] as Record<string, unknown>[],
    reopen: [] as Record<string, unknown>[],
    reviewPositive: [] as { input: Record<string, unknown>; ids: unknown }[],
    audioUrl: [] as Record<string, unknown>[],
  };
  mockBarrel(mock, 'services/feedback/index.ts', {
    provide: {
      fetchChapterFeedbackForTranslatorReview: (input: Record<string, unknown>) => {
        calls.fetch.push(input);
        return responders.fetch(input);
      },
      resolveTranslatorFeedbackOnServer: (input: Record<string, unknown>) => {
        calls.resolve.push(input);
        return responders.resolve(input);
      },
      reopenTranslatorFeedbackOnServer: (input: Record<string, unknown>) => {
        calls.reopen.push(input);
        return responders.reopen(input);
      },
      reviewPositiveFeedbackBatch: (input: Record<string, unknown>, ids?: string[]) => {
        calls.reviewPositive.push({ input, ids });
        return responders.reviewPositive({ ...input, ids });
      },
      refreshFeedbackAudioUrl: (input: Record<string, unknown>) => {
        calls.audioUrl.push(input);
        return responders.audioUrl(input);
      },
      TRANSLATION_NOT_COVERED: 'translation_not_covered',
    },
    real: [
      'getChapterReviewHeadline',
      'canSubmitResolution',
      'getResolutionChoices',
      'getResolutionLabelKey',
      'requiresResolutionNote',
      'formatVoiceNoteDuration',
      'getFeedbackOutcomeKey',
      'getFeedbackSourceKey',
    ],
  });
  // The constants barrel reads Expo config at import time.
  mockPackage(mock, 'expo-constants', { default: { expoConfig: { extra: {} } } });
  mockModule(mock, sourcePath('components/feedback/TranslationNotCoveredNotice.tsx'), {
    TranslationNotCoveredNotice: hostComponent('TranslationNotCoveredNotice'),
  });

  const goBacks: number[] = [];
  afterEach(() => {
    for (const list of [participationCalls, listened, soundCalls, created, goBacks]) {
      list.length = 0;
    }
    for (const list of Object.values(calls)) list.length = 0;
    Object.assign(responders, defaultResponders());
    reviewStore.setState(initialReviewState);
    playback.onStatus = null;
    sounds.createOverride = null;
  });

  async function renderReview() {
    const { ChapterFeedbackReviewScreen } = await import('./ChapterFeedbackReviewScreen');
    const props = {
      route: {
        key: 'r',
        name: 'ChapterFeedbackReview',
        params: { translationId: 'bsb', bookId: 'JHN', chapter: 3 },
      },
      navigation: { goBack: () => goBacks.push(1) },
    } as unknown as Parameters<typeof ChapterFeedbackReviewScreen>[0];
    const view = await harness.render(<ChapterFeedbackReviewScreen {...props} />);
    await view.flush();
    return view;
  }

  type View = Awaited<ReturnType<typeof renderReview>>;

  function visibleSheet(view: View) {
    const [sheet] = view.queryAllByType('Modal').filter((node) => node.props.visible);
    return sheet ? within(sheet) : null;
  }

  // A sound whose calls are recorded under its own name.
  function recordingSound(name: string): FakeSound {
    return {
      playAsync: async () => void soundCalls.push(`${name}:play`),
      pauseAsync: async () => void soundCalls.push(`${name}:pause`),
      unloadAsync: async () => void soundCalls.push(`${name}:unload`),
      setOnPlaybackStatusUpdate: () => {},
    };
  }

  // Holds every voice-note load open until the test releases it with a sound.
  function gateSoundLoads() {
    const pending: ((loaded: { sound: FakeSound }) => void)[] = [];
    const waiters: (() => void)[] = [];
    sounds.createOverride = () =>
      new Promise((resolveLoad) => {
        pending.push(resolveLoad);
        waiters.splice(0).forEach((wake) => wake());
      });
    return {
      loadsStarted: async (count: number) => {
        while (pending.length < count) {
          await new Promise<void>((wake) => waiters.push(wake));
        }
      },
      release: (index: number, loaded: FakeSound) => pending[index]({ sound: loaded }),
    };
  }

  const listenButton = (view: View, key: string) =>
    view.getByRole('button', { name: `${t(key)}, ${t('myFeedback.audioLabel')}` });

  return {
    harness,
    t,
    reviewStore,
    participationCalls,
    listened,
    soundCalls,
    created,
    playback,
    calls,
    responders,
    goBacks,
    renderReview,
    visibleSheet,
    recordingSound,
    gateSoundLoads,
    listenButton,
  };
}
