import test, { beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react-test-renderer';
import { create } from 'zustand';
import { mockModule, mockPackage, sourcePath } from '../../testing/mockModules';
import { installRenderHarness } from '../../testing/render';
import type { UserEngagementSummary } from '../../services/supabase/types';
import { isPrivacyLockGraceActive } from '../../services/privacy/privacyLockGrace';

const harness = installRenderHarness(mock);
const t = (key: string) => harness.i18n.t(key);

const useProgressStore = create(() => ({
  chaptersRead: { 'JHN:1': 1, 'JHN:2': 1, 'JHN:3': 1 } as Record<string, number>,
  streakDays: 4,
  listeningMsByDate: {} as Record<string, number>,
}));
mockModule(mock, sourcePath('stores/progressStore.ts'), {
  useProgressStore,
  selectCurrentStreakDays: (state: { streakDays: number }) => state.streakDays,
});

const authFlows: string[] = [];
mockModule(mock, sourcePath('navigation/rootNavigation.ts'), {
  rootNavigationRef: { isReady: () => false },
  openAuthFlow: (mode: string) => {
    authFlows.push(mode);
  },
});

type PickerResult = { canceled: boolean; assets: { uri: string }[] };
type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void };
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const picker = {
  result: { canceled: true, assets: [] } as PickerResult,
  launches: 0,
  launchesUnderLockGrace: [] as boolean[],
  // Holds the picker open until the test resolves it.
  open: null as Deferred<PickerResult> | null,
  throws: false,
};
mockPackage(mock, 'expo-image-picker', {
  launchImageLibraryAsync: async () => {
    picker.launches += 1;
    picker.launchesUnderLockGrace.push(isPrivacyLockGraceActive());
    if (picker.throws) throw new Error('ERR_MISSING_ACTIVITY');
    if (picker.open) return picker.open.promise;
    return picker.result;
  },
});

const backend = {
  upload: null as Deferred<{ success: boolean; data?: string; error?: string }> | null,
  uploadResult: { success: true, data: 'https://cdn.test/avatar-new.jpg' } as {
    success: boolean;
    data?: string;
    error?: string;
  },
  uploadThrows: false,
  uploadedUris: [] as string[],
  updateResult: { success: true, user: undefined } as { success: boolean; user?: unknown },
  profileUpdates: [] as unknown[],
  engagement: { success: false } as { success: boolean; data?: UserEngagementSummary },
  refreshes: 0,
};
mockModule(mock, sourcePath('services/auth/index.ts'), {
  updateUserProfile: async (attributes: unknown) => {
    backend.profileUpdates.push(attributes);
    return backend.updateResult;
  },
});
mockModule(mock, sourcePath('services/storage/storageService.ts'), {
  uploadAvatar: async (uri: string) => {
    backend.uploadedUris.push(uri);
    if (backend.uploadThrows) throw new Error('network down');
    if (backend.upload) return backend.upload.promise;
    return backend.uploadResult;
  },
});
mockModule(mock, sourcePath('services/analytics/analyticsService.ts'), {
  refreshEngagement: async () => {
    backend.refreshes += 1;
  },
  getEngagementSummary: async () => backend.engagement,
});

const signedInUser = {
  uid: 'u1',
  email: 'reader@example.com',
  displayName: 'Ruth Reader',
  photoURL: 'https://cdn.test/avatar-old.jpg',
};

beforeEach(() => {
  useProgressStore.setState({ listeningMsByDate: {} });
  authFlows.length = 0;
  picker.result = { canceled: true, assets: [] };
  picker.launches = 0;
  picker.launchesUnderLockGrace = [];
  picker.open = null;
  picker.throws = false;
  backend.upload = null;
  backend.uploadResult = { success: true, data: 'https://cdn.test/avatar-new.jpg' };
  backend.uploadThrows = false;
  backend.uploadedUris = [];
  backend.updateResult = { success: true, user: undefined };
  backend.profileUpdates = [];
  backend.engagement = { success: false };
  backend.refreshes = 0;
  harness.authStore.setState({ user: null, isAuthenticated: false });
});

function signIn() {
  harness.authStore.setState({ user: { ...signedInUser }, isAuthenticated: true });
}

async function renderScreen() {
  const { ProfileScreen } = await import('./ProfileScreen');
  const view = await harness.render(<ProfileScreen />);
  await view.flush();
  return view;
}

const avatarImageUri = (view: Awaited<ReturnType<typeof renderScreen>>) => {
  const [image] = view.queryAllByType('Image');
  return image ? (image.props.source as { uri: string }).uri : null;
};

test('a guest sees their local stats, cannot change an avatar, and can start sign in', async () => {
  const view = await renderScreen();

  assert.ok(view.getByText(t('more.guestUser')));
  assert.ok(view.getByText('3'));
  assert.ok(view.getByText('4'));
  assert.ok(view.getByRole('button', { name: t('profile.changeAvatar'), disabled: true }));
  assert.equal(backend.refreshes, 0, 'no engagement request is made for a guest');

  await view.press(view.getByRole('button', { name: t('more.signInOrCreate') }));
  assert.deepEqual(authFlows, ['signIn']);
});

// Email sign-up stores no display name, so every email account has none.
for (const displayName of [null, '   ']) {
  test(`a signed-in reader with no display name (${JSON.stringify(displayName)}) is named by their email, not as a guest`, async () => {
    harness.authStore.setState({
      user: { ...signedInUser, displayName },
      isAuthenticated: true,
    });
    const view = await renderScreen();

    assert.equal(view.queryByText(t('more.guestUser')), null);
    assert.equal(view.getAllByText(signedInUser.email).length, 1, 'the email is shown once');
  });
}

test('a signed-in reader sees their name, email and engagement summary', async () => {
  signIn();
  backend.engagement = {
    success: true,
    data: {
      user_id: 'u1',
      total_chapters_read: 10,
      total_listening_minutes: 0,
      total_reading_minutes: 0,
      total_sessions: 1,
      avg_session_minutes: 1,
      current_streak_days: 2,
      longest_streak_days: 17,
      last_active_date: null,
      engagement_score: 88,
      plans_completed: 5,
      prayers_submitted: 0,
      annotations_created: 23,
      updated_at: '2026-09-01T00:00:00.000Z',
    },
  };

  const view = await renderScreen();

  assert.ok(view.getByText('Ruth Reader'));
  assert.ok(view.getByText('reader@example.com'));
  assert.equal(backend.refreshes, 1);
  assert.ok(view.getByText(t('engagement.title')));
  assert.ok(view.getByText('88'));
  assert.ok(view.getByText('17'));
  assert.ok(view.getByText('23'));
  assert.equal(view.queryByRole('button', { name: t('more.signInOrCreate') }), null);
});

const engagementSummary = (listeningMinutes: number): UserEngagementSummary => ({
  user_id: 'u1',
  total_chapters_read: 10,
  total_listening_minutes: listeningMinutes,
  total_reading_minutes: 0,
  total_sessions: 1,
  avg_session_minutes: 1,
  current_streak_days: 2,
  longest_streak_days: 17,
  last_active_date: null,
  engagement_score: 88,
  plans_completed: 5,
  prayers_submitted: 0,
  annotations_created: 23,
  updated_at: '2026-09-01T00:00:00.000Z',
});

test('listening this device has not uploaded yet still shows while the cloud summary lags', async () => {
  signIn();
  useProgressStore.setState({
    listeningMsByDate: { '2026-09-23': 5 * 60_000, '2026-09-24': 7 * 60_000 + 30_000 },
  });
  backend.engagement = { success: true, data: engagementSummary(0) };

  const view = await renderScreen();

  assert.ok(view.getByText(harness.i18n.t('interface.minutesShort', { count: 12 })));
});

test('a cloud listening total that counts other devices wins over this device', async () => {
  signIn();
  useProgressStore.setState({ listeningMsByDate: { '2026-09-24': 12 * 60_000 } });
  backend.engagement = { success: true, data: engagementSummary(95) };

  const view = await renderScreen();

  assert.ok(view.getByText(harness.i18n.t('interface.hoursMinutes', { hours: 1, minutes: 35 })));
  assert.equal(view.queryByText(harness.i18n.t('interface.minutesShort', { count: 12 })), null);
});

test('a failed engagement summary leaves the card out', async () => {
  signIn();

  const view = await renderScreen();

  assert.equal(view.queryByText(t('engagement.title')), null);
});

test('cancelling the photo picker changes nothing', async () => {
  signIn();
  const view = await renderScreen();

  await view.press(view.getByRole('button', { name: t('profile.changeAvatar') }));
  await view.flush();

  assert.equal(picker.launches, 1);
  assert.deepEqual(backend.uploadedUris, []);
  assert.equal(avatarImageUri(view), signedInUser.photoURL);
});

test('the photo picker opens under the privacy lock grace', async () => {
  // iOS can turn the app inactive under the system photo picker; discreet mode must
  // not take that for the reader leaving and lock mid-pick (see privacyLockGrace).
  signIn();
  const view = await renderScreen();

  await view.press(view.getByRole('button', { name: t('profile.changeAvatar') }));
  await view.flush();

  assert.deepEqual(picker.launchesUnderLockGrace, [true]);
});

test('picking a photo shows it while uploading, then saves the uploaded URL on the account', async () => {
  signIn();
  picker.result = { canceled: false, assets: [{ uri: 'file:///picked.jpg' }] };
  backend.upload = deferred();
  const view = await renderScreen();

  // view.press waits inside act for the whole handler, which would hide the
  // in-flight state, so the handler is started in one act and finished in another.
  const avatarButton = view.getByRole('button', { name: t('profile.changeAvatar') });
  let pressing: Promise<void> = Promise.resolve();
  await act(async () => {
    pressing = (avatarButton.props.onPress as () => Promise<void>)();
  });

  assert.equal(avatarImageUri(view), 'file:///picked.jpg');
  assert.ok(view.getByText(t('profile.uploadingAvatar')));
  assert.ok(view.getByRole('button', { name: t('profile.changeAvatar'), disabled: true }));

  const upload = backend.upload;
  await act(async () => {
    upload.resolve({ success: true, data: 'https://cdn.test/avatar-new.jpg' });
    await pressing;
  });

  assert.deepEqual(backend.uploadedUris, ['file:///picked.jpg']);
  assert.deepEqual(backend.profileUpdates, [
    { data: { avatar_url: 'https://cdn.test/avatar-new.jpg' } },
  ]);
  assert.equal(
    (harness.authStore.getState().user as { photoURL: string }).photoURL,
    'https://cdn.test/avatar-new.jpg'
  );
  assert.equal(avatarImageUri(view), 'https://cdn.test/avatar-new.jpg');
  assert.equal(view.queryByText(t('profile.uploadingAvatar')), null);
  assert.deepEqual(harness.rn.__recorded.alerts, []);
});

for (const [scenario, arrange] of [
  [
    'the upload is rejected',
    () => {
      backend.uploadResult = { success: false, error: 'too large' };
    },
  ],
  [
    'the upload throws',
    () => {
      backend.uploadThrows = true;
    },
  ],
  [
    'saving the URL on the account fails',
    () => {
      backend.updateResult = { success: false };
    },
  ],
] as const) {
  test(`when ${scenario}, the old avatar comes back and the reader is told`, async () => {
    signIn();
    picker.result = { canceled: false, assets: [{ uri: 'file:///picked.jpg' }] };
    arrange();
    const view = await renderScreen();

    await view.press(view.getByRole('button', { name: t('profile.changeAvatar') }));
    await view.flush();

    assert.equal(avatarImageUri(view), signedInUser.photoURL);
    assert.equal(
      (harness.authStore.getState().user as { photoURL: string }).photoURL,
      signedInUser.photoURL
    );
    assert.deepEqual(
      harness.rn.__recorded.alerts.map(({ title, message }) => ({ title, message })),
      [{ title: t('common.error'), message: t('profile.avatarUpdateFailed') }]
    );
    assert.ok(view.getByRole('button', { name: t('profile.changeAvatar'), disabled: false }));
  });
}

test('a second tap while the photo picker is opening does not open another picker', async () => {
  signIn();
  picker.open = deferred();
  const view = await renderScreen();
  const avatarButton = view.getByRole('button', { name: t('profile.changeAvatar') });

  let first: Promise<void> = Promise.resolve();
  let second: Promise<void> = Promise.resolve();
  await act(async () => {
    first = (avatarButton.props.onPress as () => Promise<void>)();
  });
  await act(async () => {
    second = (avatarButton.props.onPress as () => Promise<void>)();
  });
  const open = picker.open;
  await act(async () => {
    open.resolve({ canceled: true, assets: [] });
    await Promise.all([first, second]);
  });

  assert.equal(picker.launches, 1);
});

test('a photo picker that fails to open tells the reader instead of failing silently', async () => {
  signIn();
  picker.throws = true;
  const view = await renderScreen();

  await view.press(view.getByRole('button', { name: t('profile.changeAvatar') }));
  await view.flush();

  assert.deepEqual(
    harness.rn.__recorded.alerts.map(({ title, message }) => ({ title, message })),
    [{ title: t('common.error'), message: t('profile.avatarUpdateFailed') }]
  );
  assert.equal(avatarImageUri(view), signedInUser.photoURL);
  // The next tap opens the picker again.
  picker.throws = false;
  await view.press(view.getByRole('button', { name: t('profile.changeAvatar') }));
  assert.equal(picker.launches, 2);
});

test('reading activity opens from the profile', async () => {
  const view = await renderScreen();

  await view.press(view.getByText(t('profile.readingActivity')));

  assert.deepEqual(
    harness.navigation.calls.map((call) => [call.method, call.args[0]]),
    [['navigate', 'ReadingActivity']]
  );
});
