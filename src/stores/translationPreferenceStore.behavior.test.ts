import test, { mock, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mockMmkvStorage } from '../testing/mockModules';
import type { useTranslationPreferenceStore as TranslationPreferenceStore } from './translationPreferenceStore';

// One mock configuration per file: the store is persisted, so it hydrates from
// this in-memory MMKV the moment the module is first imported.
const mmkv = mockMmkvStorage(mock, {
  'translation-preferences': JSON.stringify({
    state: { pinnedIds: ['bsb'], hiddenIds: ['web'] },
    version: 0,
  }),
});

const STORAGE_KEY = 'translation-preferences';

let useTranslationPreferenceStore: typeof TranslationPreferenceStore;
/** State as hydrated by the very first import, before any test resets it. */
let stateOnFirstImport: { pinnedIds: string[]; hiddenIds: string[] };

const persisted = (): { pinnedIds?: unknown; hiddenIds?: unknown } => {
  const raw = mmkv.store.get(STORAGE_KEY);
  return raw ? JSON.parse(raw).state : {};
};

/** Replace what is on disk and re-run the store's real hydration path. */
const rehydrateFrom = (raw: string | null) => {
  if (raw === null) {
    mmkv.store.delete(STORAGE_KEY);
  } else {
    mmkv.store.set(STORAGE_KEY, raw);
  }
  void useTranslationPreferenceStore.persist.rehydrate();
};

before(async () => {
  ({ useTranslationPreferenceStore } = await import('./translationPreferenceStore'));
  const { pinnedIds, hiddenIds } = useTranslationPreferenceStore.getState();
  stateOnFirstImport = { pinnedIds, hiddenIds };
});

// Every test starts from the empty state, hydrated through the real path.
beforeEach(() => {
  rehydrateFrom(JSON.stringify({ state: { pinnedIds: [], hiddenIds: [] }, version: 0 }));
});

test('a persisted pin and hide list is restored on the first import', () => {
  assert.deepEqual(stateOnFirstImport, { pinnedIds: ['bsb'], hiddenIds: ['web'] });
});

test('pinning a translation adds it and writes it straight through to storage', () => {
  useTranslationPreferenceStore.getState().pin('bsb');

  assert.deepEqual(useTranslationPreferenceStore.getState().pinnedIds, ['bsb']);
  assert.deepEqual(persisted(), { pinnedIds: ['bsb'], hiddenIds: [] });
});

test('pinning several translations keeps them in the order they were pinned', () => {
  const { pin } = useTranslationPreferenceStore.getState();
  pin('bsb');
  pin('web');
  pin('asv');

  assert.deepEqual(useTranslationPreferenceStore.getState().pinnedIds, ['bsb', 'web', 'asv']);
});

test('re-pinning an already pinned translation moves it to the end instead of duplicating it', () => {
  const { pin } = useTranslationPreferenceStore.getState();
  pin('bsb');
  pin('web');
  pin('bsb');

  assert.deepEqual(useTranslationPreferenceStore.getState().pinnedIds, ['web', 'bsb']);
});

test('pinning a hidden translation un-hides it', () => {
  const { hide, pin } = useTranslationPreferenceStore.getState();
  hide('web');
  assert.deepEqual(useTranslationPreferenceStore.getState().hiddenIds, ['web']);

  pin('web');

  assert.deepEqual(useTranslationPreferenceStore.getState().pinnedIds, ['web']);
  assert.deepEqual(useTranslationPreferenceStore.getState().hiddenIds, []);
});

test('unpinning removes only that translation and leaves the hidden list alone', () => {
  const { pin, hide, unpin } = useTranslationPreferenceStore.getState();
  pin('bsb');
  pin('asv');
  hide('web');

  unpin('bsb');

  assert.deepEqual(useTranslationPreferenceStore.getState().pinnedIds, ['asv']);
  assert.deepEqual(useTranslationPreferenceStore.getState().hiddenIds, ['web']);
});

test('unpinning a translation that was never pinned leaves the lists unchanged', () => {
  useTranslationPreferenceStore.getState().pin('bsb');

  useTranslationPreferenceStore.getState().unpin('kjv');

  assert.deepEqual(useTranslationPreferenceStore.getState().pinnedIds, ['bsb']);
  assert.deepEqual(persisted(), { pinnedIds: ['bsb'], hiddenIds: [] });
});

test('hiding a pinned translation drops the pin so it cannot be both at once', () => {
  const { pin, hide } = useTranslationPreferenceStore.getState();
  pin('bsb');
  pin('web');

  hide('bsb');

  assert.deepEqual(useTranslationPreferenceStore.getState().pinnedIds, ['web']);
  assert.deepEqual(useTranslationPreferenceStore.getState().hiddenIds, ['bsb']);
});

test('re-hiding an already hidden translation moves it to the end instead of duplicating it', () => {
  const { hide } = useTranslationPreferenceStore.getState();
  hide('bsb');
  hide('web');
  hide('bsb');

  assert.deepEqual(useTranslationPreferenceStore.getState().hiddenIds, ['web', 'bsb']);
});

test('only the two id lists are persisted, never the action functions', () => {
  useTranslationPreferenceStore.getState().hide('web');

  assert.deepEqual(Object.keys(persisted()).sort(), ['hiddenIds', 'pinnedIds']);
});

test('a first run with nothing in storage starts from two empty lists', () => {
  rehydrateFrom(null);

  assert.deepEqual(useTranslationPreferenceStore.getState().pinnedIds, []);
  assert.deepEqual(useTranslationPreferenceStore.getState().hiddenIds, []);
});

test('a persisted payload missing one list keeps the in-memory default for it', () => {
  rehydrateFrom(JSON.stringify({ state: { pinnedIds: ['bsb'] }, version: 0 }));

  assert.deepEqual(useTranslationPreferenceStore.getState().pinnedIds, ['bsb']);
  assert.deepEqual(useTranslationPreferenceStore.getState().hiddenIds, []);
});

// Named for what actually happens: zustand's persist swallows the parse error
// and never calls setState, so the live lists stay exactly as they were. It does
// not reset them to the defaults — the pin below proves the difference.
test('unparseable storage is ignored and leaves the in-memory lists untouched', () => {
  useTranslationPreferenceStore.getState().pin('bsb');

  rehydrateFrom('} not json {');

  assert.deepEqual(useTranslationPreferenceStore.getState().pinnedIds, ['bsb']);
  assert.deepEqual(useTranslationPreferenceStore.getState().hiddenIds, []);
});

// QUESTION for the lead: persist merges the stored object shallowly and this
// store has no sanitizer, so a corrupted row can replace a list with a non-array
// and the next pin/hide throws. Documented as current behaviour, not changed.
test('a corrupted list survives hydration as-is and breaks the next write', () => {
  rehydrateFrom(JSON.stringify({ state: { pinnedIds: null, hiddenIds: [] }, version: 0 }));

  assert.equal(useTranslationPreferenceStore.getState().pinnedIds, null);
  assert.throws(() => useTranslationPreferenceStore.getState().pin('bsb'), TypeError);
});
