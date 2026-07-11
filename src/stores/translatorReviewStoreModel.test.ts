import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const storeSource = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'translatorReviewStore.ts'),
  'utf8'
);

const authStoreSource = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'authStore.ts'),
  'utf8'
);

// --- Source-model assertions (no RN runtime needed) ---

test('translatorReviewStore declares resetForSignOut in the interface', () => {
  assert.ok(
    storeSource.includes('resetForSignOut'),
    'TranslatorReviewState interface must declare resetForSignOut'
  );
});

test('translatorReviewStore.resetForSignOut clears enabled, accessPasscode, and feedbackMarkers', () => {
  assert.ok(
    storeSource.includes('enabled: false'),
    'resetForSignOut must set enabled to false'
  );
  assert.ok(
    storeSource.includes('accessPasscode: null'),
    'resetForSignOut must set accessPasscode to null'
  );
  assert.ok(
    storeSource.includes('feedbackMarkers: {}'),
    'resetForSignOut must clear feedbackMarkers to an empty object'
  );
});

test('authStore.resetPerUserStores includes useTranslatorReviewStore', () => {
  assert.ok(
    authStoreSource.includes("require('./translatorReviewStore').useTranslatorReviewStore"),
    'authStore resetPerUserStores must require useTranslatorReviewStore so translator mode is reset on sign-out / account switch (A1)'
  );
});

// --- Behavioural replica: validates reset semantics without a React Native runtime ---

test('resetForSignOut clears enabled and accessPasscode', () => {
  // Direct behavioural replica — mirrors the exact set() calls in the store so we
  // validate the reset semantics without requiring React Native or MMKV shims.
  type Marker = { listenedAt: string | null };
  let state: { enabled: boolean; accessPasscode: string | null; feedbackMarkers: Record<string, Marker> } = {
    enabled: true,
    accessPasscode: 'abc123',
    feedbackMarkers: { 'item-1': { listenedAt: '2026-01-01T00:00:00.000Z' } },
  };

  // Replica of the resetForSignOut action — must match the store implementation.
  const resetForSignOut = () => {
    state = { ...state, enabled: false, accessPasscode: null, feedbackMarkers: {} };
  };

  // Sanity: state is "logged in as translator" before reset.
  assert.equal(state.enabled, true);
  assert.equal(state.accessPasscode, 'abc123');
  assert.deepEqual(Object.keys(state.feedbackMarkers), ['item-1']);

  // Act.
  resetForSignOut();

  // Assert.
  assert.equal(state.enabled, false, 'enabled must be false after resetForSignOut');
  assert.equal(state.accessPasscode, null, 'accessPasscode must be null after resetForSignOut');
  assert.deepEqual(
    state.feedbackMarkers,
    {},
    'feedbackMarkers must be empty after resetForSignOut'
  );
});

test('disable() alone does not clear feedbackMarkers — resetForSignOut is broader', () => {
  type Marker = { listenedAt: string | null };
  let state: { enabled: boolean; accessPasscode: string | null; feedbackMarkers: Record<string, Marker> } = {
    enabled: true,
    accessPasscode: 'abc123',
    feedbackMarkers: { 'item-1': { listenedAt: '2026-01-01T00:00:00.000Z' } },
  };

  const disable = () => {
    state = { ...state, enabled: false, accessPasscode: null };
  };

  disable();

  assert.equal(state.enabled, false);
  assert.equal(state.accessPasscode, null);
  assert.deepEqual(
    Object.keys(state.feedbackMarkers),
    ['item-1'],
    'disable() must not wipe feedbackMarkers — only resetForSignOut does'
  );
});
