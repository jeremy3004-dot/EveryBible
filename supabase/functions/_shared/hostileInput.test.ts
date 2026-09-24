import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { consumeIngestBudget, LIMITER_TIMEOUT_MS } from './analyticsIngest.ts';
import { consumeAppErrorBudget } from './appErrorIngest.ts';
import {
  isStorableText,
  jsonStorable,
  textFieldsStorable,
  toStorableText,
} from './storableText.ts';

// Shared guards against input Postgres refuses, and against a budget RPC that never answers.
mock.method(console, 'warn', () => undefined);

test('NUL bytes and lone surrogates are unstorable; valid pairs, emoji and RTL are fine', () => {
  for (const text of ['a\u0000b', '\ud800', 'x\udc00', '\udbff\ud800', 'end\ud83d']) {
    assert.equal(isStorableText(text), false, JSON.stringify(text));
  }
  for (const text of ['', '📖', 'قراءة', 'a\u200bb', 'e\u0301', '\u0001\u001f', '\\u0000']) {
    assert.equal(isStorableText(text), true, JSON.stringify(text));
  }
});

test('textFieldsStorable ignores non-strings and checks every string', () => {
  assert.equal(textFieldsStorable([null, undefined, 3, { a: '\u0000' }, 'ok']), true);
  assert.equal(textFieldsStorable(['ok', 'bad\u0000']), false);
});

test('jsonStorable finds NUL and lone surrogates in nested values and keys', () => {
  assert.equal(jsonStorable({ a: [{ b: 'x\u0000' }] }), false);
  assert.equal(jsonStorable({ 'k\u0000': 1 }), false);
  assert.equal(jsonStorable({ a: '\ud800' }), false);
  assert.equal(jsonStorable({ a: '\udfff' }), false);
});

test('jsonStorable accepts literal backslash-u text, pairs and other control characters', () => {
  assert.equal(jsonStorable({ path: 'C:\\u0000', odd: '\\\\u0000' }), true);
  assert.equal(jsonStorable({ emoji: '📖', tab: '\t', bell: '\u0007' }), true);
  assert.equal(jsonStorable(undefined), true);
});

test('jsonStorable rejects values JSON cannot represent', () => {
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  assert.equal(jsonStorable(circular), false);
  assert.equal(jsonStorable({ big: BigInt(1) }), false);
});

test('toStorableText replaces only the unstorable characters', () => {
  assert.equal(toStorableText('a\u0000b\ud800c📖\udc00'), 'a\ufffdb\ufffdc📖\ufffd');
  assert.equal(toStorableText('plain'), 'plain');
});

const hangingRpc = () => {
  let called!: () => void;
  const calledPromise = new Promise<void>((resolve) => (called = resolve));
  return {
    called: calledPromise,
    client: {
      rpc: () => {
        called();
        return new Promise<never>(() => undefined);
      },
      from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }),
    },
  };
};

test('an analytics budget RPC that never answers degrades after the timeout', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const rpc = hangingRpc();
    const pending = consumeIngestBudget(rpc.client, 'key', { events: 1, bytes: 10 });
    await rpc.called;
    mock.timers.tick(LIMITER_TIMEOUT_MS);
    assert.deepEqual(await pending, {
      allowed: true,
      retryAfterSeconds: 0,
      cachedGeo: null,
      mayLookupGeo: false,
      degraded: true,
    });
  } finally {
    mock.timers.reset();
  }
});

test('an app-error budget RPC that never answers refuses the write after the timeout', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const rpc = hangingRpc();
    const pending = consumeAppErrorBudget(rpc.client, 'key', { reports: 1, bytes: 10 });
    await rpc.called;
    mock.timers.tick(LIMITER_TIMEOUT_MS);
    assert.deepEqual(await pending, { allowed: false, retryAfterSeconds: 60, unavailable: true });
  } finally {
    mock.timers.reset();
  }
});

test('a budget RPC that answers in time is used and leaves no timer behind', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const budget = await consumeAppErrorBudget(
      { rpc: async () => ({ data: [{ allowed: true }], error: null }) },
      'key',
      { reports: 1, bytes: 10 }
    );
    assert.deepEqual(budget, { allowed: true, retryAfterSeconds: 0, unavailable: false });
    // A leftover timer would fire here and reject an already-settled race; nothing happens.
    mock.timers.tick(LIMITER_TIMEOUT_MS * 2);
  } finally {
    mock.timers.reset();
  }
});
