import test, { before, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockMmkvStorage } from '../testing/mockModules';

// Separate file on purpose: `developmentTranslatorReviewPasscode` is computed
// once, at module evaluation, from `__DEV__` and EXPO_PUBLIC_DEV_TRANSLATOR_REVIEW_PASSCODE.
// Both have to be in place before the store module is first imported, so the
// dev-build shape cannot share a file with the release-build shape.
(globalThis as { __DEV__?: boolean }).__DEV__ = true;
process.env.EXPO_PUBLIC_DEV_TRANSLATOR_REVIEW_PASSCODE = '  dev-passcode  ';

const mmkv = mockMmkvStorage(mock);

let useTranslatorReviewStore: typeof import('./translatorReviewStore').useTranslatorReviewStore;

before(async () => {
  ({ useTranslatorReviewStore } = await import('./translatorReviewStore'));
});

const state = () => useTranslatorReviewStore.getState();

test('a dev build with a configured passcode starts with translator review already on', () => {
  assert.equal(state().enabled, true);
  assert.equal(state().accessPasscode, 'dev-passcode');
});

test('the dev passcode is persisted like any other, so a reload keeps translator mode', () => {
  state().markListened('feedback-1');

  const persisted = JSON.parse(mmkv.store.get('translator-review-storage') ?? '{}');
  assert.equal(persisted.state.enabled, true);
  assert.equal(persisted.state.accessPasscode, 'dev-passcode');
});

test('a dev build can still be switched off at runtime', () => {
  state().disable();

  assert.equal(state().enabled, false);
  assert.equal(state().accessPasscode, null);
});
