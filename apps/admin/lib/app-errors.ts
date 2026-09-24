import { cache } from 'react';

import { requireAdminIdentity } from '@/lib/admin-auth';
import { analyticsWindowStart } from '@/lib/analytics-window';
import { createAdminServiceClient } from '@/lib/supabase/service';

// Anonymous crash reports from the mobile app (supabase/functions/report-app-errors),
// summarised by get_admin_app_error_summary. Rows hold no user ids or IPs.

export const APP_ERROR_WINDOW_OPTIONS = [7, 30] as const;
export type AppErrorWindowDays = (typeof APP_ERROR_WINDOW_OPTIONS)[number];
const DEFAULT_WINDOW: AppErrorWindowDays = 7;
const TOP_FINGERPRINTS = 50;

export interface AppErrorCount {
  label: string;
  count: number;
}

export interface AppErrorFingerprint {
  fingerprint: string;
  errorName: string;
  message: string;
  screen: string | null;
  kind: string;
  stackFrames: string[];
  componentStack: string | null;
  reportCount: number;
  fatalCount: number;
  installCount: number;
  firstSeen: string | null;
  lastSeen: string | null;
  byVersion: AppErrorCount[];
  byPlatform: AppErrorCount[];
}

export interface AppErrorSummary {
  windowDays: AppErrorWindowDays;
  totals: { reports: number; fatal: number; installs: number; fingerprints: number };
  byVersion: AppErrorCount[];
  byPlatform: AppErrorCount[];
  fingerprints: AppErrorFingerprint[];
}

const getAuthorizedAdminServiceClient = cache(async () => {
  await requireAdminIdentity();
  return createAdminServiceClient();
});

export function normalizeAppErrorWindow(value: unknown): AppErrorWindowDays {
  const parsed = Number(Array.isArray(value) ? value[0] : value);
  return (APP_ERROR_WINDOW_OPTIONS as readonly number[]).includes(parsed)
    ? (parsed as AppErrorWindowDays)
    : DEFAULT_WINDOW;
}

const toNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toText = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function toCounts(value: unknown): AppErrorCount[] {
  if (!isRecord(value)) return [];
  return Object.entries(value)
    .map(([label, count]) => ({ label, count: toNumber(count) }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function toFingerprint(value: unknown): AppErrorFingerprint | null {
  if (!isRecord(value)) return null;
  const fingerprint = toText(value.fingerprint);
  if (!fingerprint) return null;
  return {
    fingerprint,
    errorName: toText(value.errorName) ?? 'Error',
    message: typeof value.message === 'string' ? value.message : '',
    screen: toText(value.screen),
    kind: toText(value.kind) ?? 'error',
    stackFrames: Array.isArray(value.stackFrames)
      ? value.stackFrames.filter((frame): frame is string => typeof frame === 'string')
      : [],
    componentStack: toText(value.componentStack),
    reportCount: toNumber(value.reportCount),
    fatalCount: toNumber(value.fatalCount),
    installCount: toNumber(value.installCount),
    firstSeen: toText(value.firstSeen),
    lastSeen: toText(value.lastSeen),
    byVersion: toCounts(value.byVersion),
    byPlatform: toCounts(value.byPlatform),
  };
}

export async function getAppErrorSummary(
  windowDays: AppErrorWindowDays = DEFAULT_WINDOW
): Promise<AppErrorSummary> {
  const service = await getAuthorizedAdminServiceClient();
  const { data, error } = await service.rpc('get_admin_app_error_summary', {
    p_since: analyticsWindowStart(windowDays),
    p_limit: TOP_FINGERPRINTS,
  });
  if (error) {
    throw new Error(`Unable to load app errors: ${error.message}`);
  }

  const payload = isRecord(data) ? data : {};
  const totals = isRecord(payload.totals) ? payload.totals : {};
  return {
    windowDays,
    totals: {
      reports: toNumber(totals.reports),
      fatal: toNumber(totals.fatal),
      installs: toNumber(totals.installs),
      fingerprints: toNumber(totals.fingerprints),
    },
    byVersion: toCounts(payload.byVersion),
    byPlatform: toCounts(payload.byPlatform),
    fingerprints: (Array.isArray(payload.fingerprints) ? payload.fingerprints : [])
      .map(toFingerprint)
      .filter((row): row is AppErrorFingerprint => row !== null),
  };
}
