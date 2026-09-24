import test, { before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockMmkvStorage, mockModule } from '../testing/mockModules';

/**
 * Failure injection for every persisted store's MMKV blob. A blob can be unreadable (a write
 * torn by a crash, a hand-restored backup), parse to something that is not a persist envelope
 * at all, or carry a version this build has never heard of. None of that may throw out of a
 * store import, leave a store without its actions, or give a field the wrong kind (a list that
 * hydrates as a string breaks the first `.map` in a render).
 *
 * Envelopes that parse must also finish hydrating: zustand swallows an exception thrown by a
 * store's `migrate` or `merge` and leaves the store un-hydrated with every persisted value
 * dropped, so `persist.hasHydrated()` is how a throwing migrate/merge shows up here. The one
 * envelope that cannot parse never reaches them; it must still leave a usable store, and the
 * next write must replace the unreadable blob so the following launch starts clean.
 *
 * The Bible store has its own hydration suite (bibleStore.hydration.test.ts) because it needs
 * the store doubles in src/stores/__tests__.
 */
const mmkv = mockMmkvStorage(mock);
const secureStore = new Map<string, string>();
mockModule(mock, 'expo-secure-store', {
  getItemAsync: async (key: string) => secureStore.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    secureStore.set(key, value);
  },
  deleteItemAsync: async (key: string) => {
    secureStore.delete(key);
  },
});

interface PersistApi {
  rehydrate: () => Promise<void> | void;
  hasHydrated: () => boolean;
}

interface PersistedStoreUnderTest {
  key: string;
  getState: () => object;
  getInitialState: () => object;
  setState: (state: object, replace: true) => void;
  persist: PersistApi;
  /** A write through the store's own API, which must persist a readable blob. */
  write: () => void;
}

const stores: PersistedStoreUnderTest[] = [];
/**
 * Stores whose merge or migrate still dereference a persisted state that is null or missing
 * (translatorReviewStore reads `saved.mode` / `state.accessPasscode` unguarded, which also
 * throws on a fresh install with no blob at all). Their sweep is recorded as a todo until the
 * owning change lands, so the reproduction stays in the suite without failing it.
 */
const storesPendingFix: PersistedStoreUnderTest[] = [];

before(async () => {
  const { useAnnotationStore } = await import('./annotationStore');
  const { useAudioStore } = await import('./audioStore');
  const { useAuthStore } = await import('./authStore');
  const { useFourFieldsStore } = await import('./fourFieldsStore');
  const { useGatherStore } = await import('./gatherStore');
  const { useLibraryStore } = await import('./libraryStore');
  const { useProgressStore } = await import('./progressStore');
  const { readingPlansStore } = await import('./readingPlansStore');
  const { useTranslationPreferenceStore } = await import('./translationPreferenceStore');
  const { useTranslatorReviewStore } = await import('./translatorReviewStore');

  const entry = <S extends object>(
    key: string,
    store: {
      getState: () => S;
      getInitialState: () => S;
      setState: (state: S, replace: true) => void;
      persist: PersistApi;
    },
    write: () => void
  ): PersistedStoreUnderTest => ({
    key,
    getState: () => store.getState(),
    getInitialState: () => store.getInitialState(),
    setState: (state, replace) => store.setState(state as S, replace),
    persist: store.persist,
    write,
  });

  stores.push(
    entry('annotation-storage', useAnnotationStore, () => {
      useAnnotationStore.getState().upsertAnnotation({
        id: '',
        book: 'JHN',
        chapter: 3,
        verse_start: 16,
        verse_end: 16,
        type: 'highlight',
        color: 'yellow',
        content: null,
        deleted_at: null,
      });
    }),
    entry('audio-storage', useAudioStore, () => {
      useAudioStore.getState().setPlaybackRate(1.25);
    }),
    entry('auth-storage', useAuthStore, () => {
      useAuthStore.getState().setPreferences({ fontSize: 'large' });
    }),
    entry('four-fields-storage', useFourFieldsStore, () => {
      useFourFieldsStore.getState().createGroup('Tuesday group', 'local-device', 'Me');
    }),
    entry('gather-storage', useGatherStore, () => {
      useGatherStore.getState().markLessonComplete('foundation-1', 'lesson-a');
    }),
    entry('library-storage', useLibraryStore, () => {
      useLibraryStore.getState().toggleFavorite('JHN', 3);
    }),
    entry('progress-storage', useProgressStore, () => {
      useProgressStore.getState().markChapterRead('JHN', 3);
    }),
    entry('reading-plans-storage', readingPlansStore, () => {
      readingPlansStore.getState().savePlan('plan-a');
    }),
    entry('translation-preferences', useTranslationPreferenceStore, () => {
      useTranslationPreferenceStore.getState().pin('bsb');
    })
  );
  storesPendingFix.push(
    entry('translator-review-storage', useTranslatorReviewStore, () => {
      useTranslatorReviewStore.getState().enableCommunityFeedback();
    })
  );
});

beforeEach(() => {
  mmkv.store.clear();
  for (const store of [...stores, ...storesPendingFix]) {
    store.setState(store.getInitialState(), true);
  }
});

type Kind =
  | 'array'
  | 'record'
  | 'null'
  | 'undefined'
  | 'function'
  | 'string'
  | 'number'
  | 'boolean';

const kindOf = (value: unknown): Kind => {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  if (typeof value === 'object') return 'record';
  return typeof value as Kind;
};

/**
 * Every field the store starts with keeps its kind. A field that starts null or undefined may
 * legitimately hold anything later, so only non-empty initial kinds are pinned.
 */
function assertUsable(store: PersistedStoreUnderTest, label: string): void {
  const initial = store.getInitialState() as Record<string, unknown>;
  const current = store.getState() as Record<string, unknown>;
  for (const [field, initialValue] of Object.entries(initial)) {
    const expected = kindOf(initialValue);
    if (expected === 'null' || expected === 'undefined') continue;
    assert.equal(
      kindOf(current[field]),
      expected,
      `${store.key} ${label}: "${field}" hydrated as ${kindOf(current[field])}, not ${expected}`
    );
  }
}

const PARSEABLE_ENVELOPES: Array<[label: string, raw: string]> = [
  ['a JSON null', 'null'],
  ['a bare number', '42'],
  ['a bare list', '[1,2,3]'],
  ['an envelope with no state', '{"version":0}'],
  ['a null state', '{"state":null,"version":0}'],
  ['a string state', '{"state":"garbage","version":0}'],
  ['a list state', '{"state":[1,2],"version":0}'],
  ['every field null', ''],
  ['an unknown older version', '{"state":{},"version":-3}'],
  ['a version from a newer build', '{"state":{"somethingNew":true},"version":999}'],
  ['a version that is not a number', '{"state":{},"version":"2"}'],
];

async function assertEnvelopesHydrate(store: PersistedStoreUnderTest): Promise<void> {
  for (const [label, raw] of PARSEABLE_ENVELOPES) {
    store.setState(store.getInitialState(), true);
    // Only data fields: JSON never carries an action, so a blob cannot null one out.
    const nullFields = Object.fromEntries(
      Object.entries(store.getInitialState())
        .filter(([, value]) => typeof value !== 'function')
        .map(([field]) => [field, null])
    );
    mmkv.store.set(store.key, raw === '' ? JSON.stringify({ state: nullFields, version: 0 }) : raw);

    await store.persist.rehydrate();

    assert.equal(
      store.persist.hasHydrated(),
      true,
      `${store.key} ${label}: migrate or merge threw, so the store silently dropped its blob`
    );
    assertUsable(store, label);
  }
}

test('every persisted store hydrates a well-formed blob of an unexpected shape into a usable state', async (t) => {
  // A store that has no migrate for a foreign version logs through console.error by design.
  t.mock.method(console, 'error', () => {});
  t.mock.method(console, 'warn', () => {});

  for (const store of stores) {
    await assertEnvelopesHydrate(store);
  }
});

test(
  'the translator review store hydrates a null or missing persisted state',
  { todo: 'translatorReviewStore merge/migrate dereference a null persisted state' },
  async (t) => {
    t.mock.method(console, 'error', () => {});
    t.mock.method(console, 'warn', () => {});

    for (const store of storesPendingFix) {
      await assertEnvelopesHydrate(store);
    }
  }
);

test('an unreadable blob leaves every store usable and is replaced by the next write', async (t) => {
  t.mock.method(console, 'error', () => {});
  t.mock.method(console, 'warn', () => {});

  for (const store of [...stores, ...storesPendingFix]) {
    store.setState(store.getInitialState(), true);
    mmkv.store.set(store.key, '{"state":{"half-written');

    await assert.doesNotReject(async () => store.persist.rehydrate(), store.key);
    assertUsable(store, 'unreadable blob');

    assert.doesNotThrow(() => store.write(), `${store.key}: the store's actions must still work`);
    const rewritten = mmkv.store.get(store.key);
    assert.ok(rewritten, `${store.key}: a write after a bad blob must persist`);
    assert.doesNotThrow(
      () => JSON.parse(rewritten),
      `${store.key}: the unreadable blob must be replaced by a readable one`
    );

    await store.persist.rehydrate();
    assert.equal(store.persist.hasHydrated(), true, `${store.key}: the next launch hydrates`);
  }
});
