import test, { beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockBarrel, mockModule, sourcePath } from '../../testing/mockModules';
import { installRenderHarness } from '../../testing/render';

const harness = installRenderHarness(mock);
const t = (key: string) => harness.i18n.t(key);

// My feedback lists the reader's own submissions from the server; it has no local copy.
const backend = {
  offline: false,
  result: { success: false, feedback: [] as unknown[], error: 'Failed to fetch' } as {
    success: boolean;
    feedback: unknown[];
    error?: string;
  },
};
mockBarrel(mock, 'services/feedback/index.ts', {
  provide: { fetchMyChapterFeedback: async () => backend.result },
});
mockModule(mock, sourcePath('utils/connectivity.ts'), {
  isDeviceOffline: async () => backend.offline,
});
mockBarrel(mock, 'constants/index.ts', { real: ['getTranslatedBookName'] });

beforeEach(() => {
  backend.offline = false;
  backend.result = { success: false, feedback: [], error: 'Failed to fetch' };
  harness.authStore.setState({ isAuthenticated: true });
});

async function renderScreen() {
  const { MyFeedbackScreen } = await import('./MyFeedbackScreen');
  const view = await harness.render(<MyFeedbackScreen />);
  await view.flush();
  return view;
}

test('offline, a failed load says the reader is offline instead of "something went wrong"', async () => {
  backend.offline = true;

  const view = await renderScreen();

  assert.ok(view.getByText(t('common.offlineTryAgain')));
  assert.equal(view.queryByText(t('common.somethingWentWrong')), null);
  assert.ok(view.getByRole('button', { name: t('common.retry') }));
});

test('online, a failed load keeps the generic error with a retry', async () => {
  const view = await renderScreen();

  assert.ok(view.getByText(t('common.somethingWentWrong')));
  assert.equal(view.queryByText(t('common.offlineTryAgain')), null);
});

test('retrying after reconnecting shows the loaded feedback', async () => {
  backend.offline = true;
  const view = await renderScreen();
  backend.offline = false;
  backend.result = {
    success: true,
    feedback: [
      {
        id: 'f1',
        bookId: 'JHN',
        chapter: 3,
        sentiment: 'up',
        status: 'received',
        comment: 'Clear',
        resolutionNote: null,
        hasAudio: false,
        createdAt: '2026-09-20T10:00:00.000Z',
      },
    ],
  };

  await view.press(view.getByRole('button', { name: t('common.retry') }));
  await view.flush();

  assert.equal(view.queryByText(t('common.offlineTryAgain')), null);
  assert.ok(view.getByText('Clear'));
});
