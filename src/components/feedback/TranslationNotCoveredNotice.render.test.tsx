import test, { beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { create } from 'zustand';
import { mockBarrel, mockModule, sourcePath } from '../../testing/mockModules';
import { installRenderHarness } from '../../testing/render';

const harness = installRenderHarness(mock, { os: 'ios' });
const t = (key: string, options?: Record<string, unknown>) => harness.i18n.t(key, options);

// The real store refuses to switch to a translation whose text is not on the
// device; `openable` stands in for that rule.
const openable = new Set<string>();
const useBibleStore = create<{
  currentTranslation: string;
  translations: { id: string; name: string }[];
  setCurrentTranslation: (id: string) => void;
}>()((set) => ({
  currentTranslation: 'npi',
  translations: [
    { id: 'npi', name: ' Nepali Bible ' },
    { id: 'hin', name: 'Hindi Bible' },
    { id: 'mai', name: '' },
  ],
  setCurrentTranslation: (id) => {
    if (openable.has(id)) set({ currentTranslation: id });
  },
}));
mockModule(mock, sourcePath('stores/bibleStore.ts'), { useBibleStore });
mockBarrel(mock, 'services/feedback/index.ts', { real: ['resolveTranslatorCoverageOptions'] });

beforeEach(() => {
  openable.clear();
  useBibleStore.setState({ currentTranslation: 'npi' });
});

async function renderNotice(props: {
  coveredTranslationIds: string[] | undefined;
  onRetry?: () => void;
  onSwitched?: (id: string) => void;
}) {
  const { TranslationNotCoveredNotice } = await import('./TranslationNotCoveredNotice');
  return harness.render(<TranslationNotCoveredNotice translationId="npi" {...props} />);
}

test('the notice names the translation on screen that the code does not open', async () => {
  const view = await renderNotice({ coveredTranslationIds: [] });

  assert.ok(
    view.getByRole('header', {
      name: t('translatorQueue.notCoveredTitle', { translation: 'Nepali Bible' }),
    })
  );
  assert.ok(view.getByText(t('translatorQueue.notCoveredNone')));
});

test('when the covered list could not be fetched it offers a retry, or nothing without one', async () => {
  let retries = 0;
  const view = await renderNotice({
    coveredTranslationIds: undefined,
    onRetry: () => {
      retries += 1;
    },
  });

  await view.press(view.getByRole('button', { name: t('common.retry') }));
  assert.equal(retries, 1);
  assert.equal(view.queryByText(t('translatorQueue.notCoveredNone')), null);

  const withoutRetry = await renderNotice({ coveredTranslationIds: undefined });
  assert.equal(withoutRetry.queryByRole('button', { name: t('common.retry') }), null);
});

test('each covered translation is offered once by name, falling back to its id', async () => {
  const view = await renderNotice({ coveredTranslationIds: ['hin', 'npi', 'mai', 'hin'] });

  assert.ok(view.getByText(t('translatorQueue.notCoveredBody')));
  const labels = view
    .getAllByRole('button')
    .map((button) => button.props.accessibilityLabel as string);
  assert.deepEqual(labels, [
    t('translatorQueue.switchTo', { translation: 'Hindi Bible' }),
    t('translatorQueue.switchTo', { translation: 'mai' }),
  ]);
});

test('switching to an installed covered translation changes the reader and reports it', async () => {
  openable.add('hin');
  const switched: string[] = [];
  const view = await renderNotice({
    coveredTranslationIds: ['hin'],
    onSwitched: (id) => switched.push(id),
  });

  await view.press(
    view.getByRole('button', {
      name: t('translatorQueue.switchTo', { translation: 'Hindi Bible' }),
    })
  );

  assert.equal(useBibleStore.getState().currentTranslation, 'hin');
  assert.deepEqual(switched, ['hin']);
  assert.equal(
    view.queryByText(t('translatorQueue.switchNeedsDownload', { translation: 'Hindi Bible' })),
    null
  );
});

test('a covered translation that is not downloaded says so instead of pretending to switch', async () => {
  const switched: string[] = [];
  const view = await renderNotice({
    coveredTranslationIds: ['hin'],
    onSwitched: (id) => switched.push(id),
  });

  await view.press(
    view.getByRole('button', {
      name: t('translatorQueue.switchTo', { translation: 'Hindi Bible' }),
    })
  );

  const message = t('translatorQueue.switchNeedsDownload', { translation: 'Hindi Bible' });
  assert.equal(useBibleStore.getState().currentTranslation, 'npi');
  assert.deepEqual(switched, []);
  assert.ok(view.getByText(message));
  // VoiceOver ignores the live region, so iOS announces the message too.
  assert.deepEqual(harness.rn.__recorded.announcements, [message]);
});
