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

test('usageQueue re-queues events on TRANSIENT failure and skips flush when unconfigured', () => {
  const source = readRelativeSource('./usageQueue.ts');
  // Transient failures still go back on the queue via unshift to preserve order.
  assert.match(
    source,
    /requeueSnapshot\(snapshot\)|eventQueue\.unshift/,
    'transiently-failed events must be re-queued via unshift to preserve ordering'
  );
  assert.match(
    source,
    /isSupabaseConfigured[\s\S]*?return \{ success: true \}/,
    'flush must return early with success when Supabase is not configured'
  );
});

test('usageQueue DROPS the batch on a 4xx (permanent) response instead of requeuing', () => {
  const source = readRelativeSource('./usageQueue.ts');
  // A status classifier distinguishes permanent (4xx) from transient (5xx/network).
  assert.match(
    source,
    /function isPermanentFlushError/,
    'flush must classify errors as permanent vs transient'
  );
  assert.match(
    source,
    /status\s*>=\s*400\s*&&\s*status\s*<\s*500/,
    'a 4xx status must be treated as a permanent/client error'
  );
  // The requeue path is guarded by the permanent-error check, so a 4xx drops.
  assert.match(
    source,
    /isPermanentFlushError\(error\)[\s\S]*?return/,
    'a permanent (4xx) error must short-circuit before requeue (drop the batch)'
  );
});

test('usageQueue caps per-batch retries so a poison batch cannot loop forever', () => {
  const source = readRelativeSource('./usageQueue.ts');
  assert.match(source, /MAX_BATCH_RETRIES\s*=\s*\d+/, 'a per-batch retry cap must be defined');
  assert.match(
    source,
    /retriesSoFar\s*\+\s*1\s*>=\s*MAX_BATCH_RETRIES/,
    'exhausting the retry budget must drop the batch (dead-letter)'
  );
});

test('usageQueue restore validation requires ALL server-required fields', () => {
  const source = readRelativeSource('./usageQueue.ts');
  assert.match(
    source,
    /REQUIRED_EVENT_FIELDS[\s\S]*?event_name[\s\S]*?device_platform[\s\S]*?app_version[\s\S]*?queued_at/,
    'restore must require every field the server requires'
  );
  // Restore filters through the strict validator, not the loose event_name check.
  assert.match(
    source,
    /parsed\.filter\(hasAllRequiredFields\)/,
    'loadPersistedQueue must drop entries missing any required field'
  );
  assert.match(
    source,
    /REQUIRED_EVENT_FIELDS\.every\(\(field\)\s*=>\s*typeof record\[field\]\s*===\s*'string'\)/,
    'validation must confirm each required field is a string'
  );
  // The old loose-only check (event_name alone) must be gone from restore.
  assert.ok(
    !/typeof event\.event_name === 'string'\s*\n?\s*\);/.test(source),
    'restore must no longer accept entries validated by event_name alone'
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

  // Restore is DEFERRED off module-eval (first use), per the startup hot-path
  // rules — a static importer must not pay the MMKV read at cold start.
  assert.match(source, /function ensureQueueRestored/, 'restore must be a deferred first-use helper');
  assert.match(
    source,
    /eventQueue\.push\(\.\.\.loadPersistedQueue\(\)\)/,
    'the deferred restore pushes persisted events'
  );
  assert.ok(
    !/^eventQueue\.push\(\.\.\.loadPersistedQueue\(\)\);/m.test(source),
    'restore must NOT run at module top-level'
  );

  // Write-through: persist after enqueue AND after flush drains/requeues, and
  // enqueue triggers the deferred restore first.
  const enqueueBody = source.slice(
    source.indexOf('export function enqueueUsageEvent'),
    source.indexOf('export async function flushUsageQueue')
  );
  assert.match(enqueueBody, /ensureQueueRestored\(\)/, 'enqueue must trigger the deferred restore');
  assert.match(enqueueBody, /persistQueue\(\)/, 'enqueue must persist write-through');

  const flushBody = source.slice(
    source.indexOf('export async function flushUsageQueue'),
    source.indexOf('export function getPendingUsageEventCount')
  );
  assert.match(flushBody, /persistQueue\(\)/, 'flush must re-persist after drain/requeue');
  // Transient-failure requeue semantics preserved (gated by the permanent-error
  // + retry-cap drop path — see the dedicated 4xx/retry-cap tests above).
  assert.match(flushBody, /requeueSnapshot\(snapshot\)/, 'flush must still requeue on transient failure');
  assert.match(flushBody, /requeueUnlessPoison\(error\)/, 'flush must route failures through the drop-or-requeue guard');
});
