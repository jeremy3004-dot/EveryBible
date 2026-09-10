import test, { before, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockMmkvStorage, mockSecureStore } from '../testing/mockModules';

// Separate file on purpose: `developmentTranslatorReviewPasscode` is computed
// once, at module evaluation, from `__DEV__` and EXPO_PUBLIC_DEV_TRANSLATOR_REVIEW_PASSCODE.
// Both have to be in place before the store module is first imported, so the
// dev-build shape cannot share a file with the release-build shape.
(globalThis as { __DEV__?: boolean }).__DEV__ = true;
process.env.EXPO_PUBLIC_DEV_TRANSLATOR_REVIEW_PASSCODE = '  dev-passcode  ';

const mmkv = mockMmkvStorage(mock);
const secureStore = mockSecureStore(mock);
const PASSCODE_KEY = 'everybible.translatorReview.passcode';

let useTranslatorReviewStore: typeof import('./translatorReviewStore').useTranslatorReviewStore;

before(async () => {
  ({ useTranslatorReviewStore } = await import('./translatorReviewStore'));
});

const state = () => useTranslatorReviewStore.getState();

test('a dev build with a configured passcode starts with translator review already on', () => {
  assert.equal(state().enabled, true);
  assert.equal(state().accessPasscode, 'dev-passcode');
});

test('only the enabled flag is persisted — the dev passcode never reaches MMKV', () => {
  state().markListened('feedback-1');

  const raw = mmkv.store.get('translator-review-storage') ?? '{}';
  const persisted = JSON.parse(raw);
  assert.equal(persisted.state.enabled, true);
  assert.equal('accessPasscode' in persisted.state, false);
  assert.equal(raw.includes('dev-passcode'), false);
});

test('the dev passcode is a runtime constant, not a keystore write', async () => {
  // It is recomputed from the env on every dev launch, so there is nothing to
  // persist and nothing to leave behind in the keystore.
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(secureStore.store.has(PASSCODE_KEY), false);
  assert.deepEqual(
    secureStore.calls.filter((call) => call.op === 'set'),
    []
  );
});

test('a dev build can still be switched off at runtime, clearing the keystore entry', async () => {
  secureStore.calls.length = 0;

  state().disable();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(state().enabled, false);
  assert.equal(state().accessPasscode, null);
  assert.deepEqual(
    secureStore.calls.map((call) => call.op),
    ['delete']
  );
});
