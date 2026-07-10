/**
 * Source-shape tests for the anonymous usage analytics seam.
 *
 * anonymousUsageAnalytics.ts depends on React Native modules (Platform),
 * so these tests validate the contract structurally without importing it.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('anonymousUsageAnalytics exposes the anonymous tracking API surface', () => {
  const source = readRelativeSource('./anonymousUsageAnalytics.ts');

  assert.match(source, /export function trackAnonymousUsageEvent\s*\(/);
  assert.match(source, /export async function flushAnonymousUsageEvents\s*\(/);
  assert.match(source, /export function startAnonymousUsageSession\s*\(/);
  assert.match(source, /export function endAnonymousUsageSession\s*\(/);
  assert.match(source, /export function initAnonymousSessionContext\s*\(/);
  assert.match(source, /export function clearAnonymousSessionContext\s*\(/);
  assert.match(source, /export function getCurrentAnonymousUsageSessionId\s*\(/);
  assert.match(source, /export function getPendingAnonymousUsageEventCount\s*\(/);
});

test('initAnonymousSessionContext does NOT emit session_started', () => {
  // Structural: initAnonymousSessionContext must not call ensureAnonymousSession
  // (which always emits session_started) — it must inline its own id-only init.
  const source = readRelativeSource('./anonymousUsageAnalytics.ts');

  // The function body of initAnonymousSessionContext must not delegate to
  // ensureAnonymousSession(), which unconditionally queues session_started.
  // Extract the function body roughly and check.
  const fnMatch = source.match(/export function initAnonymousSessionContext\s*\(\)[^{]*\{([\s\S]*?)^}/m);
  if (fnMatch) {
    assert.ok(
      !fnMatch[1]?.includes('ensureAnonymousSession'),
      'initAnonymousSessionContext must NOT call ensureAnonymousSession — that emits session_started'
    );
  }

  // Must still assign a UUID to currentAnonymousSessionId
  assert.match(
    source,
    /initAnonymousSessionContext[\s\S]{0,300}currentAnonymousSessionId\s*=\s*generateUUID/,
    'initAnonymousSessionContext must assign a fresh UUID'
  );

  // Must explicitly document that no session_started event is emitted
  assert.match(
    source,
    /No session_started event|no.*session_started|session_started.*not/i,
    'initAnonymousSessionContext should comment that it skips the session_started event'
  );
});

test('clearAnonymousSessionContext sets currentAnonymousSessionId to null without emitting session_ended', () => {
  const source = readRelativeSource('./anonymousUsageAnalytics.ts');

  // Must null out the session id
  assert.match(
    source,
    /clearAnonymousSessionContext[\s\S]{0,200}currentAnonymousSessionId\s*=\s*null/,
    'clearAnonymousSessionContext must set currentAnonymousSessionId to null'
  );

  // Must NOT call buildQueuedEvent / push session_ended inside clearAnonymousSessionContext.
  // Check that the function body does not reference session_ended.
  const clearFnMatch = source.match(/export function clearAnonymousSessionContext\s*\(\)[^{]*\{([\s\S]*?)^}/m);
  if (clearFnMatch) {
    assert.ok(
      !clearFnMatch[1]?.includes('session_ended'),
      'clearAnonymousSessionContext must NOT emit a session_ended event'
    );
  }
});

test('anonymousUsageAnalytics delegates enqueue + flush to the unified usage queue', () => {
  const source = readRelativeSource('./anonymousUsageAnalytics.ts');
  assert.match(source, /from ['"]\.\/usageQueue['"]/, 'facade must delegate to the unified queue');
  assert.match(
    source,
    /enqueueUsageEvent\(eventName, properties, sessionId\)/,
    'trackAnonymousUsageEvent must enqueue onto the shared queue with the anonymous session id'
  );
  assert.match(
    source,
    /return flushUsageQueue\(\)/,
    'flushAnonymousUsageEvents must delegate to the shared flush (single unified endpoint)'
  );
});

test('anonymousUsageAnalytics emits session start/end markers and clears session id', () => {
  const source = readRelativeSource('./anonymousUsageAnalytics.ts');

  assert.match(source, /session_started/, 'session_started event should be queued');
  assert.match(source, /session_ended/, 'session_ended event should be queued');
  assert.match(
    source,
    /currentAnonymousSessionId\s*=\s*null/,
    'endAnonymousUsageSession should clear currentAnonymousSessionId'
  );
});

test('anonymousUsageAnalytics does not depend on Supabase auth (auth is optional in the shared queue)', () => {
  const source = readRelativeSource('./anonymousUsageAnalytics.ts');
  // The anonymous facade never touches auth. The unified queue attaches a token
  // optionally when one exists, but the facade stays auth-free by construction.
  assert.ok(!/supabase\.auth/.test(source), 'anonymous usage facade should not use supabase.auth');
  assert.ok(!/getUser\(/.test(source), 'anonymous usage facade should not query getUser()');
});
