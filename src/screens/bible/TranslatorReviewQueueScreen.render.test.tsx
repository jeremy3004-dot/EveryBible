import test, { beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react-test-renderer';
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
type QueueResult = { success: boolean; chapters?: unknown[]; code?: string };
const backend = {
  offline: false,
  result: { success: true, chapters: [] } as QueueResult,
  // When set, a fetch waits for the test to settle it, per translation.
  gate: null as null | ((translationId: string) => Promise<QueueResult>),
};
mockModule(mock, sourcePath('utils/connectivity.ts'), {
  isDeviceOffline: async () => backend.offline,
});
mockBarrel(mock, 'services/feedback/index.ts', {
  real: ['getTranslatorFeedbackUnresolvedCount', 'sortTranslatorFeedbackQueue'],
  provide: {
    fetchChapterFeedbackReviewSummaryForTranslation: async ({
      translationId,
    }: {
      translationId: string;
    }) => (backend.gate ? backend.gate(translationId) : backend.result),
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
  backend.gate = null;
  useBibleStore.setState({ currentTranslation: 'bsb' });
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

test('the queue lists chapters needing review, most fixes first, and opens one in the reader', async () => {
  useTranslatorReviewStore.setState({ enabled: true, accessPasscode: '1234' });
  backend.result = {
    success: true,
    chapters: [
      { bookId: 'GEN', chapter: 1, total: 2, unresolvedDown: 0, unresolvedUp: 1 },
      { bookId: 'JHN', chapter: 3, total: 4, unresolvedDown: 2, unresolvedUp: 1 },
      { bookId: 'PSA', chapter: 23, total: 3, unresolvedDown: 0, unresolvedUp: 0 },
    ],
  };

  const view = await renderQueue();

  const rows = view
    .getAllByRole('button')
    .map((node) => node.props.accessibilityLabel as string)
    .filter((label) => label !== t('common.back'));
  assert.deepEqual(rows, [
    harness.i18n.t('translatorQueue.openLabel', { reference: 'John 3' }),
    harness.i18n.t('translatorQueue.openLabel', { reference: 'Genesis 1' }),
  ]);
  assert.ok(view.getByText(harness.i18n.t('translatorQueue.pendingCount', { count: 2 })));

  await view.press(view.getByRole('button', { name: rows[0] }));
  assert.deepEqual(
    harness.navigation.calls.map((call) => [call.method, ...call.args]),
    [['navigate', 'BibleReader', { bookId: 'JHN', chapter: 3, preferredMode: 'read' }]]
  );
});

test('with everything addressed the queue says so instead of a pending count', async () => {
  useTranslatorReviewStore.setState({ enabled: true, accessPasscode: '1234' });
  backend.result = {
    success: true,
    chapters: [{ bookId: 'PSA', chapter: 23, total: 3, unresolvedDown: 0, unresolvedUp: 0 }],
  };

  const view = await renderQueue();

  assert.ok(view.getByText(t('translatorQueue.empty')));
  assert.ok(view.getByText(t('translatorQueue.subtitle')));
});

const GENESIS = { bookId: 'GEN', chapter: 1, total: 2, unresolvedDown: 1, unresolvedUp: 0 };

async function pullToRefresh(view: Awaited<ReturnType<typeof renderQueue>>) {
  // The fake FlatList forwards its refreshControl element as a prop rather than rendering it.
  const list = view.root.findByType('FlatList' as never);
  const onRefresh = (list.props.refreshControl as { props: { onRefresh: () => Promise<void> } })
    .props.onRefresh;
  await act(async () => {
    await onRefresh();
  });
}

test('a failed refresh keeps the loaded chapters and tells the reader why', async () => {
  useTranslatorReviewStore.setState({ enabled: true, accessPasscode: '1234' });
  backend.result = { success: true, chapters: [GENESIS] };
  const view = await renderQueue();
  const row = harness.i18n.t('translatorQueue.openLabel', { reference: 'Genesis 1' });
  assert.ok(view.getByRole('button', { name: row }));

  backend.result = { success: false };
  await pullToRefresh(view);

  assert.ok(view.getByRole('button', { name: row }));
  assert.equal(view.queryByText(t('common.somethingWentWrong')), null);
  assert.deepEqual(
    harness.rn.__recorded.alerts.map((alert) => [alert.title, alert.message]),
    [[t('common.error'), t('common.somethingWentWrong')]]
  );
});

test('switching translation drops the previous queue while the new one loads', async () => {
  useTranslatorReviewStore.setState({ enabled: true, accessPasscode: '1234' });
  backend.result = { success: true, chapters: [GENESIS] };
  const view = await renderQueue();
  const row = harness.i18n.t('translatorQueue.openLabel', { reference: 'Genesis 1' });
  assert.ok(view.getByRole('button', { name: row }));

  let settleWeb!: (result: QueueResult) => void;
  backend.gate = () => new Promise<QueueResult>((resolve) => (settleWeb = resolve));
  await act(async () => useBibleStore.setState({ currentTranslation: 'web' }));
  await view.flush();

  assert.equal(view.queryByRole('button', { name: row }), null);
  assert.equal(view.queryByText(t('translatorQueue.empty')), null);

  await act(async () =>
    settleWeb({
      success: true,
      chapters: [{ bookId: 'JHN', chapter: 3, total: 1, unresolvedDown: 1, unresolvedUp: 0 }],
    })
  );
  assert.ok(
    view.getByRole('button', {
      name: harness.i18n.t('translatorQueue.openLabel', { reference: 'John 3' }),
    })
  );
});

test('a slow response for the previous translation never replaces the new queue', async () => {
  useTranslatorReviewStore.setState({ enabled: true, accessPasscode: '1234' });
  const settlers: Record<string, (result: QueueResult) => void> = {};
  backend.gate = (id) => new Promise<QueueResult>((resolve) => (settlers[id] = resolve));
  const { TranslatorReviewQueueScreen } = await import('./TranslatorReviewQueueScreen');
  const view = await harness.render(<TranslatorReviewQueueScreen />);
  await act(async () => useBibleStore.setState({ currentTranslation: 'web' }));
  await view.flush();

  await act(async () => settlers.web?.({ success: true, chapters: [] }));
  await act(async () => settlers.bsb?.({ success: true, chapters: [GENESIS] }));

  assert.equal(
    view.queryByRole('button', {
      name: harness.i18n.t('translatorQueue.openLabel', { reference: 'Genesis 1' }),
    }),
    null
  );
  assert.ok(view.getByText(t('translatorQueue.empty')));
});
