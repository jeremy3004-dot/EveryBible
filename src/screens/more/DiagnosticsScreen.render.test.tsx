import test, { afterEach, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react-test-renderer';
import { mockMmkvStorage } from '../../testing/mockModules';
import { installRenderHarness } from '../../testing/render';

const harness = installRenderHarness(mock);
const t = (key: string) => harness.i18n.t(key);
// The real on-device crash log, backed by in-memory MMKV.
const mmkv = mockMmkvStorage(mock).store;
const CRASH_LOG_KEY = 'diagnostics-crash-log';

interface AlertButton {
  text: string;
  style?: string;
  onPress?: () => void;
}

const realShare = harness.rn.Share.share;

beforeEach(() => {
  mmkv.clear();
});

afterEach(() => {
  harness.rn.Share.share = realShare;
});

function seedLogs(entries: unknown[]) {
  mmkv.set(CRASH_LOG_KEY, JSON.stringify(entries));
}

async function renderScreen() {
  const { DiagnosticsScreen } = await import('./DiagnosticsScreen');
  const view = await harness.render(<DiagnosticsScreen />);
  await view.flush();
  return view;
}

test('with no logs it says so and offers neither share nor clear', async () => {
  const view = await renderScreen();

  assert.ok(view.getByText(t('settings.diagnostics.emptyTitle')));
  assert.equal(view.queryByText(t('interface.share')), null);
  assert.equal(view.queryByText(t('settings.diagnostics.clear')), null);
});

test('logs are listed newest first, fatal ones badged as fatal, with a stack preview', async () => {
  seedLogs([
    { message: 'Older handled error', isFatal: false, timestamp: Date.UTC(2026, 8, 1) },
    {
      message: 'Newest crash',
      isFatal: true,
      timestamp: Date.UTC(2026, 8, 2),
      stack: ['Error: Newest crash', ...Array.from({ length: 10 }, (_, i) => `  at f${i}`)].join(
        '\n'
      ),
    },
  ]);

  const view = await renderScreen();

  const messages = view
    .getAllByText(/Newest crash|Older handled error/)
    .map((node) => node.props.children as string)
    .filter((text) => !text.includes('\n'));
  assert.deepEqual(messages, ['Newest crash', 'Older handled error']);
  assert.ok(view.getByText(t('settings.diagnostics.badgeFatal')));
  assert.ok(view.getByText(t('settings.diagnostics.badgeError')));
  // The preview keeps the first six stack lines only.
  const preview = view.getByText(/^Error: Newest crash\n/);
  assert.equal((preview.props.children as string).split('\n').length, 6);
});

test('a malformed stored row is dropped instead of breaking the screen', async () => {
  seedLogs([
    { message: 'Readable', isFatal: false, timestamp: Date.UTC(2026, 8, 1) },
    { message: 'Unrenderable date', isFatal: false, timestamp: 9e15 },
    'not an entry',
  ]);

  const view = await renderScreen();

  assert.ok(view.getByText('Readable'));
  assert.equal(view.queryByText('Unrenderable date'), null);
});

test('share exports every log with its UTC timestamp, kind and stack', async () => {
  seedLogs([
    { message: 'Handled', isFatal: false, timestamp: Date.UTC(2026, 8, 1, 12) },
    { message: 'Boom', isFatal: true, timestamp: Date.UTC(2026, 8, 2, 8), stack: 'at root' },
  ]);
  const view = await renderScreen();

  await view.press(view.getByText(t('interface.share')));

  assert.deepEqual(harness.rn.__recorded.shares, [
    {
      message: [
        t('settings.diagnostics.exportHeader'),
        '',
        '[2026-09-02T08:00:00.000Z] FATAL: Boom\nat root',
        '',
        '[2026-09-01T12:00:00.000Z] ERROR: Handled',
      ].join('\n'),
    },
  ]);
});

test('a failed share tells the user the export failed', async () => {
  seedLogs([{ message: 'Handled', isFatal: false, timestamp: Date.UTC(2026, 8, 1) }]);
  harness.rn.Share.share = async () => {
    throw new Error('share sheet unavailable');
  };
  const view = await renderScreen();

  await view.press(view.getByText(t('interface.share')));
  await view.flush();

  assert.deepEqual(
    harness.rn.__recorded.alerts.map(({ title, message }) => ({ title, message })),
    [{ title: t('common.error'), message: t('settings.diagnostics.exportError') }]
  );
});

test('clearing asks first and deletes the logs only once confirmed', async () => {
  seedLogs([{ message: 'Handled', isFatal: false, timestamp: Date.UTC(2026, 8, 1) }]);
  const view = await renderScreen();

  await view.press(view.getByText(t('settings.diagnostics.clear')));
  const [confirm] = harness.rn.__recorded.alerts;
  assert.equal(confirm.title, t('settings.diagnostics.clearTitle'));
  const buttons = confirm.buttons as AlertButton[];
  assert.deepEqual(
    buttons.map((button) => button.style),
    ['cancel', 'destructive']
  );
  assert.ok(view.getByText('Handled'));
  assert.ok(mmkv.has(CRASH_LOG_KEY));

  await act(async () => {
    buttons[1].onPress?.();
  });

  assert.equal(view.queryByText('Handled'), null);
  assert.ok(view.getByText(t('settings.diagnostics.emptyTitle')));
  assert.equal(mmkv.has(CRASH_LOG_KEY), false);
});

// Builds before the on-device log was scrubbed stored messages and stacks as thrown. Those
// rows survive the app update, so the screen and the export must scrub them on the way out.
test('logs stored unscrubbed by an older build are shown and shared without emails or tokens', async () => {
  const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEifQ.c2lnbmF0dXJlLXZhbHVl';
  seedLogs([
    {
      message: 'Sync failed for reader@example.com with Bearer abc123secret',
      isFatal: true,
      timestamp: Date.UTC(2026, 8, 2, 8),
      stack: `Error: Sync failed\n  at fetch (https://x.supabase.co/rest/v1/profiles?access_token=${jwt})`,
    },
  ]);
  const view = await renderScreen();

  await view.press(view.getByText(t('interface.share')));

  const [shared] = harness.rn.__recorded.shares as { message: string }[];
  assert.ok(shared, 'the log was shared');
  for (const secret of ['reader@example.com', 'abc123secret', jwt]) {
    assert.equal(shared.message.includes(secret), false, `export leaks ${secret}`);
    assert.equal(view.queryAllByText(new RegExp(secret.replace(/\./g, '\\.'))).length, 0);
  }
  assert.ok(shared.message.includes('FATAL: Sync failed for <email> with Bearer <token>'));
});
