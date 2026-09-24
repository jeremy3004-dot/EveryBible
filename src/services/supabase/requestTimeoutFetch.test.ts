import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  SUPABASE_REQUEST_TIMEOUT_MS,
  createRequestTimeoutFetch,
  type FetchLike,
} from './requestTimeoutFetch';

const BASE = 'https://project.supabase.co';

interface RecordedCall {
  url: string;
  signal: AbortSignal | null | undefined;
}

/** A fetch that never answers on its own, as on a dead Wi-Fi link; it rejects only when aborted. */
function createStalledFetch() {
  const calls: RecordedCall[] = [];
  const fetchImpl: FetchLike = (input, init) => {
    const url = typeof input === 'string' ? input : String(input);
    calls.push({ url, signal: init?.signal });
    return new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        const error = new Error('The operation was aborted.');
        error.name = 'AbortError';
        reject(error);
      });
    });
  };
  return { calls, fetchImpl };
}

test('a REST request that never answers is aborted after the timeout instead of hanging', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const stalled = createStalledFetch();
  const timeoutFetch = createRequestTimeoutFetch(stalled.fetchImpl);

  const pending = timeoutFetch(`${BASE}/rest/v1/prayer_requests?select=*`);
  let settled = false;
  pending.catch(() => {}).finally(() => (settled = true));

  t.mock.timers.tick(SUPABASE_REQUEST_TIMEOUT_MS - 1);
  await Promise.resolve();
  assert.equal(settled, false);

  t.mock.timers.tick(1);
  await assert.rejects(pending, { name: 'AbortError' });
});

test('auth and edge-function requests get the same timeout', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const stalled = createStalledFetch();
  const timeoutFetch = createRequestTimeoutFetch(stalled.fetchImpl);

  const auth = timeoutFetch(`${BASE}/auth/v1/user`);
  const fn = timeoutFetch(`${BASE}/functions/v1/submit-chapter-feedback`, { method: 'POST' });
  t.mock.timers.tick(SUPABASE_REQUEST_TIMEOUT_MS);

  await assert.rejects(auth, { name: 'AbortError' });
  await assert.rejects(fn, { name: 'AbortError' });
});

test('storage transfers are left alone, since a large upload may legitimately run long', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const stalled = createStalledFetch();
  const timeoutFetch = createRequestTimeoutFetch(stalled.fetchImpl);

  void timeoutFetch(`${BASE}/storage/v1/object/avatars/u1/avatar.jpg`, { method: 'POST' });
  t.mock.timers.tick(SUPABASE_REQUEST_TIMEOUT_MS * 10);
  await Promise.resolve();

  assert.equal(stalled.calls.length, 1);
  assert.equal(stalled.calls[0]?.signal, undefined);
});

test('a caller that passes its own abort signal keeps control of the request', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const stalled = createStalledFetch();
  const timeoutFetch = createRequestTimeoutFetch(stalled.fetchImpl);
  const controller = new AbortController();

  const pending = timeoutFetch(`${BASE}/rest/v1/profiles`, { signal: controller.signal });
  t.mock.timers.tick(SUPABASE_REQUEST_TIMEOUT_MS * 2);
  await Promise.resolve();
  assert.equal(stalled.calls[0]?.signal, controller.signal);

  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
});

test('a request that answers in time returns the response and clears its timer', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const response = { ok: true, status: 200 } as Response;
  const clearSpy = mock.method(globalThis, 'clearTimeout');
  const timeoutFetch = createRequestTimeoutFetch(async () => response);

  assert.equal(await timeoutFetch(`${BASE}/rest/v1/profiles`, { method: 'GET' }), response);
  assert.equal(clearSpy.mock.callCount(), 1);
  clearSpy.mock.restore();
});
