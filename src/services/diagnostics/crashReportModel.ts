/**
 * Pure helpers that turn a caught error into the privacy-scrubbed report sent to
 * the `report-app-errors` edge function. No RN, MMKV or network imports, so the
 * rules are unit tested directly (crashReportModel.test.ts).
 *
 * What leaves the device: error name, a scrubbed and truncated message, the top
 * JS-bundle stack frames (function name + bundle file name only, never device
 * paths), React component names, the screen/route name, app version and build,
 * platform and OS version, and a random per-install id. Never a user id, email,
 * note text, or verse content. The server re-applies the same limits.
 */

export type CrashReportKind = 'fatal' | 'error' | 'boundary' | 'rejection';

interface CrashReportDevice {
  appVersion: string;
  buildNumber: string | null;
  platform: string;
  osVersion: string | null;
  installId: string | null;
}

export interface AppErrorReport {
  report_id: string;
  occurred_at: string;
  kind: CrashReportKind;
  is_fatal: boolean;
  error_name: string;
  message: string;
  stack_frames: string[];
  component_stack: string | null;
  screen: string | null;
  /** Client-side grouping key, used only for on-device dedupe; the server recomputes its own. */
  fingerprint: string;
  app_version: string;
  build_number: string | null;
  platform: string;
  os_version: string | null;
  install_id: string | null;
}

const MAX_MESSAGE_CHARS = 500;
const MAX_STACK_FRAMES = 8;
const MAX_COMPONENT_NAMES = 12;
export const MAX_CRASH_REPORTS_PER_DAY = 10;
/**
 * Handled errors (reportHandledError) may only use the first half of the daily budget, so
 * a noisy catch site can never crowd out the crashes that follow it.
 */
export const MAX_HANDLED_REPORTS_PER_DAY = 5;

const URL_PATTERN = /\b[a-z][a-z0-9+.-]*:\/\/[^\s'"<>()]+/gi;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}(?:\.[A-Za-z0-9_-]*)?/g;
const BEARER_PATTERN = /\bBearer\s+\S+/gi;
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const LONG_TOKEN_PATTERN = /\b[A-Za-z0-9_-]{32,}\b/g;
const LONG_DIGITS_PATTERN = /\d{6,}/g;
// A labelled secret (`passcode=4821`, `"pin":"1234"`). Translator passcodes and the privacy
// PIN are too short for the digit rule. Bare `token` is left alone: parser errors say
// "Unexpected token: }" and the character is the useful part.
const LABELLED_SECRET_PATTERN =
  /\b(passcode|password|passwd|pin|secret|access_token|refresh_token|id_token|auth_token|api_?key)(["']?\s*[:=]\s*["']?)[^\s"',;&}]+/gi;

function scrubUrl(url: string): string {
  const schemeEnd = url.indexOf('://') + 3;
  let rest = url.slice(schemeEnd);
  const pathStart = rest.search(/[/?#]/);
  const authority = pathStart === -1 ? rest : rest.slice(0, pathStart);
  const at = authority.lastIndexOf('@');
  if (at !== -1) {
    rest = rest.slice(at + 1);
  }
  const queryStart = rest.search(/[?#]/);
  const kept = queryStart === -1 ? rest : `${rest.slice(0, queryStart)}?<redacted>`;
  return `${url.slice(0, schemeEnd)}${kept}`;
}

const isHighSurrogate = (code: number) => code >= 0xd800 && code <= 0xdbff;
const isLowSurrogate = (code: number) => code >= 0xdc00 && code <= 0xdfff;

/**
 * Postgres cannot store U+0000 or a lone UTF-16 surrogate; either one in a report used to
 * fail the whole upload batch. NULs are dropped and lone surrogates become U+FFFD. A loop
 * rather than a lookbehind regex, so it behaves the same on every Hermes version.
 */
function toStorableText(text: string): string {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code === 0) continue;
    if (isHighSurrogate(code) && i + 1 < text.length && isLowSurrogate(text.charCodeAt(i + 1))) {
      result += text[i] + text[i + 1];
      i += 1;
    } else if (isHighSurrogate(code) || isLowSurrogate(code)) {
      result += '\ufffd';
    } else {
      result += text[i];
    }
  }
  return result;
}

/**
 * Cuts to at most `maxChars` UTF-16 units (the server's limit) on a code point boundary,
 * so an emoji at the cut is dropped whole instead of leaving half a surrogate pair.
 */
function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  let end = Math.max(0, maxChars - 1);
  if (end > 0 && isHighSurrogate(text.charCodeAt(end - 1))) end -= 1;
  return `${text.slice(0, end)}…`;
}

/** Removes personal data and secrets from free text, collapses whitespace and truncates. */
export function scrubErrorText(text: string, maxChars = MAX_MESSAGE_CHARS): string {
  const scrubbed = toStorableText(text)
    .replace(URL_PATTERN, scrubUrl)
    .replace(BEARER_PATTERN, 'Bearer <token>')
    .replace(LABELLED_SECRET_PATTERN, '$1$2<redacted>')
    .replace(JWT_PATTERN, '<token>')
    .replace(EMAIL_PATTERN, '<email>')
    .replace(UUID_PATTERN, '<uuid>')
    .replace(LONG_TOKEN_PATTERN, '<token>')
    .replace(LONG_DIGITS_PATTERN, '<n>')
    .replace(/\s+/g, ' ')
    .trim();
  return truncateText(scrubbed, maxChars);
}

const V8_FRAME = /^at\s+(?:(.+?)\s+\()?(?:address at\s+)?(.+?):(\d+):(\d+)\)?$/;
const JSC_FRAME = /^(.*?)@(.+?):(\d+):(\d+)$/;
const BUNDLE_FILE = /\.(?:jsbundle|bundle|hbc)$/;

function bundleFileName(location: string): string | null {
  const withoutQuery = location.split(/[?&]/)[0].replace(/\/+$/, '');
  const name = withoutQuery.slice(withoutQuery.lastIndexOf('/') + 1);
  return BUNDLE_FILE.test(name) ? name : null;
}

function cleanFunctionName(raw: string | undefined): string {
  const cleaned = (raw ?? '')
    .replace(/[^\w$.<>[\] -]/g, '')
    .trim()
    .slice(0, 80);
  return cleaned || 'anonymous';
}

/** Top JS-bundle frames as `fn (bundle:line:col)`. Native and library-file frames are dropped. */
export function extractBundleFrames(
  stack: string | null | undefined,
  max = MAX_STACK_FRAMES
): string[] {
  if (!stack) return [];
  const frames: string[] = [];
  for (const rawLine of stack.split('\n')) {
    if (frames.length >= max) break;
    const line = rawLine.trim();
    const match = V8_FRAME.exec(line) ?? JSC_FRAME.exec(line);
    if (!match) continue;
    const file = bundleFileName(match[2]);
    if (!file) continue;
    frames.push(`${cleanFunctionName(match[1])} (${file}:${match[3]}:${match[4]})`);
  }
  return frames;
}

/** React component stack reduced to component names, innermost first. */
export function summarizeComponentStack(
  componentStack: string | null | undefined,
  max = MAX_COMPONENT_NAMES
): string | null {
  if (!componentStack) return null;
  const names: string[] = [];
  for (const rawLine of componentStack.split('\n')) {
    if (names.length >= max) break;
    const match = /^(?:in|at)\s+([A-Za-z_$][\w$.]{0,63})/.exec(rawLine.trim());
    if (match) names.push(match[1]);
  }
  return names.length > 0 ? names.join(' < ') : null;
}

/** `screen:BibleReader` → `BibleReader`; other boundary scopes are kept in brackets. */
export function screenFromBoundaryScope(scope: string | undefined): string {
  if (scope?.startsWith('screen:')) return scope.slice('screen:'.length);
  return `[${scope ?? 'app'}]`;
}

// cyrb53: small, fast, non-cryptographic. Hermes has no crypto.subtle, and this key
// only has to group identical errors on one device.
function cyrb53(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const value = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return value.toString(16).padStart(14, '0');
}

/** Groups by error type, message shape (numbers ignored) and screen. */
export function computeCrashFingerprint(
  errorName: string,
  message: string,
  screen: string | null
): string {
  return cyrb53(`${errorName}|${message.replace(/\d+/g, '#')}|${screen ?? ''}`);
}

const HANDLED_SOURCE = /^[A-Za-z][\w.-]{0,31}$/;

/** A catch-site label such as `audio.load`; anything else becomes `unknown`. */
export function toHandledErrorSource(source: unknown): string {
  return typeof source === 'string' && HANDLED_SOURCE.test(source) ? source : 'unknown';
}

const TRANSIENT_NETWORK_NAMES = new Set(['AbortError', 'TimeoutError']);
const TRANSIENT_NETWORK_MESSAGE =
  /network request failed|network ?error|failed to fetch|timed out|timeout|aborted|offline|not connected to the internet|unable to resolve host|ENOTFOUND|ECONNRESET|ECONNREFUSED|NSURLErrorDomain|UnknownHostException|SocketTimeoutException/i;

/**
 * Offline, timeouts and cancellations are expected on phones and say nothing about a bug,
 * so handled-error reporting skips them (uncaught ones are still reported as crashes).
 */
export function isTransientNetworkError(error: unknown): boolean {
  try {
    if (typeof error !== 'object' || error === null) {
      return typeof error === 'string' && TRANSIENT_NETWORK_MESSAGE.test(error);
    }
    const { name, message } = error as { name?: unknown; message?: unknown };
    return (
      (typeof name === 'string' && TRANSIENT_NETWORK_NAMES.has(name)) ||
      (typeof message === 'string' && TRANSIENT_NETWORK_MESSAGE.test(message))
    );
  } catch {
    return false;
  }
}

const TIMEOUT_NAMES = new Set(['TimeoutError']);
// -1001 is NSURLErrorTimedOut. AVFoundation often reports it only as a failure reason
// ("An unknown error occurred (-1001)") under its own -11800 error.
const TIMEOUT_MESSAGE = /timed out|timeout|\(-1001\)|\s-1001\b|NSURLErrorTimedOut/i;

/** Whether an error is a request or load that ran out of time (a subset of transient errors). */
export function isTimeoutError(error: unknown): boolean {
  try {
    if (typeof error !== 'object' || error === null) {
      return typeof error === 'string' && TIMEOUT_MESSAGE.test(error);
    }
    const { name, message } = error as { name?: unknown; message?: unknown };
    return (
      (typeof name === 'string' && TIMEOUT_NAMES.has(name)) ||
      (typeof message === 'string' && TIMEOUT_MESSAGE.test(message))
    );
  } catch {
    return false;
  }
}

const ERROR_NAME = /^[A-Za-z_$][\w$.]{0,63}$/;
const SCREEN_NAME = /^[\w:.[\]-]{1,64}$/;

function bounded(value: string | null | undefined, max = 32): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

export interface CrashReportInput {
  error: unknown;
  kind: CrashReportKind;
  screen: string | null;
  componentStack?: string | null;
  /** Catch-site label for a handled error; prefixed to the message as `[source]`. */
  source?: string | null;
  occurredAt: number;
  reportId: string;
  device: CrashReportDevice;
}

export function buildCrashReport(input: CrashReportInput): AppErrorReport {
  const { error } = input;
  const isError = error instanceof Error;
  const errorName = isError ? (ERROR_NAME.test(error.name) ? error.name : 'Error') : 'NonError';
  let rawMessage: string;
  try {
    // Plain `{ message, code }` rejections (common from native modules) keep their message.
    const objectMessage =
      !isError && typeof error === 'object' && error !== null
        ? (error as { message?: unknown }).message
        : undefined;
    rawMessage = isError
      ? error.message
      : typeof objectMessage === 'string'
        ? objectMessage
        : String(error);
  } catch {
    rawMessage = '';
  }
  const message = scrubErrorText(
    input.source ? `[${toHandledErrorSource(input.source)}] ${rawMessage}` : rawMessage
  );
  const screen = input.screen && SCREEN_NAME.test(input.screen) ? input.screen : null;
  return {
    report_id: input.reportId,
    occurred_at: new Date(input.occurredAt).toISOString(),
    kind: input.kind,
    is_fatal: input.kind === 'fatal',
    error_name: errorName,
    message,
    stack_frames: isError ? extractBundleFrames(error.stack) : [],
    component_stack: summarizeComponentStack(input.componentStack),
    screen,
    fingerprint: computeCrashFingerprint(errorName, message, screen),
    app_version: bounded(input.device.appVersion) ?? 'unknown',
    build_number: bounded(input.device.buildNumber),
    platform: bounded(input.device.platform) ?? 'unknown',
    os_version: bounded(input.device.osVersion),
    install_id: input.device.installId,
  };
}

export interface CrashReportBudget {
  day: string;
  count: number;
}

/**
 * Same fingerprint once per JS session, and at most MAX_CRASH_REPORTS_PER_DAY per
 * device per UTC day, so a crash loop or a render error in a list cannot flood
 * the collector or the user's data plan. Mutates `seen` when admitted.
 */
export function admitCrashReport(
  budget: CrashReportBudget,
  seen: Set<string>,
  fingerprint: string,
  day: string,
  maxPerDay = MAX_CRASH_REPORTS_PER_DAY
): { admitted: boolean; budget: CrashReportBudget } {
  const current = budget.day === day ? budget : { day, count: 0 };
  if (seen.has(fingerprint) || current.count >= maxPerDay) {
    return { admitted: false, budget: current };
  }
  seen.add(fingerprint);
  return { admitted: true, budget: { day, count: current.count + 1 } };
}
