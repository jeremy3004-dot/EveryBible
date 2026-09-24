import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { create } from 'zustand';
import { mockBarrel, mockModule, sourcePath } from '../../testing/mockModules';
import { flattenStyle, installRenderHarness } from '../../testing/render';

const harness = installRenderHarness(mock);
const t = (key: string) => harness.i18n.t(key);

const useBibleStore = create(() => ({ currentTranslation: 'bsb' }));
mockModule(mock, sourcePath('stores/bibleStore.ts'), { useBibleStore });
// Review mode off: the queue loads nothing and shows its empty state.
const useTranslatorReviewStore = create(() => ({ enabled: false, accessPasscode: null }));
mockModule(mock, sourcePath('stores/translatorReviewStore.ts'), { useTranslatorReviewStore });
mockBarrel(mock, 'services/feedback/index.ts', {
  real: ['getTranslatorFeedbackUnresolvedCount', 'sortTranslatorFeedbackQueue'],
  provide: {
    fetchChapterFeedbackReviewSummaryForTranslation: async () => ({ success: true, chapters: [] }),
    TRANSLATION_NOT_COVERED: 'translation_not_covered',
  },
});
mockBarrel(mock, 'components/feedback/index.ts', {
  provide: { TranslationNotCoveredNotice: () => null },
});
mockBarrel(mock, 'constants/index.ts', { real: ['getTranslatedBookName'] });

test('the queue title shrinks and centres between Back and the spacer instead of overflowing', async () => {
  const { TranslatorReviewQueueScreen } = await import('./TranslatorReviewQueueScreen');
  const view = await harness.render(<TranslatorReviewQueueScreen />);
  await view.flush();

  const title = view.getByRole('header', { name: t('translatorQueue.title') });
  const style = flattenStyle(title.props.style) ?? {};
  assert.equal(style.flexShrink, 1);
  assert.equal(style.textAlign, 'center');
  assert.ok(view.getByText(t('translatorQueue.empty')));
});
