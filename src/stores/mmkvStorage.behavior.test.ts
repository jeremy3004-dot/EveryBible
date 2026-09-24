import test, { beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockModule } from '../testing/mockModules';

// The real mmkvStorage.ts with only the native react-native-mmkv class replaced by an
// in-memory one that records its writes.
const backing = new Map<string, string>();
const writes: Array<[string, string]> = [];
/** Native failures to inject: a JSI call that throws, as a broken or full MMKV file does. */
const faults = { read: false, write: false };
class FakeMMKV {
  getString(key: string) {
    if (faults.read) throw new Error('MMKV: failed to read');
    return backing.get(key);
  }
  set(key: string, value: string) {
    if (faults.write) throw new Error('MMKV: no space left on device');
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
  faults.read = false;
  faults.write = false;
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

test('the stored language of an unfinished onboarding is the app default, not a choice, so boot ignores it', async () => {
  const { getPersistedLanguagePreference, AUTH_STORAGE_KEY } = await load();

  // A fresh install persists the default preferences ('en') as soon as auth initialises, and
  // sign-out writes them back. Trusting that value booted a French device in English.
  backing.set(
    AUTH_STORAGE_KEY,
    JSON.stringify({ state: { preferences: { language: 'en', onboardingCompleted: false } } })
  );
  assert.equal(getPersistedLanguagePreference(), null);

  backing.set(
    AUTH_STORAGE_KEY,
    JSON.stringify({ state: { preferences: { language: 'fr', onboardingCompleted: true } } })
  );
  assert.equal(getPersistedLanguagePreference(), 'fr');
});

test('an auth snapshot without a usable language string falls back to the caller default', async () => {
  const { getPersistedLanguagePreference, AUTH_STORAGE_KEY } = await load();

  backing.set(AUTH_STORAGE_KEY, '');
  assert.equal(getPersistedLanguagePreference(), null);
  backing.set(AUTH_STORAGE_KEY, 'null');
  assert.equal(getPersistedLanguagePreference(), null);
  backing.set(AUTH_STORAGE_KEY, JSON.stringify({ version: 3 }));
  assert.equal(getPersistedLanguagePreference(), null);
  backing.set(AUTH_STORAGE_KEY, JSON.stringify({ state: { preferences: { language: 42 } } }));
  assert.equal(getPersistedLanguagePreference(), null);
});

test('every persisted store shares the one MMKV instance the adapter writes through', async () => {
  const { mmkvInstance, zustandStorage } = await load();

  zustandStorage.setItem('bible-storage', '{"state":{}}');

  assert.ok(mmkvInstance instanceof FakeMMKV);
  assert.equal(mmkvInstance.getString('bible-storage'), '{"state":{}}');
});

// ─── Native failures ──────────────────────────────────────────────────────────

interface CounterState {
  count: number;
  bookmarks: string[];
  increment: () => void;
}

/** A persisted store wired exactly like the app's: persist + createJSONStorage(zustandStorage). */
async function createPersistedCounter(name: string) {
  const { zustandStorage } = await load();
  const { create } = await import('zustand');
  const { persist, createJSONStorage } = await import('zustand/middleware');
  return create<CounterState>()(
    persist(
      (set) => ({
        count: 0,
        bookmarks: [],
        increment: () => set((state) => ({ count: state.count + 1 })),
      }),
      { name, storage: createJSONStorage(() => zustandStorage) }
    )
  );
}

const savedCounter = (count: number) =>
  JSON.stringify({ state: { count, bookmarks: ['JHN.3.16'] }, version: 0 });

test('a store whose MMKV read throws at launch starts from its defaults and stays usable', async (t) => {
  t.mock.method(console, 'warn', () => {});
  backing.set('counter-read-fault', savedCounter(7));
  faults.read = true;

  const store = await createPersistedCounter('counter-read-fault');

  assert.equal(store.getState().count, 0);
  assert.deepEqual(store.getState().bookmarks, []);
  faults.read = false;
  assert.doesNotThrow(() => store.getState().increment());
  assert.equal(store.getState().count, 1);
});

test('a blob that could not be read is not overwritten by the defaults for the rest of the session', async (t) => {
  t.mock.method(console, 'warn', () => {});
  backing.set('counter-kept', savedCounter(7));
  faults.read = true;
  const store = await createPersistedCounter('counter-kept');
  faults.read = false;

  // A tap after a transient read failure used to write the default state (count 1, no
  // bookmarks) over everything the reader had saved.
  store.getState().increment();

  assert.equal(backing.get('counter-kept'), savedCounter(7));
  await store.persist.rehydrate();
  assert.equal(store.getState().count, 7, 'the next successful read restores the saved state');
  store.getState().increment();
  assert.equal(
    JSON.parse(backing.get('counter-kept') ?? '{}').state.count,
    8,
    'once the blob has been read, writes resume'
  );
});

test('a store action still succeeds when MMKV cannot write, keeping the change in memory', async (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  const store = await createPersistedCounter('counter-write-fault');
  faults.write = true;

  // An action that throws out of a press handler is a fatal error in a release build.
  assert.doesNotThrow(() => store.getState().increment());
  assert.equal(store.getState().count, 1);
  assert.equal(backing.has('counter-write-fault'), false);
  assert.ok(warn.mock.callCount() > 0, 'the failed write is reported, not silently dropped');

  faults.write = false;
  store.getState().increment();
  assert.equal(JSON.parse(backing.get('counter-write-fault') ?? '{}').state.count, 2);
});

test('a store action still succeeds when the unchanged-payload check cannot read MMKV', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const store = await createPersistedCounter('counter-dedupe-fault');
  store.getState().increment();
  faults.read = true;

  assert.doesNotThrow(() => store.getState().increment());
  faults.read = false;
  assert.equal(
    JSON.parse(backing.get('counter-dedupe-fault') ?? '{}').state.count,
    2,
    'a failed comparison read falls through to the write'
  );
});
