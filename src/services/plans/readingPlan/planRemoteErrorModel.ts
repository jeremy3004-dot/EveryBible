/**
 * How the server says it is older than this release. Each check names the migration whose
 * absence it detects; the callers fall back to the write that server still accepts.
 */
interface RemoteError {
  code?: string;
  message?: string;
}

/**
 * PostgREST (PGRST205) or Postgres (42P01) reporting that a table does not exist:
 * the app shipped before migration 20260924023340 was applied.
 */
export const isMissingTableError = (error: RemoteError | null | undefined): boolean =>
  error?.code === 'PGRST205' || error?.code === '42P01';

const isMissingColumnError = (error: RemoteError | null | undefined, column: RegExp): boolean =>
  Boolean(
    error &&
    (error.code === 'PGRST204' || error.code === '42703') &&
    column.test(error.message ?? '')
  );

/**
 * PostgREST (PGRST204) or Postgres (42703) refusing the tombstone's client_clock_at
 * column: the server predates migration 20260924112025.
 */
export const isMissingClockColumnError = (error: RemoteError | null | undefined): boolean =>
  isMissingColumnError(error, /client_clock_at/);

/**
 * PostgREST (PGRST204) or Postgres (42703) refusing a payload column: the app
 * shipped before migration 20260924023342 added the session-tick columns.
 */
export const isMissingSessionColumnError = (error: RemoteError | null | undefined): boolean =>
  isMissingColumnError(error, /completed_sessions|current_session/);

/**
 * PostgREST (PGRST202, HTTP 404) or Postgres (42883) reporting that the merge
 * function does not exist: the app shipped before migration 20260924035821.
 */
export const isMissingMergeRpcError = (
  error: RemoteError | null | undefined,
  httpStatus: number | undefined
): boolean =>
  Boolean(error) && (error?.code === 'PGRST202' || error?.code === '42883' || httpStatus === 404);

/** PostgREST's answer to .single() when the statement returned no row. */
export const isNoRowForSingleError = (error: RemoteError | null | undefined): boolean =>
  error?.code === 'PGRST116';
