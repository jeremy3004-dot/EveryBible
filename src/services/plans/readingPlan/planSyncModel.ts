import {
  buildRemoteReadingPlanProgressPayload,
  canSyncReadingPlanRemotely,
  isEnrolmentEndedBy,
  normalizeRemoteReadingPlanProgress,
  type RemoteReadingPlanProgressRow,
} from '../readingPlanModel';
import type { UserReadingPlanProgress } from '../types';

/** The most plans merge_reading_plan_progress accepts in one call. */
export const PLAN_PROGRESS_MERGE_BATCH_SIZE = 100;

export function shouldSyncPlanProgressRemotely(planId?: string): boolean {
  return planId ? canSyncReadingPlanRemotely(planId) : true;
}

export function normalizeRemoteProgressRows(
  progressList: RemoteReadingPlanProgressRow[]
): UserReadingPlanProgress[] {
  return progressList
    .map((progress) => normalizeRemoteReadingPlanProgress(progress))
    .filter((progress): progress is UserReadingPlanProgress => progress !== null);
}

/** One plan's rows (or all of them), most recently started first. */
export function sortProgressNewestFirst(
  progressList: UserReadingPlanProgress[],
  planId?: string
): UserReadingPlanProgress[] {
  const filtered = planId
    ? progressList.filter((progress) => progress.plan_id === planId)
    : progressList;

  return [...filtered].sort((left, right) => right.started_at.localeCompare(left.started_at));
}

/** The local rows a server tombstone has ended (they started before the leave). */
export function getProgressEndedElsewhere(
  progressList: UserReadingPlanProgress[],
  unenrollments: Map<string, string> | null
): Set<string> {
  return new Set(
    progressList
      .filter((progress) => {
        const unenrolledAt = unenrollments?.get(progress.plan_id);
        return unenrolledAt !== undefined && isEnrolmentEndedBy(progress, unenrolledAt);
      })
      .map((progress) => progress.plan_id)
  );
}

/** The plan ids in the batches the merge function accepts, in order. */
export function batchPlanIds(
  planIds: string[],
  batchSize: number = PLAN_PROGRESS_MERGE_BATCH_SIZE
): string[][] {
  const batches: string[][] = [];
  for (let start = 0; start < planIds.length; start += batchSize) {
    batches.push(planIds.slice(start, start + batchSize));
  }
  return batches;
}

/**
 * Plans to push with this phone's clock (client_clock_at): left at some point, with no stored
 * row, so the enrolment is new to the server and its start was stamped by this phone. A start
 * adopted from a stored row is already on the server's clock and must not be corrected again,
 * nor is a re-join start placed just past the stored leave (see rebaseRejoinPastStoredLeave).
 */
export function getPlansNeedingClientClock(
  planIds: string[],
  unenrollments: Map<string, string> | null,
  storedPlanIds: ReadonlySet<string>,
  liveProgress: readonly UserReadingPlanProgress[] = []
): Set<string> {
  const placedPastLeave = new Set(
    liveProgress
      .filter((progress) => {
        const storedLeftAt = unenrollments?.get(progress.plan_id);
        return storedLeftAt !== undefined && isStartPlacedPastStoredLeave(progress, storedLeftAt);
      })
      .map((progress) => progress.plan_id)
  );
  return new Set(
    planIds.filter(
      (planId) =>
        unenrollments?.has(planId) && !storedPlanIds.has(planId) && !placedPastLeave.has(planId)
    )
  );
}

/**
 * The merge-function payload for these rows. The ones in `clockPlanIds` carry `sentAt`, the
 * phone's clock as the request is built, so the server can read the gap to its own clock as
 * this phone's clock error (migration 20260924112025; older servers ignore it).
 */
export function buildMergeRpcRows(
  progressList: UserReadingPlanProgress[],
  userId: string,
  clockPlanIds: ReadonlySet<string>,
  sentAt: string
) {
  return progressList.map((progress) => {
    const payload = buildRemoteReadingPlanProgressPayload(progress, userId, true);
    return clockPlanIds.has(progress.plan_id) ? { ...payload, client_clock_at: sentAt } : payload;
  });
}

/**
 * The pushed plans the server skipped as ended: skip_ended_reading_plan_progress returns no row
 * for an enrolment a leave has ended, judging a start sent with the phone's clock on the
 * server's clock, which this phone cannot do itself. A pushed plan that did not come back, has
 * a tombstone and is still a live local enrolment was ended.
 */
export function getPlansTheServerSkipped(
  sentPlanIds: string[],
  storedRows: UserReadingPlanProgress[],
  unenrollments: Map<string, string>,
  isLiveEnrolment: (planId: string) => boolean
): string[] {
  const stored = new Set(storedRows.map((row) => row.plan_id));
  return sentPlanIds.filter(
    (planId) => unenrollments.has(planId) && !stored.has(planId) && isLiveEnrolment(planId)
  );
}

/**
 * Whether a snapshot row belongs to an enrolment a leave confirmed during this sync ended. The
 * snapshot may predate the leave, and that row must not be applied or pushed back. A leave with
 * no recorded time ends whatever row the snapshot has.
 */
export function isSnapshotRowEndedByConfirmedLeave(
  progress: UserReadingPlanProgress,
  confirmedLeaves: ReadonlySet<string>,
  leftAtByPlanId: Record<string, string>
): boolean {
  if (!confirmedLeaves.has(progress.plan_id)) {
    return false;
  }
  const leftAt = leftAtByPlanId[progress.plan_id];
  return leftAt === undefined || isEnrolmentEndedBy(progress, leftAt);
}

/** Whether this start is the one rebaseRejoinPastStoredLeave gives: 1 ms past the stored leave. */
export function isStartPlacedPastStoredLeave(
  progress: Pick<UserReadingPlanProgress, 'started_at'>,
  storedLeftAt: string
): boolean {
  const storedLeftMs = Date.parse(storedLeftAt);
  return Number.isFinite(storedLeftMs) && Date.parse(progress.started_at) === storedLeftMs + 1;
}

/**
 * A re-join this phone made after its own leave, moved to 1 ms past that leave as the server
 * stored it; null when it needs no move. The server moves the leave onto its clock (migration
 * 20260924112025) but the re-join's start is still on this phone's: on a phone running slow by
 * more than the time between leaving and re-joining, the re-join would compare as at or before
 * the leave and be dropped as ended, with its never-pushed progress. A start at or before the
 * phone's own leave time is the ended enrolment and is left for the leave to end.
 *
 * The moved start is on the server's clock, so it is pushed without this phone's clock
 * (getPlansNeedingClientClock) and the server judges it against any later leave as it stands.
 * When the stored leave is a later one another phone had already made, the re-join is placed
 * after that too: this phone cannot tell the two apart.
 */
export function rebaseRejoinPastStoredLeave(
  progress: UserReadingPlanProgress,
  leftAt: string | undefined,
  storedLeftAt: string
): UserReadingPlanProgress | null {
  const startedMs = Date.parse(progress.started_at);
  const leftMs = Date.parse(leftAt ?? '');
  const storedLeftMs = Date.parse(storedLeftAt);
  if (
    !Number.isFinite(startedMs) ||
    !Number.isFinite(leftMs) ||
    !Number.isFinite(storedLeftMs) ||
    startedMs <= leftMs ||
    startedMs > storedLeftMs
  ) {
    return null;
  }
  return { ...progress, started_at: new Date(storedLeftMs + 1).toISOString() };
}

/**
 * The server tombstone row for a leave. The leave time (when known) goes with this phone's
 * clock as it is sent, so the server can place the leave on its own clock (migration
 * 20260924112025); `clientClockAt` is omitted for a server without that column.
 */
export function buildPlanTombstoneRow(
  userId: string,
  planId: string,
  unenrolledAt: string | undefined,
  clientClockAt?: string
) {
  return {
    user_id: userId,
    plan_slug: planId,
    ...(unenrolledAt
      ? {
          unenrolled_at: unenrolledAt,
          ...(clientClockAt !== undefined ? { client_clock_at: clientClockAt } : {}),
        }
      : {}),
  };
}
