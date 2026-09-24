import test, { beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { create } from 'zustand';
import { mockBarrel, mockModule, sourcePath } from '../../testing/mockModules';
import { flattenStyle, installRenderHarness } from '../../testing/render';

const harness = installRenderHarness(mock);
const t = (key: string) => harness.i18n.t(key);

const useBibleStore = create(() => ({ currentTranslation: 'bsb' }));
mockModule(mock, sourcePath('stores/bibleStore.ts'), { useBibleStore });
// Review mode off: the queue loads nothing and shows its empty state.
const useTranslatorReviewStore = create(() => ({
  enabled: false,
  accessPasscode: null as string | null,
}));
mockModule(mock, sourcePath('stores/translatorReviewStore.ts'), { useTranslatorReviewStore });
// The queue lives only on the server.
const backend = {
  offline: false,
  result: { success: true, chapters: [] } as { success: boolean; chapters?: unknown[] },
};
mockModule(mock, sourcePath('utils/connectivity.ts'), {
  isDeviceOffline: async () => backend.offline,
});
mockBarrel(mock, 'services/feedback/index.ts', {
  real: ['getTranslatorFeedbackUnresolvedCount', 'sortTranslatorFeedbackQueue'],
  provide: {
    fetchChapterFeedbackReviewSummaryForTranslation: async () => backend.result,
    TRANSLATION_NOT_COVERED: 'translation_not_covered',
  },
});
mockBarrel(mock, 'components/feedback/index.ts', {
  provide: { TranslationNotCoveredNotice: () => null },
});
mockBarrel(mock, 'constants/index.ts', { real: ['getTranslatedBookName'] });

beforeEach(() => {
  backend.offline = false;
  backend.result = { success: true, chapters: [] };
  useTranslatorReviewStore.setState({ enabled: false, accessPasscode: null });
});

async function renderQueue() {
  const { TranslatorReviewQueueScreen } = await import('./TranslatorReviewQueueScreen');
  const view = await harness.render(<TranslatorReviewQueueScreen />);
  await view.flush();
  await view.flush();
  return view;
}

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

test('offline, a failed queue load says the reader is offline and keeps Retry', async () => {
  useTranslatorReviewStore.setState({ enabled: true, accessPasscode: '1234' });
  backend.result = { success: false };
  backend.offline = true;

  const view = await renderQueue();

  assert.ok(view.getByText(t('common.offlineTryAgain')));
  assert.equal(view.queryByText(t('common.somethingWentWrong')), null);
  assert.ok(view.getByRole('button', { name: t('common.retry') }));
});

test('online, a failed queue load keeps the generic error', async () => {
  useTranslatorReviewStore.setState({ enabled: true, accessPasscode: '1234' });
  backend.result = { success: false };

  const view = await renderQueue();

  assert.ok(view.getByText(t('common.somethingWentWrong')));
  assert.equal(view.queryByText(t('common.offlineTryAgain')), null);
});
