import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { act } from 'react-test-renderer';
import { mockExpoCrypto, mockModule, sourcePath } from '../../testing/mockModules';
import { installRenderHarness } from '../../testing/render';

const harness = installRenderHarness(mock);
mockExpoCrypto(mock);
const secureStore = new Map<string, string>();
mockModule(mock, 'expo-secure-store', {
  getItemAsync: async (key: string) => secureStore.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => secureStore.set(key, value),
  deleteItemAsync: async (key: string) => secureStore.delete(key),
});
const mmkv = new Map<string, string>();
mockModule(mock, sourcePath('stores/mmkvStorage.ts'), {
  mmkvInstance: {
    getString: (key: string) => mmkv.get(key),
    set: (key: string, value: string) => mmkv.set(key, value),
    delete: (key: string) => mmkv.delete(key),
    contains: (key: string) => mmkv.has(key),
  },
});
mockModule(mock, sourcePath('stores/migrateFromAsyncStorage.ts'), {
  migrateFromAsyncStorage: async () => {},
});

test('backgrounding immediately after equals requires a fresh PIN entry on return', async (context) => {
  const { usePrivacyStore } = await import('../../stores/privacyStore');
  const { usePrivacyLock } = await import('../../hooks/usePrivacyLock');
  const { PrivacyLockScreen } = await import('./PrivacyLockScreen');
  secureStore.set(
    'everybible.privacy.settings',
    JSON.stringify({
      mode: 'discreet',
      pinCredential: {
        salt: 'test-salt',
        hash: createHash('sha256').update('test-salt:1234').digest('hex'),
      },
      failedPinAttempts: 0,
      pinLockedUntil: null,
    })
  );
  usePrivacyStore.setState({
    isInitialized: true,
    mode: 'discreet',
    hasPin: true,
    isLocked: true,
    reconcileAppIcon: async () => {},
  });
  harness.rn.AppState.currentState = 'active';
  function LockHost() {
    usePrivacyLock();
    return <PrivacyLockScreen />;
  }
  const view = await harness.render(<LockHost />);
  context.mock.timers.enable({ apis: ['setTimeout'] });
  for (const key of ['1', '2', '3', '4', '=']) {
    await view.press(view.getByRole('button', { name: key }));
  }
  await act(async () => {
    harness.rn.AppState.emit('background');
    harness.rn.AppState.emit('active');
    context.mock.timers.tick(50);
  });
  await view.flush();

  assert.equal(usePrivacyStore.getState().isLocked, true);
});
