/**
 * Regression test for session-event single-emission + attribution (P1 S4).
 *
 * History: authenticated users once produced DUPLICATE session_started rows
 * (one anonymous, one attributed) because both the anonymous and authenticated
 * session paths ran on foreground (fixed in a46fa0a1). Separately, since ~Jun 29
 * authenticated session rows carried user_id null because session events flowed
 * through the split track-analytics-events/RPC path that dropped attribution.
 *
 * The fix: ALL events (including session_started/ended) now flow through the
 * single unified auth-optional endpoint (P1 S2a/S2b), so a signed-in user's
 * session events carry user_id via the flush-time token. This test locks the
 * App.tsx dedup structure so exactly ONE session_started is emitted per
 * foreground and the duplicate-session regression cannot return.
 *
 * App.tsx imports React Native, so we assert on its source shape (the repo's
 * established approach, e.g. startupBootSurface.test.ts / localeSetupFlowSource).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../App.tsx');

function readAppSource(): string {
  return readFileSync(APP_PATH, 'utf8');
}

// Isolates the foreground closure body (start of startAnalyticsSessions up to
// the start of endAndFlushAnalyticsSessions).
function foregroundBlock(source: string): string {
  const start = source.indexOf('const startAnalyticsSessions');
  const end = source.indexOf('const endAndFlushAnalyticsSessions');
  assert.ok(start >= 0 && end > start, 'App.tsx must define the session foreground/background closures');
  return source.slice(start, end);
}

// Isolates the background closure body (start of endAndFlushAnalyticsSessions up
// to the AppState.currentState guard that follows it).
function backgroundBlock(source: string): string {
  const start = source.indexOf('const endAndFlushAnalyticsSessions');
  const end = source.indexOf('if (AppState.currentState', start);
  assert.ok(start >= 0 && end > start, 'App.tsx must define the background flush closure');
  return source.slice(start, end);
}

test('foreground emits exactly one session_started — auth path never calls the anonymous starter', () => {
  const block = foregroundBlock(readAppSource());
  const [authBranch, unauthBranch] = block.split(/}\s*else\s*{/);

  // Authenticated foreground: establish the anon session_id context WITHOUT an
  // event, then emit the single authenticated session_started.
  assert.match(authBranch, /initAnonymousSessionContext\(\)/, 'auth path must set the anon session id context');
  assert.match(authBranch, /startSession\(\)/, 'auth path must emit exactly one authenticated session_started');
  assert.ok(
    !/startAnonymousUsageSession\(/.test(authBranch),
    'auth path must NOT call startAnonymousUsageSession — that re-introduces the duplicate session_started bug'
  );

  // Unauthenticated foreground: the anonymous path owns the single session_started.
  assert.ok(unauthBranch !== undefined, 'foreground must branch on auth state');
  assert.match(
    unauthBranch,
    /startAnonymousUsageSession\(\)/,
    'unauth path must emit the single anonymous session_started'
  );
});

test('background ends exactly one session — auth path never calls the anonymous ender', () => {
  const block = backgroundBlock(readAppSource());
  const [authBranch, unauthBranch] = block.split(/}\s*else\s*{/);

  // Authenticated background: reset the anon id context (no event) and emit the
  // single authenticated session_ended.
  assert.match(authBranch, /clearAnonymousSessionContext\(\)/, 'auth path must clear the anon session id context');
  assert.match(authBranch, /endSession\(\)/, 'auth path must emit exactly one authenticated session_ended');
  assert.ok(
    !/endAnonymousUsageSession\(/.test(authBranch),
    'auth path must NOT call endAnonymousUsageSession — that emits a duplicate session_ended'
  );

  assert.ok(unauthBranch !== undefined, 'background must branch on auth state');
  assert.match(
    unauthBranch,
    /endAnonymousUsageSession\(\)/,
    'unauth path must emit the single anonymous session_ended'
  );
});

test('foreground reads auth state live so mid-session sign-in/out is attributed correctly', () => {
  const block = foregroundBlock(readAppSource());
  assert.match(
    block,
    /useAuthStore\.getState\(\)\.isAuthenticated/,
    'session path must read auth state live at call time, not from a stale closure'
  );
});
