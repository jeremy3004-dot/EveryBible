import test from 'node:test';
import assert from 'node:assert/strict';
import { createRefreshTokenFencedFetch, fenceRefreshToken } from './authRequestFence';

// auth-js sends a token refresh as POST .../token?grant_type=refresh_token with the
// refresh token in a JSON body (lib/fetch.js _request).
const REFRESH_URL = 'https://project.supabase.co/auth/v1/token?grant_type=refresh_token';
const refreshInit = (refreshToken: string, signal?: AbortSignal): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json;charset=UTF-8' },
  body: JSON.stringify({ refresh_token: refreshToken }),
  signal,
});

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

/** A network that records requests and answers only when told to, whatever the signal says. */
const createNetwork = () => {
  const requests: Array<{ url: string; init?: RequestInit; answer: (r: Response) => void }> = [];
  const fetch = (input: string | URL | Request, init?: RequestInit) => {
    const pending = deferred<Response>();
    requests.push({ url: String(input), init, answer: pending.resolve });
    return pending.promise;
  };
  return { requests, fetch };
};

const refreshed = () => new Response(JSON.stringify({ access_token: 'new' }), { status: 200 });

test('a refresh already in flight for a signed-out session fails, even if the server answers later', async () => {
  const network = createNetwork();
  const fencedFetch = createRefreshTokenFencedFetch(network.fetch);

  const request = fencedFetch(REFRESH_URL, refreshInit('refresh-in-flight'));
  fenceRefreshToken('refresh-in-flight');
  network.requests[0]?.answer(refreshed());

  await assert.rejects(request, TypeError);
  assert.equal(network.requests[0]?.init?.signal?.aborted, true, 'the request itself is aborted');
});

test('a later refresh of a signed-out session never reaches the network', async () => {
  const network = createNetwork();
  const fencedFetch = createRefreshTokenFencedFetch(network.fetch);
  fenceRefreshToken('refresh-signed-out');

  await assert.rejects(fencedFetch(REFRESH_URL, refreshInit('refresh-signed-out')), TypeError);
  assert.equal(network.requests.length, 0);
});

test('refreshes of other sessions and ordinary requests pass through untouched', async () => {
  const network = createNetwork();
  const fencedFetch = createRefreshTokenFencedFetch(network.fetch);
  fenceRefreshToken('refresh-of-someone-else');

  const refresh = fencedFetch(REFRESH_URL, refreshInit('refresh-of-next-account'));
  const logoutInit: RequestInit = { method: 'POST', headers: { Authorization: 'Bearer jwt' } };
  const logout = fencedFetch('https://project.supabase.co/auth/v1/logout?scope=global', logoutInit);
  network.requests[0]?.answer(refreshed());
  network.requests[1]?.answer(new Response(null, { status: 204 }));

  assert.equal((await refresh).status, 200);
  assert.equal((await logout).status, 204);
  assert.equal(
    network.requests[1]?.init,
    logoutInit,
    'a request that is not a refresh is not wrapped'
  );
});

test('the caller can still abort a refresh it started, as the request timeout does', async () => {
  const network = createNetwork();
  const fencedFetch = createRefreshTokenFencedFetch(network.fetch);
  const caller = new AbortController();

  void fencedFetch(REFRESH_URL, refreshInit('refresh-with-timeout', caller.signal)).catch(
    () => undefined
  );
  caller.abort();

  assert.equal(network.requests[0]?.init?.signal?.aborted, true);
});
