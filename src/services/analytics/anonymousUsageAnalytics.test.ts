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

test('anonymousUsageAnalytics uses the anonymous edge function for delivery', () => {
  const source = readRelativeSource('./anonymousUsageAnalytics.ts');
  assert.match(
    source,
    /functions\.invoke\(\s*['"]track-anonymous-usage-events['"]/,
    'flushAnonymousUsageEvents must invoke track-anonymous-usage-events'
  );
});

test('anonymousUsageAnalytics enriches batches with client geo before delivery', () => {
  const source = readRelativeSource('./anonymousUsageAnalytics.ts');
  assert.match(source, /resolveGeoContext\(\)/, 'anonymous analytics should resolve client geo before delivery');
  assert.match(
    source,
    /attachGeoContext\(event,\s*geoContext\)/,
    'anonymous analytics events should include payload geo when available'
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

test('anonymousUsageAnalytics does not depend on Supabase auth for anonymous events', () => {
  const source = readRelativeSource('./anonymousUsageAnalytics.ts');
  assert.ok(!/supabase\.auth/.test(source), 'anonymous usage analytics should not use supabase.auth');
  assert.ok(!/getUser\(\)/.test(source), 'anonymous usage analytics should not query getUser()');
});

test('anonymousUsageAnalytics guards queue growth and requeues with MAX_QUEUE_SIZE', () => {
  const source = readRelativeSource('./anonymousUsageAnalytics.ts');
  assert.match(source, /MAX_QUEUE_SIZE/, 'MAX_QUEUE_SIZE should be defined');
  assert.match(
    source,
    /MAX_QUEUE_SIZE\s*-\s*eventQueue\.length/,
    'requeueSnapshot should respect MAX_QUEUE_SIZE'
  );
});

test('anonymousUsageAnalytics generates UUIDs with randomUUID fallback', () => {
  const source = readRelativeSource('./anonymousUsageAnalytics.ts');
  assert.match(source, /function generateUUID\s*\(/, 'generateUUID helper must be defined');
  assert.match(source, /randomUUID/, 'should prefer crypto.randomUUID()');
  assert.match(source, /Math\.random/, 'must have Math.random fallback UUID generation');
});
