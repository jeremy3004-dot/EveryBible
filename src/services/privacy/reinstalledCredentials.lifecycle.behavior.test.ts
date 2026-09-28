import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockMmkvStorage, mockModule, sourcePath } from '../../testing/mockModules';

const sessionKey = 'sb-reinstallbarrier-auth-token';
const mmkv = mockMmkvStorage(mock);
const values = new Map<string, string>([[sessionKey, 'old-session']]);
let releaseDelete!: () => void;
let deleteStarted!: () => void;
const started = new Promise<void>((resolve) => {
  deleteStarted = resolve;
});
const deletion = new Promise<void>((resolve) => {
  releaseDelete = resolve;
});
let failVerifier = true;
let sessionDeletes = 0;
mockModule(mock, 'expo-secure-store', {
  getItemAsync: async (key: string) => values.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    values.set(key, value);
  },
  deleteItemAsync: async (key: string) => {
    if (key === sessionKey) {
      sessionDeletes += 1;
      deleteStarted();
      await deletion;
    }
    if (key === sessionKey + '-code-verifier' && failVerifier)
      throw new Error('native deletion refused');
    values.delete(key);
  },
});
mockModule(mock, sourcePath('services/startup/publicRuntimeConfig.ts'), {
  publicRuntimeConfig: { EXPO_PUBLIC_SUPABASE_URL: 'https://reinstallbarrier.supabase.co' },
});
const asyncStorage: { getItem: () => Promise<null>; default?: unknown } = {
  getItem: async () => null,
};
asyncStorage.default = asyncStorage;
mockModule(mock, '@react-native-async-storage/async-storage', { default: asyncStorage });
mockModule(mock, sourcePath('services/privacy/privacyService.ts'), {
  clearPrivacySettings: async () => {},
});
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

test('an early fresh-install cleanup failure drains every admitted native deletion before retry', async () => {
  const { initializePrivacyInstallationOnStartup } = await import('./privacyInstallationAdapter');
  let settled = false;
  const first = initializePrivacyInstallationOnStartup();
  const failed = assert.rejects(first, { name: 'PrivacyInstallationResetError' });
  void first.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    }
  );
  await started;
  await flush();
  const retryWhilePending = initializePrivacyInstallationOnStartup();
  void retryWhilePending.catch(() => {});
  await flush();
  assert.equal(
    settled,
    false,
    'cleanup must not release its owner while a native deletion is active'
  );
  assert.equal(retryWhilePending, first, 'retry joins the still-running cleanup owner');
  assert.equal(sessionDeletes, 1);
  assert.equal(mmkv.store.has('everybible.privacy.installation.v1'), false);
  releaseDelete();
  await failed;
  failVerifier = false;
  await initializePrivacyInstallationOnStartup();
  assert.equal(mmkv.store.get('everybible.privacy.installation.v1'), '1');
  assert.equal(values.has(sessionKey), false);
});
