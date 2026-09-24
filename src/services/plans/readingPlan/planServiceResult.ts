import { STALE_SYNC_ERROR } from '../../sync/syncIdentity';

export interface PlanServiceResult<T = undefined> {
  success: boolean;
  data?: T;
  error?: string;
  /** Applied on the device; the server write is queued and retries on the next sync. */
  pendingSync?: boolean;
}

/** The answer when the signed-in account changed while the request was in flight. */
export const stalePlanResult = <T = undefined>(): PlanServiceResult<T> => ({
  success: false,
  error: STALE_SYNC_ERROR,
});
