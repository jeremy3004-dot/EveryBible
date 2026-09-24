import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { create } from 'zustand';
import { flattenStyle, hostAncestors, installRenderHarness, within } from '../../testing/render';
import { mockBarrel, mockModule, mockPackage, sourcePath } from '../../testing/mockModules';
import type { ChapterFeedbackReviewItem } from '../../services/feedback/chapterFeedbackReviewService';

const harness = installRenderHarness(mock);
const t = (key: string, options?: Record<string, unknown>) => harness.i18n.t(key, options);

// Participation is switched in Settings only; the review screen must never call these.
const participationCalls: string[] = [];
const listened: string[] = [];
const reviewStore = create(() => ({
  enabled: true,
  accessPasscode: '123456' as string | null,
  markListened: (id: string) => listened.push(id),
  enableCommunityFeedback: () => participationCalls.push('enableCommunityFeedback'),
  enableCouncilWithPasscode: () => participationCalls.push('enableCouncilWithPasscode') > 0,
  enableWithPasscode: () => participationCalls.push('enableWithPasscode') > 0,
}));
mockModule(mock, sourcePath('stores/translatorReviewStore.ts'), {
  useTranslatorReviewStore: reviewStore,
});

// --- expo-av: one fake sound that records what the screen asks of it ---------
type PlaybackStatus = {
  isLoaded: boolean;
  didJustFinish?: boolean;
  positionMillis?: number;
  durationMillis?: number;
};
const soundCalls: string[] = [];
const created: { source: unknown; status: unknown }[] = [];
let onStatus: ((status: PlaybackStatus) => void) | null = null;
const sound = {
  playAsync: async () => void soundCalls.push('play'),
  pauseAsync: async () => void soundCalls.push('pause'),
  unloadAsync: async () => void soundCalls.push('unload'),
  setOnPlaybackStatusUpdate: (listener: (status: PlaybackStatus) => void) => {
    onStatus = listener;
  },
};
mockPackage(mock, 'expo-av', {
  Audio: {
    setAudioModeAsync: async () => {},
    Sound: {
      createAsync: async (source: unknown, status: unknown) => {
        created.push({ source, status });
        return { sound };
      },
    },
  },
});

// --- the feedback service: fetch, resolve, reopen, audio URL -----------------
const item = (overrides: Partial<ChapterFeedbackReviewItem>): ChapterFeedbackReviewItem => ({
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
const concern = item({
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
const praise = item({ id: 'p1', sentiment: 'up', comment: 'Reads clearly' });
const settled = item({
  id: 's1',
  comment: 'Old concern',
  resolution: 'fixed',
  resolvedAt: '2026-09-02T12:00:00Z',
  resolutionNote: 'Spelling corrected',
});

const fetchCalls: unknown[] = [];
const resolveCalls: unknown[] = [];
const reopenCalls: unknown[] = [];
const audioUrlCalls: unknown[] = [];
mockBarrel(mock, 'services/feedback/index.ts', {
  provide: {
    fetchChapterFeedbackForTranslatorReview: async (input: unknown) => {
      fetchCalls.push(input);
      return {
        success: true,
        feedback: [concern, praise, settled],
        summary: {
          bookId: 'JHN',
          chapter: 3,
          total: 3,
          unresolvedDown: 1,
          unresolvedUp: 1,
        },
        positiveCount: 0,
        nextCursor: null,
      };
    },
    resolveTranslatorFeedbackOnServer: async (input: unknown) => {
      resolveCalls.push(input);
      return { success: true };
    },
    reopenTranslatorFeedbackOnServer: async (input: unknown) => {
      reopenCalls.push(input);
      return { success: true };
    },
    reviewPositiveFeedbackBatch: async () => ({ success: true, feedbackIds: [] }),
    refreshFeedbackAudioUrl: async (input: unknown) => {
      audioUrlCalls.push(input);
      return { success: true, playbackUrl: 'https://media.test/c1.m4a' };
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
  TranslationNotCoveredNotice: () => null,
});

afterEach(() => {
  for (const list of [
    participationCalls,
    listened,
    soundCalls,
    created,
    fetchCalls,
    resolveCalls,
    reopenCalls,
    audioUrlCalls,
  ]) {
    list.length = 0;
  }
  onStatus = null;
});

const passcodeArgs = { apiVersion: 2, passcode: '123456', translationId: 'bsb' };

async function renderReview() {
  const { ChapterFeedbackReviewScreen } = await import('./ChapterFeedbackReviewScreen');
  const props = {
    route: {
      key: 'r',
      name: 'ChapterFeedbackReview',
      params: { translationId: 'bsb', bookId: 'JHN', chapter: 3 },
    },
    navigation: { goBack: () => {} },
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

test('the review lists the chapter feedback the server returns for this translation', async () => {
  const view = await renderReview();

  assert.deepEqual(fetchCalls, [
    {
      apiVersion: 2,
      translationId: 'bsb',
      bookId: 'JHN',
      chapter: 3,
      passcode: '123456',
      category: 'all',
      status: 'pending',
      positiveOnly: false,
      cursor: null,
    },
  ]);
  assert.ok(view.getByRole('header', { name: 'John 3' }));
  assert.ok(view.getByText(t('feedback.openCount', { count: 2 })));
  for (const comment of ['The name is misspelled', 'Reads clearly', 'Old concern']) {
    assert.ok(view.getByText(comment));
  }
});

test('the list is for reading, with no review walkthrough to start', async () => {
  const view = await renderReview();

  assert.equal(view.queryByText('Start review'), null);
  assert.equal(visibleSheet(view), null);
});

test('each source label may wrap under its verdict instead of truncating beside it', async () => {
  const view = await renderReview();

  const verdicts = [
    ...view.queryAllByText(t('bible.chapterFeedbackThumbsUp')),
    ...view.queryAllByText(t('bible.chapterFeedbackThumbsDown')),
  ];
  assert.ok(verdicts.length > 0);
  for (const verdict of verdicts) {
    const row = hostAncestors(verdict)[1];
    assert.equal(flattenStyle(row.props.style)?.flexWrap, 'wrap');
    const [, source] = within(row).queryAllByType('Text');
    assert.equal(source.props.numberOfLines, 2);
  }
});

test('a concern is marked addressed from its card with a written reason, saved on the server', async () => {
  const view = await renderReview();
  await view.press(view.getByRole('button', { name: t('feedback.markAddressed') }));
  const sheet = visibleSheet(view);
  assert.ok(sheet, 'the reason sheet is open');

  assert.ok(sheet.getByText('The name is misspelled'));
  // A concern cannot be settled without saying why.
  const confirm = () => sheet.getByRole('button', { name: t('feedback.markAddressed') });
  assert.ok(sheet.getByRole('button', { name: t('feedback.markAddressed'), disabled: true }));
  await view.press(confirm());
  assert.deepEqual(resolveCalls, []);

  await view.changeText(sheet.getByLabelText(t('feedback.explanation')), 'Fixed the spelling');
  await view.press(confirm());
  await view.flush();

  assert.deepEqual(resolveCalls, [
    { ...passcodeArgs, feedbackId: 'c1', resolution: 'fixed', note: 'Fixed the spelling' },
  ]);
  assert.equal(visibleSheet(view), null, 'the sheet closes once saved');
  assert.deepEqual(reopenCalls, []);
});

test('No change needed on a concern also asks for the reason before saving', async () => {
  const view = await renderReview();
  await view.press(view.getByRole('button', { name: t('feedback.noChange') }));
  const sheet = visibleSheet(view);
  assert.ok(sheet, 'the reason sheet is open');

  await view.changeText(sheet.getByLabelText(t('feedback.explanation')), 'Spelling is standard');
  await view.press(sheet.getByRole('button', { name: t('feedback.noChange') }));
  await view.flush();

  assert.deepEqual(resolveCalls, [
    {
      ...passcodeArgs,
      feedbackId: 'c1',
      resolution: 'no_change_needed',
      note: 'Spelling is standard',
    },
  ]);
});

test('praise is settled straight from its card with Mark reviewed', async () => {
  const view = await renderReview();
  await view.press(view.getByRole('button', { name: t('feedback.markReviewed') }));
  await view.flush();

  assert.equal(visibleSheet(view), null, 'praise needs no reason');
  assert.deepEqual(resolveCalls, [
    { ...passcodeArgs, feedbackId: 'p1', resolution: 'no_change_needed', note: '' },
  ]);
});

test('no control claims the chapter is accurate', async () => {
  const view = await renderReview();
  await view.press(view.getByRole('button', { name: t('feedback.markAddressed') }));
  const sheet = visibleSheet(view);
  assert.ok(sheet);

  for (const scope of [view, sheet]) {
    assert.equal(scope.queryByText(t('bible.translatorReviewConfirmAccurate')), null);
    assert.equal(scope.queryByText(t('bible.translatorReviewConfirmedAccurate')), null);
  }
});

test('Reopen on settled feedback reopens it on the server instead of resolving it', async () => {
  const view = await renderReview();
  await view.press(view.getByRole('button', { name: t('bible.translatorReviewReopen') }));
  await view.flush();

  assert.deepEqual(reopenCalls, [{ ...passcodeArgs, feedbackId: 's1' }]);
  assert.deepEqual(resolveCalls, []);
});

test('the review screen offers no way to switch feedback participation', async () => {
  const view = await renderReview();
  await view.press(view.getByRole('button', { name: t('feedback.markAddressed') }));
  const sheet = visibleSheet(view);
  assert.ok(sheet);

  for (const scope of [view, sheet]) {
    assert.deepEqual(scope.queryAllByType('Switch'), []);
    assert.equal(scope.queryByText(t('settings.translatorAccessUnlock')), null);
    const inputs = scope.queryAllByType('TextInput');
    assert.ok(
      inputs.every((node) => node.props.placeholder !== t('settings.translatorAccessPlaceholder')),
      'no passcode field'
    );
  }
  assert.deepEqual(participationCalls, []);
});

test('review audio has named play and pause buttons and marks the item listened', async () => {
  const view = await renderReview();
  const audioButton = (key: string) =>
    view.getByRole('button', { name: `${t(key)}, ${t('myFeedback.audioLabel')}` });

  await view.press(audioButton('bible.translatorReviewListen'));
  await view.flush();
  assert.deepEqual(audioUrlCalls.length, 1);
  assert.equal((audioUrlCalls[0] as { feedbackId: string }).feedbackId, 'c1');
  assert.deepEqual(created, [
    { source: { uri: 'https://media.test/c1.m4a' }, status: { shouldPlay: true } },
  ]);

  await view.press(audioButton('bible.translatorReviewPause'));
  await view.flush();
  assert.deepEqual(soundCalls, ['pause']);

  await view.press(audioButton('bible.translatorReviewListen'));
  await view.flush();
  assert.deepEqual(soundCalls, ['pause', 'play']);

  assert.deepEqual(listened, []);
  onStatus?.({ isLoaded: true, positionMillis: 8000, durationMillis: 12000 });
  assert.deepEqual(listened, ['c1']);
});
