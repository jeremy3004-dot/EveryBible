import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { create } from 'zustand';
import type { ReactNode } from 'react';
import { installRenderHarness } from '../../testing/render';
import { mockModule, mockPackage, sourcePath } from '../../testing/mockModules';
import type {
  BibleStackParamList,
  MoreStackParamList,
  RootTabParamList,
} from '../../navigation/types';

const harness = installRenderHarness(mock);

const useBibleStore = create(() => ({
  translations: [{ id: 'bsb', abbreviation: 'BSB', isDownloaded: true }],
  currentTranslation: 'bsb',
}));
const useProgressStore = create(() => ({ streakDays: 0, chaptersRead: {} }));
const useAnnotationStore = create(() => ({ annotations: [] as unknown[] }));
mockModule(mock, sourcePath('stores/bibleStore.ts'), { useBibleStore });
mockModule(mock, sourcePath('stores/progressStore.ts'), { useProgressStore });
mockModule(mock, sourcePath('stores/annotationStore.ts'), { useAnnotationStore });

const authFlowModes: string[] = [];
mockModule(mock, sourcePath('navigation/rootNavigation.ts'), {
  rootNavigationRef: { isReady: () => false },
  openAuthFlow: (mode: string) => {
    authFlowModes.push(mode);
  },
});
mockModule(mock, 'expo-constants', { default: { expoConfig: { extra: {} } } });

// ProfileScreen's collaborators: only the guest branch is exercised here.
mockModule(mock, 'expo-image-picker', {
  launchImageLibraryAsync: async () => ({ canceled: true }),
});
mockModule(mock, sourcePath('services/auth/index.ts'), { updateUserProfile: async () => ({}) });
mockModule(mock, sourcePath('services/storage/storageService.ts'), {
  uploadAvatar: async () => ({}),
});
mockModule(mock, sourcePath('services/analytics/analyticsService.ts'), {
  getEngagementSummary: async () => ({ success: false }),
  refreshEngagement: async () => {},
});

// MoreStack: a stack whose screens only record the route names they register.
const registeredRoutes: string[] = [];
mockPackage(mock, '@react-navigation/native-stack', {
  createNativeStackNavigator: () => ({
    Navigator: ({ children }: { children: ReactNode }) => children,
    Screen: ({ name }: { name: string }) => {
      registeredRoutes.push(name);
      return null;
    },
  }),
});

const t = (key: string, options?: Record<string, unknown>) => harness.i18n.t(key, options);
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A row's accessibility name starts with its title and may add its value after a comma. */
const rowNamed = (title: string) => new RegExp(`^${escapeRegExp(title)}(,|$)`);

// The per-screen error boundary pulls in the crash logger's MMKV store; the fake
// Navigator never applies screenLayout anyway.
mockModule(mock, sourcePath('navigation/screenErrorLayout.ts'), {
  renderScreenWithErrorBoundary: ({ children }: { children: ReactNode }) => children,
});

afterEach(() => {
  authFlowModes.length = 0;
  registeredRoutes.length = 0;
});

async function renderMore() {
  const { MoreScreen } = await import('./MoreScreen');
  return harness.render(<MoreScreen />);
}

function signIn() {
  const signOutCalls: number[] = [];
  harness.authStore.setState({
    isAuthenticated: true,
    user: { uid: 'user-1', displayName: 'Ruth Moab', email: 'ruth@example.com', photoURL: null },
    preferencesUpdatedAt: null,
    signOut: async () => {
      signOutCalls.push(1);
    },
  });
  return signOutCalls;
}

test('the More menu lists profile and settings destinations, with no Saved Library entry', async () => {
  const view = await renderMore();
  const rowTitles = view
    .getAllByRole('button')
    .map((row) => String(row.props.accessibilityLabel).split(',')[0]);

  for (const key of [
    'more.profile',
    'more.readingActivity',
    'more.highlightsAndNotes',
    'more.translations',
    'settings.nationAndLanguage',
    'more.settings',
    'more.about',
  ]) {
    assert.ok(rowTitles.includes(t(key)), `${t(key)} row is listed`);
  }
  assert.equal(view.queryByText(/Saved Library/i), null);
  assert.equal(
    rowTitles.some((title) => /library/i.test(title)),
    false
  );
});

test('each More row opens its own screen in the More stack', async () => {
  const view = await renderMore();

  for (const [key, screen] of [
    ['more.profile', 'Profile'],
    ['more.readingActivity', 'ReadingActivity'],
    ['more.highlightsAndNotes', 'Annotations'],
    ['more.translations', 'TranslationBrowser'],
    ['settings.nationAndLanguage', 'LocalePreferences'],
    ['more.settings', 'Settings'],
    ['more.about', 'About'],
  ] as const) {
    await view.press(view.getByRole('button', { name: rowNamed(t(key)) }));
    assert.deepEqual(harness.navigation.calls.at(-1), { method: 'navigate', args: [screen] });
  }
});

test('a guest tapping the account card opens the shared auth flow in sign-in mode', async () => {
  const view = await renderMore();

  await view.press(view.getByRole('button', { name: t('more.guestUser') }));

  assert.deepEqual(authFlowModes, ['signIn']);
  assert.equal(
    harness.navigation.calls.some((call) => call.args[0] === 'Auth'),
    false,
    'the old split Auth route is not navigated to directly'
  );
  assert.equal(view.queryByRole('button', { name: t('more.signOut') }), null);
});

test('a signed-in account card opens the profile, and sign out asks before signing out', async () => {
  const signOutCalls = signIn();
  const view = await renderMore();

  await view.press(view.getByRole('button', { name: 'Ruth Moab' }));
  assert.deepEqual(harness.navigation.calls.at(-1), { method: 'navigate', args: ['Profile'] });
  assert.deepEqual(authFlowModes, []);

  await view.press(view.getByRole('button', { name: t('more.signOut') }));
  const [alert] = harness.rn.__recorded.alerts;
  assert.equal(alert.title, t('more.signOut'));
  assert.equal(signOutCalls.length, 0, 'nothing happens until the user confirms');
  const confirm = (alert.buttons as Array<{ style?: string; onPress?: () => Promise<void> }>).find(
    (button) => button.style === 'destructive'
  );
  await confirm?.onPress?.();
  assert.equal(signOutCalls.length, 1);
});

test('the Profile screen sign-in button opens the shared auth flow for guests', async () => {
  const { ProfileScreen } = await import('./ProfileScreen');
  const view = await harness.render(<ProfileScreen />);

  await view.press(view.getByRole('button', { name: t('more.signInOrCreate') }));

  assert.deepEqual(authFlowModes, ['signIn']);
  assert.equal(
    harness.navigation.calls.some((call) => call.args[0] === 'Auth'),
    false
  );
});

test('the More stack registers no Library screen and no navigator has a Library route', async () => {
  const { MoreStack } = await import('../../navigation/MoreStack');
  await harness.render(<MoreStack />);

  assert.ok(registeredRoutes.includes('Settings'), 'the stack registered its screens');
  assert.ok(registeredRoutes.includes('Auth'));
  assert.equal(registeredRoutes.includes('Library'), false);

  // Type-level contract, enforced by `npm run typecheck`: no navigator has a Library
  // route, so nothing (the Bible reader's chapter actions included) can open a saved
  // library hub without first reintroducing the route here.
  // @ts-expect-error 'Library' must not be a MoreStackParamList route.
  const retiredMoreRoute: keyof MoreStackParamList = 'Library';
  // @ts-expect-error 'Library' must not be a BibleStackParamList route.
  const retiredBibleRoute: keyof BibleStackParamList = 'Library';
  // @ts-expect-error 'Library' must not be a tab.
  const retiredTab: keyof RootTabParamList = 'Library';
  assert.deepEqual(
    [retiredMoreRoute, retiredBibleRoute, retiredTab],
    ['Library', 'Library', 'Library']
  );
});
