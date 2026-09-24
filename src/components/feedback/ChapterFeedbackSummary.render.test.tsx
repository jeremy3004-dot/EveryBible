import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { create } from 'zustand';
import { installRenderHarness } from '../../testing/render';
import { mockBarrel, mockModule, sourcePath } from '../../testing/mockModules';

const harness = installRenderHarness(mock);
const t = (key: string, options?: Record<string, unknown>) => harness.i18n.t(key, options);

const reviewStore = create(() => ({
  enabled: false,
  accessPasscode: null as string | null,
}));
mockModule(mock, sourcePath('stores/translatorReviewStore.ts'), {
  useTranslatorReviewStore: reviewStore,
});

type SummaryResult = {
  success: boolean;
  code?: string;
  coveredTranslationIds?: string[];
  chapters: {
    chapter: number;
    total: number;
    unresolvedDown: number;
    unresolvedUp: number;
    community?: number;
    council?: number;
  }[];
};
const summaryCalls: unknown[] = [];
let summaryResult: SummaryResult = { success: true, chapters: [] };
mockBarrel(mock, 'services/feedback/index.ts', {
  provide: {
    fetchChapterFeedbackReviewSummaryForTranslation: async (input: unknown) => {
      summaryCalls.push(input);
      return summaryResult;
    },
    TRANSLATION_NOT_COVERED: 'translation_not_covered',
  },
});
mockModule(mock, sourcePath('components/feedback/TranslationNotCoveredNotice.tsx'), {
  TranslationNotCoveredNotice: () => null,
});

afterEach(() => {
  reviewStore.setState({ enabled: false, accessPasscode: null });
  summaryCalls.length = 0;
  summaryResult = { success: true, chapters: [] };
});

async function renderSummary() {
  const { ChapterFeedbackSummary } = await import('./ChapterFeedbackSummary');
  const view = await harness.render(
    <ChapterFeedbackSummary translationId="bsb" bookId="JHN" chapter={3} />
  );
  await view.flush();
  return view;
}

test('renders nothing and fetches nothing while translator review is off', async () => {
  const view = await renderSummary();

  assert.equal(view.queryByText(t('feedback.title')), null);
  assert.equal(view.queryByText(t('feedback.reviewFeedback')), null);
  assert.deepEqual(summaryCalls, []);
});

test('when enabled it shows the server summary for this chapter of the translation', async () => {
  reviewStore.setState({ enabled: true, accessPasscode: '123456' });
  summaryResult = {
    success: true,
    chapters: [
      { chapter: 2, total: 9, unresolvedDown: 9, unresolvedUp: 0 },
      { chapter: 3, total: 5, unresolvedDown: 2, unresolvedUp: 1, community: 4, council: 1 },
    ],
  };
  const view = await renderSummary();

  assert.deepEqual(summaryCalls, [{ translationId: 'bsb', bookId: 'JHN', passcode: '123456' }]);
  assert.ok(view.getByRole('header', { name: t('feedback.title') }));
  assert.ok(view.getByText(t('bible.translatorReviewSummary', { count: 5, pending: 3 })));
});

test('its entry opens the dedicated review for the same translation and chapter', async () => {
  reviewStore.setState({ enabled: true, accessPasscode: '123456' });
  const view = await renderSummary();

  assert.ok(view.getByText(t('bible.translatorReviewEmpty')));
  await view.press(view.getByRole('button', { name: t('feedback.reviewFeedback') }));
  assert.deepEqual(harness.navigation.calls, [
    {
      method: 'navigate',
      args: ['ChapterFeedbackReview', { translationId: 'bsb', bookId: 'JHN', chapter: 3 }],
    },
  ]);
});
