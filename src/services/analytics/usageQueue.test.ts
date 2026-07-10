/**
 * Source-shape tests for the unified analytics ingestion queue.
 *
 * usageQueue.ts imports Platform from react-native which prevents direct module
 * import in pure Node test runs, so these tests validate the contract
 * structurally (mirrors the approach used across this repo's analytics seams).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('usageQueue exposes the unified enqueue/flush/count API', () => {
  const source = readRelativeSource('./usageQueue.ts');
  assert.match(source, /export function enqueueUsageEvent\s*\(/, 'enqueueUsageEvent must be exported');
  assert.match(source, /export async function flushUsageQueue\s*\(/, 'flushUsageQueue must be exported');
  assert.match(source, /export function getPendingUsageEventCount\s*\(/, 'count helper must be exported');
  assert.match(source, /export function generateUUID\s*\(/, 'generateUUID must be exported for the facades');
});

test('usageQueue flushes ALL events through the single unified endpoint', () => {
  const source = readRelativeSource('./usageQueue.ts');
  assert.match(
    source,
    /UNIFIED_USAGE_ENDPOINT\s*=\s*['"]track-anonymous-usage-events['"]/,
    'the unified endpoint must be track-anonymous-usage-events'
  );
  assert.match(
    source,
    /functions\.invoke\(\s*UNIFIED_USAGE_ENDPOINT/,
    'flushUsageQueue must invoke the single unified endpoint'
  );
});

test('usageQueue attaches auth OPTIONALLY (token when present, none when absent)', () => {
  const source = readRelativeSource('./usageQueue.ts');
  assert.match(source, /auth\.getSession\(\)/, 'flush should read the current session for an optional token');
  assert.match(
    source,
    /accessToken\s*\?\s*\{\s*Authorization:\s*`Bearer \$\{accessToken\}`\s*\}\s*:\s*undefined/,
    'flush must send Authorization only when a token exists — never require it'
  );
});

test('usageQueue has NO batch_track_events RPC fallback (server geo is authoritative)', () => {
  const source = readRelativeSource('./usageQueue.ts');
  assert.ok(
    !/\.rpc\(\s*['"]batch_track_events['"]/.test(source),
    'the unified queue must not fall back to the batch_track_events RPC'
  );
});

test('usageQueue enriches every batch with client geo before delivery', () => {
  const source = readRelativeSource('./usageQueue.ts');
  assert.match(source, /resolveGeoContext\(\)/, 'flush should resolve client geo before delivery');
  assert.match(source, /attachGeoContext\(event,\s*geoContext\)/, 'queued events should be enriched with geo');
});

test('usageQueue auto-flushes at AUTO_FLUSH_SIZE and caps at MAX_QUEUE_SIZE', () => {
  const source = readRelativeSource('./usageQueue.ts');
  assert.match(
    source,
    /AUTO_FLUSH_SIZE[\s\S]*?flushUsageQueue|flushUsageQueue[\s\S]*?AUTO_FLUSH_SIZE/,
    'enqueue should trigger flushUsageQueue when the queue hits AUTO_FLUSH_SIZE'
  );
  assert.match(source, /MAX_QUEUE_SIZE/, 'a MAX_QUEUE_SIZE cap must be defined');
  assert.match(
    source,
    /MAX_QUEUE_SIZE\s*-\s*eventQueue\.length/,
    'failed-flush requeue must respect MAX_QUEUE_SIZE to prevent unbounded growth'
  );
});

test('usageQueue re-queues events on delivery failure and skips flush when unconfigured', () => {
  const source = readRelativeSource('./usageQueue.ts');
  assert.match(
    source,
    /requeueSnapshot\(snapshot\)|eventQueue\.unshift/,
    'failed events must be re-queued via unshift to preserve ordering'
  );
  assert.match(
    source,
    /isSupabaseConfigured[\s\S]*?return \{ success: true \}/,
    'flush must return early with success when Supabase is not configured'
  );
});

test('usageQueue generates UUIDs with a randomUUID + Math.random fallback', () => {
  const source = readRelativeSource('./usageQueue.ts');
  assert.match(source, /randomUUID/, 'should prefer crypto.randomUUID()');
  assert.match(source, /Math\.random/, 'must have a Math.random fallback');
});
