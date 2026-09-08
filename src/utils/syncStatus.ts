import type { TFunction } from 'i18next';

// The More header eyebrow and the Reading activity footer both state the same
// fact — "this device, last synced N ago" — so the wording lives in one place.
// The app has no dedicated last-sync clock; `authStore.preferencesUpdatedAt` is
// the closest persisted signal, because the sync cycle stamps it with the
// server's `synced_at` on every pull/push that lands.

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export interface SyncStatus {
  /** UPPERCASE-safe sentence for the account eyebrow ("Synced 2 min ago"). */
  label: string;
  /** Sentence-case footer line ("Source: this device · synced 2 min ago"). */
  sourceLabel: string;
  /** Whether to draw the 6pt success dot beside the eyebrow. */
  isSynced: boolean;
}

export interface SyncStatusInput {
  isAuthenticated: boolean;
  /** ISO timestamp of the last sync, or null when nothing has synced yet. */
  lastSyncedAt: string | null;
  t: TFunction;
  now?: number;
}

function formatSyncRelativeTime(elapsedMs: number, t: TFunction): string {
  if (elapsedMs < MINUTE_MS) {
    return t('more.sync.relativeNow');
  }
  if (elapsedMs < HOUR_MS) {
    return t('more.sync.relativeMinutes', { minutes: Math.floor(elapsedMs / MINUTE_MS) });
  }
  if (elapsedMs < DAY_MS) {
    return t('more.sync.relativeHours', { hours: Math.floor(elapsedMs / HOUR_MS) });
  }
  return t('more.sync.relativeDays', { days: Math.floor(elapsedMs / DAY_MS) });
}

export function describeSyncStatus({
  isAuthenticated,
  lastSyncedAt,
  t,
  now = Date.now(),
}: SyncStatusInput): SyncStatus {
  if (!isAuthenticated) {
    return {
      label: t('more.sync.signInToSync'),
      sourceLabel: t('more.sync.source'),
      isSynced: false,
    };
  }

  const parsed = lastSyncedAt ? new Date(lastSyncedAt).getTime() : Number.NaN;
  if (!Number.isFinite(parsed)) {
    return {
      label: t('more.sync.synced'),
      sourceLabel: t('more.sync.source'),
      isSynced: true,
    };
  }

  const relative = formatSyncRelativeTime(Math.max(0, now - parsed), t);
  return {
    label: t('more.sync.syncedAgo', { relative }),
    sourceLabel: t('more.sync.sourceSynced', { relative }),
    isSynced: true,
  };
}
