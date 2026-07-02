import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAuthRecoveryTokens } from './authRecoveryLink';

test('parseAuthRecoveryTokens extracts access/refresh tokens from a fragment-based recovery link', () => {
  const url =
    'com.everybible.app://reset-password#access_token=abc123&refresh_token=def456&type=recovery';

  assert.deepEqual(parseAuthRecoveryTokens(url), {
    accessToken: 'abc123',
    refreshToken: 'def456',
  });
});

test('parseAuthRecoveryTokens extracts tokens from a query-based recovery link', () => {
  const url =
    'com.everybible.app://reset-password?access_token=abc123&refresh_token=def456&type=recovery';

  assert.deepEqual(parseAuthRecoveryTokens(url), {
    accessToken: 'abc123',
    refreshToken: 'def456',
  });
});

test('parseAuthRecoveryTokens decodes URL-encoded token characters', () => {
  const url =
    'com.everybible.app://reset-password#access_token=abc%2F123&refresh_token=def456&type=recovery';

  assert.deepEqual(parseAuthRecoveryTokens(url), {
    accessToken: 'abc/123',
    refreshToken: 'def456',
  });
});

test('parseAuthRecoveryTokens returns null for non-recovery auth links', () => {
  const url = 'com.everybible.app://reset-password#access_token=abc123&refresh_token=def456&type=signup';

  assert.equal(parseAuthRecoveryTokens(url), null);
});

test('parseAuthRecoveryTokens returns null when tokens are missing', () => {
  assert.equal(parseAuthRecoveryTokens('com.everybible.app://reset-password#type=recovery'), null);
});

test('parseAuthRecoveryTokens returns null for links with no fragment or query', () => {
  assert.equal(parseAuthRecoveryTokens('com.everybible.app://reset-password'), null);
});

test('parseAuthRecoveryTokens returns null for unrelated deep links', () => {
  assert.equal(parseAuthRecoveryTokens('com.everybible.app://bible/jhn/3/16'), null);
});
