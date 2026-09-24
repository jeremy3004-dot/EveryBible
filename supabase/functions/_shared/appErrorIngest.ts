// Validation and privacy scrubbing for report-app-errors. The app already scrubs and bounds
// every field (src/services/diagnostics/crashReportModel.ts), but this endpoint is public, so
// the server re-applies the same rules and only stores values in the expected shape. Nothing
// that identifies a person is accepted: unknown fields (a user id, an email) are ignored.
//
// Deliberately free of Deno and supabase-js imports so the unit tests can load it directly.
// The scrubbing patterns mirror crashReportModel.ts; appErrorIngest.test.ts pins the parity.

import { getClientIp, resolveQueuedAt, withinLimiterTimeout } from './analyticsIngest.ts';
import { toStorableText } from './storableText.ts';

// A full client request is at most 10 reports of ~2.5 KB each.
export const MAX_APP_ERROR_BODY_BYTES = 64 * 1024;
export const MAX_REPORTS_PER_REQUEST = 20;
export const MAX_MESSAGE_CHARS = 500;
export const MAX_STACK_FRAMES = 8;
export const MAX_COMPONENT_STACK_CHARS = 1000;

// Per source (salted IP hash) per window, and a global ceiling per window across all
// sources. A device sends at most 10 reports a day, so these only bind on abuse.
export const APP_ERROR_RATE_WINDOW_SECONDS = 600;
export const APP_ERROR_MAX_REQUESTS_PER_WINDOW = 30;
export const APP_ERROR_MAX_REPORTS_PER_WINDOW = 100;
export const APP_ERROR_MAX_BYTES_PER_WINDOW = 512 * 1024;
export const APP_ERROR_MAX_GLOBAL_REPORTS_PER_WINDOW = 5000;

const KINDS = new Set(['fatal', 'error', 'boundary', 'rejection']);
const PLATFORMS = new Set(['ios', 'android', 'web']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ERROR_NAME = /^[A-Za-z_$][\w$.]{0,63}$/;
const SCREEN = /^[\w:.[\]-]{1,64}$/;
const STACK_FRAME =
  /^[\w$.<>[\] -]{1,80} \([\w.-]{1,64}\.(?:jsbundle|bundle|hbc):\d{1,9}:\d{1,9}\)$/;
const COMPONENT_NAME = '[A-Za-z_$][\\w$.]{0,63}';
const COMPONENT_STACK = new RegExp(`^${COMPONENT_NAME}(?: < ${COMPONENT_NAME}){0,11}$`);
const APP_VERSION = /^[0-9A-Za-z.+-]{1,32}$/;
const BUILD_NUMBER = /^[0-9A-Za-z.]{1,32}$/;
const OS_VERSION = /^[0-9A-Za-z._ -]{1,32}$/;

const URL_PATTERN = /\b[a-z][a-z0-9+.-]*:\/\/[^\s'"<>()]+/gi;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}(?:\.[A-Za-z0-9_-]*)?/g;
const BEARER_PATTERN = /\bBearer\s+\S+/gi;
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const LONG_TOKEN_PATTERN = /\b[A-Za-z0-9_-]{32,}\b/g;
const LONG_DIGITS_PATTERN = /\d{6,}/g;

function scrubUrl(url: string): string {
  const schemeEnd = url.indexOf('://') + 3;
  let rest = url.slice(schemeEnd);
  const pathStart = rest.search(/[/?#]/);
  const authority = pathStart === -1 ? rest : rest.slice(0, pathStart);
  const at = authority.lastIndexOf('@');
  if (at !== -1) rest = rest.slice(at + 1);
  const queryStart = rest.search(/[?#]/);
  const kept = queryStart === -1 ? rest : `${rest.slice(0, queryStart)}?<redacted>`;
  return `${url.slice(0, schemeEnd)}${kept}`;
}

export function scrubErrorText(text: string, maxChars = MAX_MESSAGE_CHARS): string {
  const scrubbed = text
    .replace(URL_PATTERN, scrubUrl)
    .replace(BEARER_PATTERN, 'Bearer <token>')
    .replace(JWT_PATTERN, '<token>')
    .replace(EMAIL_PATTERN, '<email>')
    .replace(UUID_PATTERN, '<uuid>')
    .replace(LONG_TOKEN_PATTERN, '<token>')
    .replace(LONG_DIGITS_PATTERN, '<n>')
    .replace(/\s+/g, ' ')
    .trim();
  return scrubbed.length > maxChars ? `${scrubbed.slice(0, maxChars - 1)}…` : scrubbed;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Throttle key for a request's source address (trusted edge headers only, see getClientIp),
 * salted and namespaced apart from the analytics keys in the same throttle table.
 */
export function hashAppErrorClientKey(request: Request, salt: string): Promise<string> {
  return sha256Hex(`app-error-ingest:${salt}:${getClientIp(request)}`);
}

/** Groups by error type, message shape (numbers ignored) and screen. */
export async function computeServerFingerprint(
  errorName: string,
  message: string,
  screen: string | null
): Promise<string> {
  return (await sha256Hex(`${errorName}|${message.replace(/\d+/g, '#')}|${screen ?? ''}`)).slice(
    0,
    16
  );
}

export interface AppErrorReportRow {
  id: string;
  occurred_at: string;
  kind: string;
  is_fatal: boolean;
  fingerprint: string;
  error_name: string;
  message: string;
  stack_frames: string[];
  component_stack: string | null;
  screen: string | null;
  app_version: string;
  build_number: string | null;
  platform: string;
  os_version: string | null;
  install_id: string | null;
}

const matching = (value: unknown, pattern: RegExp): string | null =>
  typeof value === 'string' && pattern.test(value) ? value : null;

/**
 * The row to store, or why the report is dropped: 'invalid' (no usable id, kind or time) or
 * 'too_old' (outside the 30-day offline replay window shared with analytics).
 */
export async function normalizeAppErrorReport(
  raw: unknown,
  now: number = Date.now()
): Promise<AppErrorReportRow | 'invalid' | 'too_old'> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return 'invalid';
  const report = raw as Record<string, unknown>;
  const id = matching(report.report_id, UUID_V4);
  const kind = typeof report.kind === 'string' && KINDS.has(report.kind) ? report.kind : null;
  if (!id || !kind) return 'invalid';
  const occurredAt = resolveQueuedAt(report.occurred_at, now);
  if (occurredAt === 'invalid' || occurredAt === 'too_old') return occurredAt;

  const errorName = matching(report.error_name, ERROR_NAME) ?? 'Error';
  // The scrubber mirrors the app's, so it keeps a NUL byte and its 500-character cut can split
  // an emoji into a lone surrogate. Postgres refuses both, which failed the whole batch.
  const message =
    typeof report.message === 'string' ? toStorableText(scrubErrorText(report.message)) : '';
  const screen = matching(report.screen, SCREEN);
  const stackFrames = Array.isArray(report.stack_frames)
    ? report.stack_frames
        .filter((frame): frame is string => typeof frame === 'string' && STACK_FRAME.test(frame))
        .slice(0, MAX_STACK_FRAMES)
    : [];
  const componentStack =
    typeof report.component_stack === 'string' &&
    report.component_stack.length <= MAX_COMPONENT_STACK_CHARS &&
    COMPONENT_STACK.test(report.component_stack)
      ? report.component_stack
      : null;

  return {
    id,
    occurred_at: occurredAt,
    kind,
    is_fatal: kind === 'fatal',
    fingerprint: await computeServerFingerprint(errorName, message, screen),
    error_name: errorName,
    message,
    stack_frames: stackFrames,
    component_stack: componentStack,
    screen,
    app_version: matching(report.app_version, APP_VERSION) ?? 'unknown',
    build_number: matching(report.build_number, BUILD_NUMBER),
    platform:
      typeof report.platform === 'string' && PLATFORMS.has(report.platform)
        ? report.platform
        : 'other',
    os_version: matching(report.os_version, OS_VERSION),
    install_id: matching(report.install_id, UUID),
  };
}

export interface AppErrorBudget {
  allowed: boolean;
  retryAfterSeconds: number;
  /** The limiter could not be consulted; the endpoint then refuses to write. */
  unavailable: boolean;
}

// Structural client type so this module does not import supabase-js.
export interface AppErrorBudgetClient {
  rpc: (
    fn: string,
    args: Record<string, unknown>
  ) => PromiseLike<{ data: unknown; error: unknown }>;
}

/**
 * Charges one request to the source's budget. Fails CLOSED: crash reports stay queued on the
 * device and are retried, so refusing while the limiter is down costs nothing but delay,
 * whereas failing open would leave a public write path without a rate limit.
 */
export async function consumeAppErrorBudget(
  service: AppErrorBudgetClient,
  clientKey: string,
  usage: { reports: number; bytes: number }
): Promise<AppErrorBudget> {
  const unavailable = { allowed: false, retryAfterSeconds: 60, unavailable: true };
  try {
    const { data, error } = await withinLimiterTimeout(
      service.rpc('consume_app_error_ingest_budget', {
        p_client_key: clientKey,
        p_report_count: usage.reports,
        p_byte_count: usage.bytes,
        p_window_seconds: APP_ERROR_RATE_WINDOW_SECONDS,
        p_max_requests: APP_ERROR_MAX_REQUESTS_PER_WINDOW,
        p_max_reports: APP_ERROR_MAX_REPORTS_PER_WINDOW,
        p_max_bytes: APP_ERROR_MAX_BYTES_PER_WINDOW,
        p_max_global_reports: APP_ERROR_MAX_GLOBAL_REPORTS_PER_WINDOW,
      })
    );
    const row = (Array.isArray(data) ? data[0] : data) as
      | { allowed?: unknown; retry_after_seconds?: unknown }
      | null
      | undefined;
    if (error || !row || typeof row.allowed !== 'boolean') return unavailable;
    return {
      allowed: row.allowed,
      retryAfterSeconds: row.allowed ? 0 : Math.max(1, Number(row.retry_after_seconds) || 1),
      unavailable: false,
    };
  } catch {
    return unavailable;
  }
}
