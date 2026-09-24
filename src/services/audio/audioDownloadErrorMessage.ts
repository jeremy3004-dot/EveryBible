import type { TFunction } from 'i18next';

// Download failures carry English diagnostic messages (HTTP status, URLs, integrity
// details) meant for logs. Screens show readers only what this module translates.

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// Thrown BEFORE any job record is created so a refused download leaves nothing behind. (N25)
export class AudioDownloadInsufficientSpaceError extends Error {
  readonly requiredBytes: number;
  readonly freeBytes: number;

  constructor(requiredBytes: number, freeBytes: number) {
    super(
      `Not enough free space for this audio download. It needs about ${formatBytes(
        requiredBytes
      )} but only ${formatBytes(freeBytes)} is free.`
    );
    this.name = 'AudioDownloadInsufficientSpaceError';
    this.requiredBytes = requiredBytes;
    this.freeBytes = freeBytes;
  }
}

// What a full device looks like when a write fails: POSIX ENOSPC (Android's IOException text,
// Node-style `code`), Cocoa's NSFileWriteOutOfSpaceError (640), and SQLite's SQLITE_FULL.
const OUT_OF_SPACE_MESSAGE =
  /\bENOSPC\b|no space left on device|isn['\u2019]t enough space|not enough (?:free )?(?:space|storage)|out of space|NSFileWriteOutOfSpaceError|NSCocoaErrorDomain Code=640\b|SQLITE_FULL|database or disk is full|insufficient (?:space|storage)/i;

/** Whether a failed write (or anything in its `cause` chain) ran the device out of space. */
export function isOutOfSpaceError(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current != null && !seen.has(current)) {
    seen.add(current);
    if (current instanceof AudioDownloadInsufficientSpaceError) {
      return true;
    }
    const { code, message, cause } = current as {
      code?: unknown;
      message?: unknown;
      cause?: unknown;
    };
    if (
      code === 'ENOSPC' ||
      OUT_OF_SPACE_MESSAGE.test(typeof message === 'string' ? message : String(current))
    ) {
      return true;
    }
    current = cause;
  }
  return false;
}

export function describeAudioDownloadError(error: unknown, t: TFunction): string {
  if (error instanceof AudioDownloadInsufficientSpaceError) {
    return t('bible.audioDownloadInsufficientSpace', {
      required: formatBytes(error.requiredBytes),
      free: formatBytes(error.freeBytes),
    });
  }
  return t('bible.audioDownloadFailed');
}
