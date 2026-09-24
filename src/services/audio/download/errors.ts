/** Error types a download can end with. */
import { AudioDownloadInsufficientSpaceError } from '../audioDownloadErrorMessage';

export class AudioDownloadCancelledError extends Error {
  constructor() {
    super('Audio download was cancelled.');
    this.name = 'AudioDownloadCancelledError';
  }
}

export { AudioDownloadInsufficientSpaceError };

export class AudioDownloadStopError extends Error {
  constructor(error: unknown) {
    super(`Audio download stop failed: ${error instanceof Error ? error.message : String(error)}`);
    this.name = 'AudioDownloadStopError';
  }
}

export function isAudioDownloadCancellation(error: unknown): boolean {
  return error instanceof AudioDownloadCancelledError;
}
