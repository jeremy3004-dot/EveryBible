import test, { beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockMmkvStorage, mockModule, sourcePath } from '../testing/mockModules';
import { createReactNativeStub } from '../testing/reactNativeStub';

// The boundary's render-time collaborators are replaced; the crash log is the
// real store over an in-memory MMKV, so the assertions read what a user would
// later see on the Diagnostics screen.
const mmkv = mockMmkvStorage(mock);
mockModule(mock, 'react-native', {
  ...createReactNativeStub(),
  View: 'View',
  Text: 'Text',
  TouchableOpacity: 'TouchableOpacity',
});
mockModule(mock, '@expo/vector-icons', { Ionicons: 'Ionicons' });
mockModule(mock, 'react-i18next', { useTranslation: () => ({ t: (key: string) => key }) });
mockModule(mock, sourcePath('contexts/ThemeContext.tsx'), {
  darkColors: {},
  useTheme: () => ({ colors: {} }),
});

// componentDidCatch also logs to the console; keep the test output readable.
mock.method(console, 'error', () => {});

beforeEach(() => {
  mmkv.store.clear();
});

test('a caught render error is written to the on-device crash log with its screen and component stack', async () => {
  const { ErrorBoundary } = await import('./ErrorBoundary');
  const { getCrashLogs } = await import('../services/diagnostics/crashLogStore');
  const boundary = new ErrorBoundary({ children: null, scope: 'screen:BibleReader' });

  const error = new Error('Cannot read property map of null');
  boundary.componentDidCatch(error, { componentStack: '\n    in VerseList\n    in BibleReader' });

  const [entry] = getCrashLogs();
  assert.equal(getCrashLogs().length, 1);
  assert.equal(entry.isFatal, false);
  assert.equal(entry.message, '[screen:BibleReader] Cannot read property map of null');
  assert.match(entry.stack ?? '', /Cannot read property map of null/);
  assert.match(entry.stack ?? '', /in VerseList\n\s+in BibleReader/);
});

test('an unscoped boundary records its errors as app-level', async () => {
  const { ErrorBoundary } = await import('./ErrorBoundary');
  const { getCrashLogs } = await import('../services/diagnostics/crashLogStore');
  const boundary = new ErrorBoundary({ children: null });

  boundary.componentDidCatch(new Error('boom'), { componentStack: null });

  assert.equal(getCrashLogs()[0]?.message, '[app] boom');
});

test('a thrown non-Error value is still recorded', async () => {
  const { ErrorBoundary } = await import('./ErrorBoundary');
  const { getCrashLogs } = await import('../services/diagnostics/crashLogStore');
  const boundary = new ErrorBoundary({ children: null, scope: 'screen:Home' });

  boundary.componentDidCatch('plain string' as unknown as Error, { componentStack: '' });

  assert.equal(getCrashLogs()[0]?.message, '[screen:Home] plain string');
});

test('a boundary given fallback={null} renders nothing after a crash instead of the full-screen fallback', async () => {
  const { ErrorBoundary } = await import('./ErrorBoundary');
  const boundary = new ErrorBoundary({
    children: 'effects',
    fallback: null,
    scope: 'runtime-effects',
  });

  boundary.state = ErrorBoundary.getDerivedStateFromError(new Error('hook threw'));

  assert.equal(boundary.render(), null);
});
