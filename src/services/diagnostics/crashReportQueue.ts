import { mmkvInstance } from '../../stores/mmkvStorage';
import { canReportUsage, subscribeToReportingPolicy } from '../analytics/reportingPolicy';
import {
  admitCrashReport,
  buildCrashReport,
  type AppErrorReport,
  type CrashReportBudget,
  type CrashReportKind,
} from './crashReportModel';

/**
 * Remote crash reporting. Errors are scrubbed (crashReportModel) and written to
 * MMKV synchronously, because a fatal handler may be the last JS that runs; the
 * upload happens later, under the same foreground/unmetered-network policy as
 * usage analytics, usually on the next launch for fatals.
 *
 * Reports go to `report-app-errors` with the project's public key as
 * Authorization, so the signed-in user's token is never sent with them. Only a
 * random per-install id identifies the device.
 */
export const CRASH_REPORT_ENDPOINT = 'report-app-errors';
const QUEUE_KEY = 'diagnostics-crash-report-queue-v1';
const BUDGET_KEY = 'diagnostics-crash-report-budget-v1';
const INSTALL_ID_KEY = 'diagnostics-install-id';
const MAX_PENDING_REPORTS = 20;
const MAX_REPORTS_PER_REQUEST = 10;
const MAX_REQUESTS_PER_FLUSH = 2;

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let sessionFingerprints = new Set<string>();
let flushPromise: Promise<CrashReportFlushResult> | null = null;

export interface CrashReportFlushResult {
  success: boolean;
  sent: number;
  deferred?: boolean;
}

function generateUUID(): string {
  const webCrypto = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (typeof webCrypto?.randomUUID === 'function') {
    return webCrypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function isReport(value: unknown): value is AppErrorReport {
  if (!value || typeof value !== 'object') return false;
  const report = value as Partial<AppErrorReport>;
  return (
    typeof report.report_id === 'string' &&
    UUID_V4.test(report.report_id) &&
    typeof report.occurred_at === 'string' &&
    typeof report.message === 'string' &&
    typeof report.kind === 'string' &&
    Array.isArray(report.stack_frames)
  );
}

function readQueue(): AppErrorReport[] {
  try {
    const raw = mmkvInstance.getString(QUEUE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(isReport) : [];
  } catch {
    return [];
  }
}

function writeQueue(reports: AppErrorReport[]): void {
  try {
    if (reports.length === 0) {
      mmkvInstance.delete(QUEUE_KEY);
    } else {
      mmkvInstance.set(QUEUE_KEY, JSON.stringify(reports.slice(-MAX_PENDING_REPORTS)));
    }
  } catch {
    // Best effort: losing a crash report must never cause another crash.
  }
}

function readBudget(): CrashReportBudget {
  try {
    const raw = mmkvInstance.getString(BUDGET_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<CrashReportBudget>) : null;
    if (parsed && typeof parsed.day === 'string' && typeof parsed.count === 'number') {
      return { day: parsed.day, count: parsed.count };
    }
  } catch {
    // Corrupt budget: start a fresh day.
  }
  return { day: '', count: 0 };
}

function getInstallId(): string | null {
  try {
    const existing = mmkvInstance.getString(INSTALL_ID_KEY);
    if (existing && UUID_V4.test(existing)) return existing;
    const created = generateUUID();
    mmkvInstance.set(INSTALL_ID_KEY, created);
    return created;
  } catch {
    return null;
  }
}

// Lazy so a native module missing under tests (or a broken config) degrades to
// "unknown" instead of throwing inside an error handler.
function getPlatform(): { os: string; version: string | null } {
  try {
    const { Platform } = require('react-native') as typeof import('react-native');
    return {
      os: Platform.OS,
      version: Platform.Version == null ? null : String(Platform.Version),
    };
  } catch {
    return { os: 'unknown', version: null };
  }
}

function getAppVersions(os: string): { appVersion: string; buildNumber: string | null } {
  try {
    // Same lookup as the More screen's version footer.
    const Constants = require('expo-constants').default as {
      nativeBuildVersion?: string | null;
      expoConfig?: {
        version?: string;
        ios?: { buildNumber?: string | null };
        android?: { versionCode?: number | null };
      } | null;
    };
    const config = Constants?.expoConfig;
    const configuredBuild =
      os === 'android' ? config?.android?.versionCode : config?.ios?.buildNumber;
    return {
      appVersion: config?.version ?? 'unknown',
      buildNumber:
        Constants?.nativeBuildVersion ?? (configuredBuild == null ? null : String(configuredBuild)),
    };
  } catch {
    return { appVersion: 'unknown', buildNumber: null };
  }
}

function getCurrentScreen(): string | null {
  try {
    const { rootNavigationRef } =
      require('../../navigation/rootNavigation') as typeof import('../../navigation/rootNavigation');
    return rootNavigationRef.isReady() ? (rootNavigationRef.getCurrentRoute()?.name ?? null) : null;
  } catch {
    return null;
  }
}

export interface QueueCrashReportInput {
  error: unknown;
  kind: CrashReportKind;
  /** Screen for boundary errors; global errors use the current route. */
  screen?: string | null;
  componentStack?: string | null;
}

/**
 * Synchronous and never throws: runs inside the global error handler and
 * ErrorBoundary.componentDidCatch. Development builds do not report.
 */
export function queueCrashReport(input: QueueCrashReportInput): void {
  try {
    if (typeof __DEV__ !== 'undefined' && __DEV__) return;
    const now = Date.now();
    const platform = getPlatform();
    const { appVersion, buildNumber } = getAppVersions(platform.os);
    const report = buildCrashReport({
      error: input.error,
      kind: input.kind,
      screen: input.screen !== undefined ? input.screen : getCurrentScreen(),
      componentStack: input.componentStack,
      occurredAt: now,
      reportId: generateUUID(),
      device: {
        appVersion,
        buildNumber,
        platform: platform.os,
        osVersion: platform.version,
        installId: getInstallId(),
      },
    });
    const day = new Date(now).toISOString().slice(0, 10);
    const admission = admitCrashReport(readBudget(), sessionFingerprints, report.fingerprint, day);
    if (!admission.admitted) return;
    mmkvInstance.set(BUDGET_KEY, JSON.stringify(admission.budget));
    writeQueue([...readQueue(), report]);
    // A fatal error is about to take the app down; send it on the next launch.
    if (input.kind !== 'fatal') {
      void flushCrashReports().catch(() => undefined);
    }
  } catch {
    // Reporting is best effort and must never throw from an error handler.
  }
}

function isPermanentUploadError(error: unknown): boolean {
  const status = (error as { context?: { status?: number } } | null)?.context?.status;
  return status === 400 || status === 413 || status === 422;
}

async function uploadPending(): Promise<CrashReportFlushResult> {
  const { supabase, isSupabaseConfigured, getSupabasePublicKey } =
    require('../supabase') as typeof import('../supabase');
  if (!isSupabaseConfigured()) return { success: true, sent: 0, deferred: true };
  let sent = 0;
  for (let request = 0; request < MAX_REQUESTS_PER_FLUSH; request++) {
    const batch = readQueue().slice(0, MAX_REPORTS_PER_REQUEST);
    if (batch.length === 0) break;
    if (!canReportUsage()) return { success: true, sent, deferred: true };
    const { error } = await supabase.functions.invoke(CRASH_REPORT_ENDPOINT, {
      body: { reports: batch },
      headers: { Authorization: `Bearer ${getSupabasePublicKey()}` },
    });
    if (error && !isPermanentUploadError(error)) return { success: false, sent };
    const delivered = new Set(batch.map((report) => report.report_id));
    writeQueue(readQueue().filter((report) => !delivered.has(report.report_id)));
    if (!error) sent += batch.length;
  }
  return { success: true, sent };
}

export function flushCrashReports(): Promise<CrashReportFlushResult> {
  if (flushPromise) return flushPromise;
  if (!canReportUsage()) return Promise.resolve({ success: true, sent: 0, deferred: true });
  flushPromise = uploadPending()
    .catch(() => ({ success: false, sent: 0 }))
    .finally(() => {
      flushPromise = null;
    });
  return flushPromise;
}

/** Owned by AppRuntimeEffects: uploads pending reports whenever reporting is allowed. */
export function installCrashReporting(): () => void {
  const unsubscribe = subscribeToReportingPolicy(() => {
    if (canReportUsage()) void flushCrashReports();
  });
  void flushCrashReports();
  return unsubscribe;
}

export function getPendingCrashReportCount(): number {
  return readQueue().length;
}

/** Test seam: start a new JS session (and optionally keep what is on disk). */
export function resetCrashReportSessionForTests(options: { keepStorage?: boolean } = {}): void {
  sessionFingerprints = new Set();
  flushPromise = null;
  if (!options.keepStorage) {
    writeQueue([]);
  }
}
