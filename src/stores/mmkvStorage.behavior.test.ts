import test, { beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockModule } from '../testing/mockModules';

// The real mmkvStorage.ts with only the native react-native-mmkv class replaced by an
// in-memory one that records its writes.
const backing = new Map<string, string>();
const writes: Array<[string, string]> = [];
class FakeMMKV {
  getString(key: string) {
    return backing.get(key);
  }
  set(key: string, value: string) {
    writes.push([key, value]);
    backing.set(key, value);
  }
  delete(key: string) {
    backing.delete(key);
  }
}
mockModule(mock, 'react-native-mmkv', { MMKV: FakeMMKV });

const load = () => import('./mmkvStorage');

beforeEach(() => {
  backing.clear();
  writes.length = 0;
});

test('the Zustand adapter round-trips values and reports a missing key as null', async () => {
  const { zustandStorage } = await load();

  assert.equal(zustandStorage.getItem('progress-storage'), null);
  zustandStorage.setItem('progress-storage', '{"state":{}}');
  assert.equal(zustandStorage.getItem('progress-storage'), '{"state":{}}');
  zustandStorage.removeItem('progress-storage');
  assert.equal(zustandStorage.getItem('progress-storage'), null);
});

test('persisting an unchanged payload does not rewrite it on every playback tick', async () => {
  const { zustandStorage } = await load();

  zustandStorage.setItem('audio-storage', '{"state":{"lastPosition":5000}}');
  zustandStorage.setItem('audio-storage', '{"state":{"lastPosition":5000}}');
  zustandStorage.setItem('audio-storage', '{"state":{"lastPosition":10000}}');

  assert.deepEqual(
    writes.map(([, value]) => value),
    ['{"state":{"lastPosition":5000}}', '{"state":{"lastPosition":10000}}']
  );
});

test('the persisted interface language is read straight from the auth snapshot', async () => {
  const { getPersistedLanguagePreference, AUTH_STORAGE_KEY } = await load();

  assert.equal(getPersistedLanguagePreference(), null);
  backing.set(AUTH_STORAGE_KEY, JSON.stringify({ state: { preferences: { language: 'ne' } } }));
  assert.equal(getPersistedLanguagePreference(), 'ne');
  backing.set(AUTH_STORAGE_KEY, '{not json');
  assert.equal(getPersistedLanguagePreference(), null);
  backing.set(AUTH_STORAGE_KEY, JSON.stringify({ state: { preferences: { language: '' } } }));
  assert.equal(getPersistedLanguagePreference(), null);
});
