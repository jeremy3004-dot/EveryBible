import type { FetchLike } from './requestTimeoutFetch';

/**
 * Stops a signed-out session from coming back through a token refresh.
 *
 * Sign-out ends the session on this device without waiting for auth-js's session lock
 * (see authService.signOut). A refresh of that session can still be under way inside
 * the lock (the auto-refresh tick, or a getSession() behind a request), retrying for
 * about 25 s on a dead connection. If it then succeeded, auth-js would save the old
 * session again and emit TOKEN_REFRESHED, signing the reader back in, possibly over the
 * next account's session. Once sign-out fences a refresh token, a refresh request that
 * carries it is aborted if under way and refused if sent later. Both fail as a network
 * error, which auth-js treats as retryable: it neither saves nor removes the stored
 * session (a non-retryable failure would remove it, and by then it may be another
 * account's).
 *
 * Fenced tokens are kept in memory only, for the rest of this launch.
 */
const fencedRefreshTokens = new Set<string>();
const inFlightRefreshes = new Set<{ refreshToken: string; fence: () => void }>();

const signedOutError = (): TypeError =>
  new TypeError('Network request failed: this session was signed out on this device');

function requestUrl(input: string | URL | Request): string {
  if (typeof input === 'string') return input;
  if (typeof Request !== 'undefined' && input instanceof Request) return input.url;
  return String(input);
}

// auth-js sends a refresh as POST .../token?grant_type=refresh_token with a JSON body.
function refreshTokenOf(input: string | URL | Request, init?: RequestInit): string | null {
  if (!requestUrl(input).includes('grant_type=refresh_token') || typeof init?.body !== 'string') {
    return null;
  }
  try {
    const { refresh_token: token } = JSON.parse(init.body) as { refresh_token?: unknown };
    return typeof token === 'string' && token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

export function fenceRefreshToken(refreshToken: string): void {
  fencedRefreshTokens.add(refreshToken);
  for (const request of inFlightRefreshes) {
    if (request.refreshToken === refreshToken) request.fence();
  }
}

export function createRefreshTokenFencedFetch(baseFetch: FetchLike): FetchLike {
  return (input, init) => {
    const refreshToken = refreshTokenOf(input, init);
    if (refreshToken === null) return baseFetch(input, init);
    if (fencedRefreshTokens.has(refreshToken)) return Promise.reject(signedOutError());

    const controller = new AbortController();
    const callerSignal = init?.signal;
    const abortFromCaller = () => controller.abort();
    if (callerSignal?.aborted) controller.abort();
    else callerSignal?.addEventListener('abort', abortFromCaller);

    // Fails the request even if the network answers after the abort.
    let failFenced: (error: TypeError) => void = () => undefined;
    const fenced = new Promise<never>((_resolve, reject) => {
      failFenced = reject;
    });
    const request = {
      refreshToken,
      fence: () => {
        controller.abort();
        failFenced(signedOutError());
      },
    };
    inFlightRefreshes.add(request);

    return Promise.race([baseFetch(input, { ...init, signal: controller.signal }), fenced]).finally(
      () => {
        inFlightRefreshes.delete(request);
        callerSignal?.removeEventListener('abort', abortFromCaller);
      }
    );
  };
}
