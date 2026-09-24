export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

// React Native's fetch has no timeout of its own (Android's OkHttp client is
// built with read/connect timeouts of 0), so on a Wi-Fi link that is up but has
// no internet a Supabase request can stay pending forever and every spinner
// waiting on it spins forever. Aborting turns the hang into the same ordinary
// `{ error }` result supabase-js returns for any other network failure.
export const SUPABASE_REQUEST_TIMEOUT_MS = 30_000;

// Storage uploads (avatars, group covers, feedback audio) can legitimately
// run longer than a REST call on a slow link.
const STORAGE_PATH = '/storage/v1/';

function requestUrl(input: string | URL | Request): string {
  if (typeof input === 'string') return input;
  if (typeof Request !== 'undefined' && input instanceof Request) return input.url;
  return String(input);
}

export function createRequestTimeoutFetch(
  baseFetch: FetchLike,
  timeoutMs: number = SUPABASE_REQUEST_TIMEOUT_MS
): FetchLike {
  return (input, init) => {
    if (init?.signal || requestUrl(input).includes(STORAGE_PATH)) {
      return baseFetch(input, init);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return baseFetch(input, { ...init, signal: controller.signal }).finally(() =>
      clearTimeout(timer)
    );
  };
}
