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

test('usageQueue is durable: write-through MMKV persistence + load-on-init, capped', () => {
  const source = readRelativeSource('./usageQueue.ts');

  // Capped mirror to bound the write size.
  assert.match(source, /MAX_PERSISTED_EVENTS\s*=\s*\d+/, 'a persisted-events cap must be defined');
  assert.match(
    source,
    /slice\(0,\s*MAX_PERSISTED_EVENTS\)/,
    'persistence must cap how many events are written to disk'
  );

  // Persist + restore go through the shared MMKV instance (guarded require).
  assert.match(source, /function loadPersistedQueue/, 'must define a load-on-init helper');
  assert.match(source, /function persistQueue/, 'must define a write-through persist helper');
  assert.match(source, /mmkvInstance/, 'persistence must use the shared MMKV instance');

  // Load-on-init restores events queued before the last cold start.
  assert.match(
    source,
    /eventQueue\.push\(\.\.\.loadPersistedQueue\(\)\)/,
    'the queue must be restored from disk on module init'
  );

  // Write-through: persist after enqueue AND after flush drains/requeues.
  const enqueueBody = source.slice(
    source.indexOf('export function enqueueUsageEvent'),
    source.indexOf('export async function flushUsageQueue')
  );
  assert.match(enqueueBody, /persistQueue\(\)/, 'enqueue must persist write-through');

  const flushBody = source.slice(
    source.indexOf('export async function flushUsageQueue'),
    source.indexOf('export function getPendingUsageEventCount')
  );
  assert.match(flushBody, /persistQueue\(\)/, 'flush must re-persist after drain/requeue');
  // Requeue-on-failure semantics preserved.
  assert.match(flushBody, /requeueSnapshot\(snapshot\)/, 'flush must still requeue on failure');
});
