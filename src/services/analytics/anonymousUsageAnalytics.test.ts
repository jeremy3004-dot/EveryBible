/**
 * Source-shape tests for the anonymous usage analytics seam.
 *
 * anonymousUsageAnalytics.ts depends on React Native modules (Platform),
 * so these tests validate the contract structurally without importing it.
 */

import test, { mock } from 'node:test';
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

// A4: background audio resurrects the anonymous session.
// Structural lock — trackAnonymousUsageEvent (the sole path for event-originated
// audio/reading ticks) must NOT route through ensureAnonymousSession, which
// emits session_started. Background audio ticks fire AFTER App.tsx has already
// ended the session on background; a lazy emission there would create an
// unpaired session_started and inflate session counts (violating P1 S4, which
// makes App.tsx the single owner of the session_started/ended pair).
test('A4: trackAnonymousUsageEvent does NOT emit session_started (id-only, no lazy emission)', () => {
  const source = readRelativeSource('./anonymousUsageAnalytics.ts');

  const fnMatch = source.match(
    /export function trackAnonymousUsageEvent\s*\([\s\S]*?\)\s*:\s*void\s*\{([\s\S]*?)^}/m
  );
  assert.ok(fnMatch, 'trackAnonymousUsageEvent must be defined');
  assert.ok(
    !fnMatch![1]?.includes('ensureAnonymousSession('),
    'trackAnonymousUsageEvent must NOT call ensureAnonymousSession() — that emits session_started for background-originated events'
  );

  // Only startAnonymousUsageSession (the real foreground start) may emit
  // session_started via ensureAnonymousSession.
  const starterMatch = source.match(
    /export function startAnonymousUsageSession\s*\(\)[\s\S]*?\{([\s\S]*?)^}/m
  );
  assert.ok(starterMatch, 'startAnonymousUsageSession must be defined');
  assert.match(
    starterMatch![1] ?? '',
    /ensureAnonymousSession\(\)/,
    'startAnonymousUsageSession (the real foreground start) still owns the session_started emission'
  );
});

// Behavioral lock (requires `--experimental-test-module-mocks`). We mock the
// sibling usageQueue so we can import the real facade in Node (it otherwise
// pulls react-native transitively) and observe exactly which events it enqueues.
// If module mocking is unavailable (bare `tsx --test`), the real import throws on
// react-native — we detect that and skip, since the structural tests above cover
// the invariant in that mode.
//
// The queue is mocked ONCE (Node forbids re-mocking the same specifier) with a
// module-scoped log; each behavioral test resets that log + the facade's session
// singleton so the scenarios stay independent.
type Enqueued = { name: string; sessionId: string | null };

const enqueueLog: Enqueued[] = [];
let uuidCounter = 0;
let facadeModule: typeof import('./anonymousUsageAnalytics') | null = null;

async function loadFacade(): Promise<typeof import('./anonymousUsageAnalytics') | null> {
  if (facadeModule) return facadeModule;
  if (typeof (mock as { module?: unknown }).module !== 'function') {
    return null;
  }
  mock.module(new URL('./usageQueue.ts', import.meta.url).pathname, {
    namedExports: {
      enqueueUsageEvent: (name: string, _props: unknown, sessionId: string | null) => {
        enqueueLog.push({ name, sessionId });
      },
      flushUsageQueue: async () => ({ success: true }),
      generateUUID: () => `test-uuid-${++uuidCounter}`,
      getPendingUsageEventCount: () => enqueueLog.length,
    },
  });
  try {
    facadeModule = await import('./anonymousUsageAnalytics');
  } catch {
    // Mock not applied (flag absent) — real usageQueue -> react-native import fails.
    facadeModule = null;
  }
  return facadeModule;
}

// Resets the module-level session singleton + capture log so each scenario runs
// from a clean slate. clearAnonymousSessionContext nulls the id without emitting.
function resetFacade(facade: typeof import('./anonymousUsageAnalytics')): void {
  facade.clearAnonymousSessionContext();
  enqueueLog.length = 0;
}

test('A4: a background audio tick does NOT emit a second session_started (unauth path)', async (t) => {
  const facade = await loadFacade();
  if (!facade) {
    t.skip('module mocking unavailable (run with --experimental-test-module-mocks)');
    return;
  }
  resetFacade(facade);

  // Real foreground start (App.tsx unauth path): exactly one session_started.
  const foregroundId = facade.startAnonymousUsageSession();
  assert.equal(
    enqueueLog.filter((e) => e.name === 'session_started').length,
    1,
    'foreground start emits exactly one session_started'
  );

  // App backgrounds: unauth path emits the single session_ended and nulls the id.
  facade.endAnonymousUsageSession();
  assert.equal(facade.getCurrentAnonymousUsageSessionId(), null, 'background clears the session id');
  assert.equal(
    enqueueLog.filter((e) => e.name === 'session_ended').length,
    1,
    'background emits exactly one session_ended'
  );

  // Background audio keeps JS running: a progress tick fires AFTER the session
  // ended. It must NOT mint a new session_started.
  facade.trackAnonymousUsageEvent('audio_playback_progress', { position_seconds: 42 });
  facade.trackAnonymousUsageEvent('audio_completed', {});

  assert.equal(
    enqueueLog.filter((e) => e.name === 'session_started').length,
    1,
    'background audio ticks must NOT emit a second session_started'
  );

  // The ticks still carry a valid (fresh, silently-created) session_id so the
  // rows are attributable — just without originating a lifecycle event.
  const tick = enqueueLog.find((e) => e.name === 'audio_playback_progress');
  assert.ok(tick && typeof tick.sessionId === 'string', 'the tick still carries a session_id');
  assert.notEqual(tick!.sessionId, foregroundId, 'a new id was created silently for post-session ticks');

  facade.endAnonymousUsageSession();
});

test('A4: background audio tick emits NO session_started for the authenticated path', async (t) => {
  const facade = await loadFacade();
  if (!facade) {
    t.skip('module mocking unavailable (run with --experimental-test-module-mocks)');
    return;
  }
  resetFacade(facade);

  // Auth path (App.tsx): establish the anon id context WITHOUT an event; the
  // authenticated analytics path owns session_started separately.
  facade.initAnonymousSessionContext();
  // App backgrounds: auth path clears the anon id context (no anon session_ended).
  facade.clearAnonymousSessionContext();
  assert.equal(facade.getCurrentAnonymousUsageSessionId(), null, 'auth background clears the anon id');

  // Background audio tick after the context was cleared.
  facade.trackAnonymousUsageEvent('audio_playback_progress', {});

  assert.equal(
    enqueueLog.filter((e) => e.name === 'session_started').length,
    0,
    'the anonymous facade must never emit session_started on the authenticated path'
  );

  facade.clearAnonymousSessionContext();
});

test('foreground after background audio emits a new paired session start exactly once', async (t) => {
  const facade = await loadFacade();
  if (!facade) { t.skip('module mocking unavailable'); return; }
  resetFacade(facade);
  facade.startAnonymousUsageSession();
  facade.endAnonymousUsageSession();
  facade.trackAnonymousUsageEvent('audio_playback_progress', { listened_ms: 30000 });
  const nextId = facade.startAnonymousUsageSession();
  facade.startAnonymousUsageSession();
  facade.endAnonymousUsageSession();
  assert.equal(enqueueLog.filter(e => e.name === 'session_started').length, 2);
  assert.equal(enqueueLog.filter(e => e.name === 'session_ended').length, 2);
  assert.equal(enqueueLog.at(-1)?.sessionId, nextId);
});
