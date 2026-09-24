import { isTimeoutError } from '../diagnostics/crashReportModel';

/**
 * The chapter load was abandoned at its deadline. Named `TimeoutError` so every error
 * classifier (retry here, crash reporting) reads it as a timeout.
 */
export class AudioLoadTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Chapter audio did not load within ${Math.round(timeoutMs / 1000)} s`);
    this.name = 'TimeoutError';
  }
}

// A dropped or missing connection, as iOS (NSURLError -1003/-1004/-1005/-1009) and
// Android (OkHttp / ExoPlayer) word it.
const CONNECTION_FAILURE =
  /network connection was lost|not connected to the internet|appears to be offline|could not connect to the server|cannot find host|unable to resolve host|UnknownHostException|ConnectException|ENOTFOUND|ECONNRESET|ECONNREFUSED|network request failed|\(-100[3459]\)|\s-100[3459]\b/i;

// The server answered and does not have the file: asking again will not change that.
const MISSING_FILE = /\b404\b|\b410\b|not found|file does not exist|\s-1100\b|\(-1100\)/i;

const messageOf = (error: unknown): string | null => {
  if (typeof error !== 'object' || error === null) return null;
  const { message } = error as { message?: unknown };
  return typeof message === 'string' ? message : null;
};

/**
 * Whether a failed chapter load is worth one more attempt: it ran out of time or lost
 * the connection. A cold chapter on the media CDN can take long enough to first byte
 * that the first request times out while the edge fetches it, and the second is served
 * warm. A missing file, an undecodable one or a cancelled load is not retried.
 */
export function shouldRetryAudioLoad(error: unknown): boolean {
  const message = messageOf(error);
  if (message !== null && MISSING_FILE.test(message)) return false;
  if (error instanceof AudioLoadTimeoutError) return true;
  if (message === null) return false;
  return isTimeoutError(error) || CONNECTION_FAILURE.test(message);
}
