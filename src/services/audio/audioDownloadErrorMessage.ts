import type { TFunction } from 'i18next';

// Download failures carry English diagnostic messages (HTTP status, URLs, integrity
// details) meant for logs. Screens show readers only what this module translates.

export function formatBytes(bytes: number): string {
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

export function describeAudioDownloadError(error: unknown, t: TFunction): string {
  if (error instanceof AudioDownloadInsufficientSpaceError) {
    return t('bible.audioDownloadInsufficientSpace', {
      required: formatBytes(error.requiredBytes),
      free: formatBytes(error.freeBytes),
    });
  }
  return t('bible.audioDownloadFailed');
}
